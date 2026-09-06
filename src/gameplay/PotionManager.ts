import * as THREE from 'three';
import { Player } from '../player/Player';
import { SoundManager } from '../audio/SoundManager';
import { ItemId } from '../world/BlockTypes';

export enum PotionType {
  SPEED = 'speed',
  FIRE_RESISTANCE = 'fire_resistance',
  HEALING = 'healing',
  NIGHT_VISION = 'night_vision',
  STRENGTH = 'strength'
}

export interface ActivePotionEffect {
  type: PotionType;
  name: string;
  duration: number;
  maxDuration: number;
  color: string;
  badgeHex: string;
  icon: string;
}

export class PotionManager {
  private player: Player;
  private scene: THREE.Scene;
  private sounds: SoundManager;

  public activeEffects: Map<PotionType, ActivePotionEffect> = new Map();
  private hudContainer!: HTMLElement;
  private particleGroup: THREE.Group;
  private swirlTimer: number = 0;

  constructor(player: Player, scene: THREE.Scene, sounds: SoundManager) {
    this.player = player;
    this.scene = scene;
    this.sounds = sounds;

    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    this.initHUD();
  }

  private initHUD() {
    let container = document.getElementById('potion-effects-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'potion-effects-container';
      container.style.position = 'fixed';
      container.style.top = '18px';
      container.style.right = '18px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      container.style.zIndex = '500';
      container.style.pointerEvents = 'none';
      container.style.fontFamily = "'Minecraft', 'Inter', monospace";
      document.body.appendChild(container);
    }
    this.hudContainer = container;
  }

  // Attempt to drink a held potion item
  public drinkPotion(itemId: number): boolean {
    let effectType: PotionType | null = null;
    let name = '';
    let duration = 180; // 3 minutes
    let color = '#ffffff';
    let badgeHex = '#333333';
    let icon = '🧪';

    switch (itemId) {
      case ItemId.POTION_HEALING:
        effectType = PotionType.HEALING;
        name = 'Instant Health';
        duration = 0; // Instant
        color = '#ff3838';
        badgeHex = '#c0392b';
        icon = '💖';
        break;
      case ItemId.POTION_SPEED:
        effectType = PotionType.SPEED;
        name = 'Speed';
        duration = 180;
        color = '#00d2d3';
        badgeHex = '#00a8ff';
        icon = '⚡';
        break;
      case ItemId.POTION_FIRE_RESISTANCE:
        effectType = PotionType.FIRE_RESISTANCE;
        name = 'Fire Resistance';
        duration = 180;
        color = '#ff9f43';
        badgeHex = '#e67e22';
        icon = '🔥';
        break;
      case ItemId.POTION_NIGHT_VISION:
        effectType = PotionType.NIGHT_VISION;
        name = 'Night Vision';
        duration = 180;
        color = '#1dd1a1';
        badgeHex = '#10ac84';
        icon = '👁️';
        break;
      case ItemId.POTION_STRENGTH:
        effectType = PotionType.STRENGTH;
        name = 'Strength';
        duration = 180;
        color = '#9b59b6';
        badgeHex = '#8e44ad';
        icon = '⚔️';
        break;
      default:
        return false;
    }

    // Play drinking sound and magic chime
    this.sounds.playDrinkPotion();
    setTimeout(() => {
      this.sounds.playPotionEffectChime();
    }, 450);

    // Apply immediate healing effect
    if (effectType === PotionType.HEALING) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 8); // 4 hearts healed!
      this.spawnEffectBurst(color);
      return true;
    }

    // Apply or refresh status effect
    const effect: ActivePotionEffect = {
      type: effectType,
      name,
      duration,
      maxDuration: duration,
      color,
      badgeHex,
      icon
    };
    this.activeEffects.set(effectType, effect);
    this.applyPlayerModifications();
    this.spawnEffectBurst(color);
    this.updateHUD();

    return true;
  }

  public update(dt: number) {
    if (this.activeEffects.size === 0) {
      this.hudContainer.innerHTML = '';
      return;
    }

    let changed = false;
    for (const [type, effect] of this.activeEffects) {
      effect.duration -= dt;
      if (effect.duration <= 0) {
        this.activeEffects.delete(type);
        changed = true;
      }
    }

    if (changed) {
      this.applyPlayerModifications();
    }

    this.updateHUD();

    // Spawn ambient swirling magic bubbles around player
    this.swirlTimer += dt;
    if (this.swirlTimer >= 0.12) {
      this.swirlTimer = 0;
      this.spawnSwirlParticle();
    }

    this.updateParticles(dt);
  }

  private applyPlayerModifications() {
    // 1. Speed
    if (this.activeEffects.has(PotionType.SPEED)) {
      this.player.potionSpeedMultiplier = 1.45;
    } else {
      this.player.potionSpeedMultiplier = 1.0;
    }

    // 2. Fire Resistance
    this.player.hasFireResistance = this.activeEffects.has(PotionType.FIRE_RESISTANCE);

    // 3. Strength
    if (this.activeEffects.has(PotionType.STRENGTH)) {
      this.player.potionStrengthMultiplier = 1.4;
    } else {
      this.player.potionStrengthMultiplier = 1.0;
    }

    // 4. Night Vision
    this.player.hasNightVision = this.activeEffects.has(PotionType.NIGHT_VISION);
  }

  private updateHUD() {
    this.hudContainer.innerHTML = '';

    for (const [, effect] of this.activeEffects) {
      const badge = document.createElement('div');
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '10px';
      badge.style.padding = '8px 14px';
      badge.style.borderRadius = '8px';
      badge.style.background = 'rgba(20, 20, 24, 0.85)';
      badge.style.backdropFilter = 'blur(8px)';
      badge.style.border = `1.5px solid ${effect.badgeHex}`;
      badge.style.boxShadow = `0 4px 16px rgba(0, 0, 0, 0.5), 0 0 10px ${effect.badgeHex}66`;
      badge.style.color = '#f5f6fa';
      badge.style.fontSize = '14px';
      badge.style.letterSpacing = '0.5px';
      badge.style.minWidth = '160px';
      badge.style.justifyContent = 'space-between';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';

      const iconSpan = document.createElement('span');
      iconSpan.innerText = effect.icon;
      iconSpan.style.fontSize = '16px';

      const nameSpan = document.createElement('span');
      nameSpan.innerText = effect.name;
      nameSpan.style.fontWeight = '600';
      nameSpan.style.color = effect.color;

      left.appendChild(iconSpan);
      left.appendChild(nameSpan);

      const mins = Math.floor(effect.duration / 60);
      const secs = Math.floor(effect.duration % 60);
      const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      const timeSpan = document.createElement('span');
      timeSpan.innerText = timeStr;
      timeSpan.style.fontWeight = 'bold';
      timeSpan.style.color = effect.duration < 15 ? '#ff4d4d' : '#dcdde1';

      badge.appendChild(left);
      badge.appendChild(timeSpan);
      this.hudContainer.appendChild(badge);
    }
  }

  public clearEffects() {
    this.activeEffects.clear();
    this.applyPlayerModifications();
    this.updateHUD();
  }

  // Swirling magic spiral particles ascending around player feet
  private spawnSwirlParticle() {
    if (this.activeEffects.size === 0) return;

    const effects = Array.from(this.activeEffects.values());
    const chosen = effects[Math.floor(Math.random() * effects.length)];
    const color = new THREE.Color(chosen.color);

    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85
    });
    const mesh = new THREE.Mesh(geo, mat);

    const theta = Math.random() * Math.PI * 2;
    const radius = 0.45 + Math.random() * 0.2;
    mesh.position.set(
      this.player.position.x + Math.cos(theta) * radius,
      this.player.position.y + 0.1,
      this.player.position.z + Math.sin(theta) * radius
    );

    mesh.userData = {
      theta,
      radius,
      startY: mesh.position.y,
      age: 0,
      maxAge: 1.2
    };

    this.particleGroup.add(mesh);
  }

  private spawnEffectBurst(hexColor: string) {
    const col = new THREE.Color(hexColor);
    for (let i = 0; i < 20; i++) {
      const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        this.player.position.x + (Math.random() - 0.5) * 0.5,
        this.player.position.y + 1.0 + (Math.random() - 0.5) * 0.5,
        this.player.position.z + (Math.random() - 0.5) * 0.5
      );
      mesh.userData = {
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3.5,
          1.5 + Math.random() * 2.0,
          (Math.random() - 0.5) * 3.5
        ),
        age: 0,
        maxAge: 0.6
      };
      this.particleGroup.add(mesh);
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particleGroup.children.length - 1; i >= 0; i--) {
      const p = this.particleGroup.children[i] as THREE.Mesh;
      const data = p.userData;
      data.age += dt;

      if (data.vel) {
        p.position.addScaledVector(data.vel, dt);
        data.vel.y -= 5.0 * dt;
      } else {
        data.theta += dt * 3.5;
        p.position.x = this.player.position.x + Math.cos(data.theta) * data.radius;
        p.position.z = this.player.position.z + Math.sin(data.theta) * data.radius;
        p.position.y += 1.4 * dt;
      }

      if (data.age >= data.maxAge) {
        this.particleGroup.remove(p);
        p.geometry.dispose();
        if (Array.isArray(p.material)) p.material.forEach(m => m.dispose());
        else p.material.dispose();
      }
    }
  }

  public dispose() {
    this.activeEffects.clear();
    if (this.hudContainer && this.hudContainer.parentNode) {
      this.hudContainer.parentNode.removeChild(this.hudContainer);
    }
    this.scene.remove(this.particleGroup);
  }
}
