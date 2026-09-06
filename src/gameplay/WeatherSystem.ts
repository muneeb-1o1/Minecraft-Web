import * as THREE from 'three';
import { DayNightCycle } from './DayNightCycle';
import { SoundManager } from '../audio/SoundManager';

export type WeatherType = 'clear' | 'rain' | 'thunder';

export class WeatherSystem {
  public scene: THREE.Scene;
  public sounds: SoundManager;
  public currentWeather: WeatherType = 'clear';

  // Rain particle system
  private rainParticleCount = 2800;
  private rainGeometry: THREE.BufferGeometry;
  private rainMaterial: THREE.PointsMaterial;
  private rainPoints: THREE.Points;
  private rainVelocities: Float32Array;

  // Weather state & transitions
  public rainIntensity: number = 0.0; // 0 (clear) to 1 (full storm)
  private targetRainIntensity: number = 0.0;
  private thunderTimer: number = 10;
  public lightningIntensity: number = 0.0;
  private lightningFlashTimer: number = 0.0;
  private lightningMaxDuration: number = 0.32;
  private originalSunIntensity: number = 1.25;

  constructor(scene: THREE.Scene, sounds: SoundManager) {
    this.scene = scene;
    this.sounds = sounds;

    // Create rain particles around player
    const positions = new Float32Array(this.rainParticleCount * 3);
    this.rainVelocities = new Float32Array(this.rainParticleCount);

    const radius = 24;
    const height = 24;

    for (let i = 0; i < this.rainParticleCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * radius * 2;
      positions[i * 3 + 1] = Math.random() * height;
      positions[i * 3 + 2] = (Math.random() - 0.5) * radius * 2;
      this.rainVelocities[i] = 18.0 + Math.random() * 8.0; // Falling speed
    }

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Particle sprite (elongated droplet texture)
    let rainTexture: THREE.CanvasTexture;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createLinearGradient(8, 0, 8, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
      grad.addColorStop(0.5, 'rgba(180, 215, 255, 0.6)');
      grad.addColorStop(1, 'rgba(210, 235, 255, 0.9)');
      ctx.fillStyle = grad;
      ctx.fillRect(6, 0, 4, 32);
      rainTexture = new THREE.CanvasTexture(canvas);
    } else {
      rainTexture = new THREE.CanvasTexture({} as HTMLCanvasElement);
    }

    this.rainMaterial = new THREE.PointsMaterial({
      map: rainTexture,
      size: 0.65,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.rainPoints = new THREE.Points(this.rainGeometry, this.rainMaterial);
    this.rainPoints.visible = false;
    this.scene.add(this.rainPoints);
  }

  public setWeather(type: WeatherType) {
    this.currentWeather = type;
    if (type === 'clear') {
      this.targetRainIntensity = 0.0;
      this.sounds.stopRainSound();
      this.lightningIntensity = 0.0;
      this.lightningFlashTimer = 0.0;
    } else if (type === 'rain') {
      this.targetRainIntensity = 0.75;
      this.sounds.startRainSound(0.75);
      this.lightningIntensity = 0.0;
      this.lightningFlashTimer = 0.0;
    } else if (type === 'thunder') {
      this.targetRainIntensity = 1.0;
      this.sounds.startRainSound(1.0);
      this.thunderTimer = 2.5 + Math.random() * 4.0;
      // Trigger an opening lightning flash to announce the thunderstorm
      this.triggerLightning(true);
    }
  }

  // Trigger an instantaneous flash of brilliant white celestial illumination and thunderclap
  public triggerLightning(forceImmediateThunder: boolean = false) {
    this.lightningFlashTimer = this.lightningMaxDuration;
    this.lightningIntensity = 1.0;

    // Delayed thunder boom based on distance (sharp crackle for close strikes)
    const isClose = forceImmediateThunder || Math.random() < 0.45;
    const delayMs = isClose ? (25 + Math.random() * 60) : (180 + Math.random() * 550);

    setTimeout(() => {
      this.sounds.playThunderSound();
    }, delayMs);
  }

  public getLightningIntensity(): number {
    return this.lightningIntensity;
  }

  public isLightningActive(): boolean {
    return this.lightningIntensity > 0.01;
  }

  public update(dt: number, playerPos: THREE.Vector3, dayNight: DayNightCycle) {
    // Smoothly interpolate rain intensity
    if (Math.abs(this.rainIntensity - this.targetRainIntensity) > 0.005) {
      this.rainIntensity = THREE.MathUtils.lerp(this.rainIntensity, this.targetRainIntensity, dt * 1.5);
      this.rainMaterial.opacity = this.rainIntensity * 0.72;
      this.sounds.setRainIntensity(this.rainIntensity);
    }

    const isRaining = this.rainIntensity > 0.02;
    this.rainPoints.visible = isRaining;

    if (isRaining) {
      // Center rain volume around player
      this.rainPoints.position.x = playerPos.x;
      this.rainPoints.position.z = playerPos.z;

      // Animate raindrops falling
      const posAttr = this.rainGeometry.attributes.position as THREE.BufferAttribute;
      const positions = posAttr.array as Float32Array;
      const height = 24;
      const radius = 24;

      for (let i = 0; i < this.rainParticleCount; i++) {
        const idx = i * 3;
        // Move downward
        positions[idx + 1] -= this.rainVelocities[i] * dt;
        // Slight wind shear
        positions[idx + 0] += 1.5 * dt;

        // Reset particle if below player
        if (positions[idx + 1] < -4) {
          positions[idx + 1] = height;
          positions[idx + 0] = (Math.random() - 0.5) * radius * 2;
          positions[idx + 2] = (Math.random() - 0.5) * radius * 2;
        }
      }
      posAttr.needsUpdate = true;

      // Base storm daylight dimming
      const stormDim = 1.0 - this.rainIntensity * 0.55;
      dayNight.sunLight.intensity = this.originalSunIntensity * stormDim;

      // Thunderstorm lightning strikes
      if (this.currentWeather === 'thunder') {
        this.thunderTimer -= dt;

        if (this.thunderTimer <= 0) {
          // Trigger dynamic lightning flash across the world
          this.thunderTimer = 6 + Math.random() * 12;
          this.triggerLightning();
        }
      }

      // Multi-stroke lightning flash decay simulation
      if (this.lightningFlashTimer > 0) {
        this.lightningFlashTimer -= dt;
        const t = Math.max(0, this.lightningFlashTimer / this.lightningMaxDuration);

        // Realistic multi-stroke lightning flash (initial blinding flash + secondary rebound)
        let flash = 0;
        if (t > 0.55) {
          const sub = (t - 0.55) / 0.45;
          flash = Math.pow(sub, 0.55);
        } else {
          flash = Math.sin((t / 0.55) * Math.PI) * 0.78;
        }

        this.lightningIntensity = Math.max(0, Math.min(1, flash));
        dayNight.setLightningFlash(this.lightningIntensity);
      } else {
        this.lightningIntensity = 0.0;
        dayNight.setLightningFlash(0.0);
      }
    } else {
      dayNight.sunLight.intensity = this.originalSunIntensity;
      this.lightningIntensity = 0.0;
      dayNight.setLightningFlash(0.0);
    }
  }
}
