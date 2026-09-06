import * as THREE from 'three';

export type CloudQuality = 'fancy' | 'fast' | 'off';

export const MOON_PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Third Quarter',
  'Waning Crescent'
] as const;

export type MoonPhaseName = typeof MOON_PHASE_NAMES[number];

export class DayNightCycle {
  public scene: THREE.Scene;
  public sunLight: THREE.DirectionalLight;
  public moonLight: THREE.DirectionalLight;
  public ambientLight: THREE.AmbientLight;
  public hemisphereLight: THREE.HemisphereLight;

  // Sun and Moon visual meshes
  public sunMesh: THREE.Mesh;
  public sunGlowMesh: THREE.Mesh;
  public moonMesh: THREE.Mesh;
  public moonGlowMesh: THREE.Mesh;
  public celestialGroup: THREE.Group;

  // Moon phase management (8 authentic lunar phases)
  public dayCount: number = 0;
  public accumulatedTicks: number = 6000;
  public currentMoonPhase: number = 4; // Default Full Moon for glorious nocturnal lighting
  public moonTextures: THREE.CanvasTexture[] = [];
  public lightningFlashFactor: number = 0;

  // Stars
  public stars: THREE.Points;

  // Clouds
  public cloudsGroup: THREE.Group;
  public volumetricCloudMesh: THREE.Mesh | null = null;
  public flatCloudMesh: THREE.Mesh | null = null;
  public cloudQuality: CloudQuality = 'fancy';
  public cloudBaseY: number = 64;
  private cloudOffset: THREE.Vector2 = new THREE.Vector2(0, 0);

  // Time of day: 0 to 24000 ticks
  // 0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight
  public time: number = 6000;
  public dayDurationSeconds: number = 1200; // 20 minutes default full day
  public fastNights: boolean = true; // Night passes ~4x faster than daytime
  public isTimeAdvancing: boolean = true;
  public currentSkyColor: THREE.Color = new THREE.Color(0x71a5f5);
  public isNightVisionActive: boolean = false;

  // RTX and Lighting settings
  public shadowResolution: number = 2048;

  public getSkyColor(): THREE.Color {
    return this.currentSkyColor;
  }

  public getTime(): number {
    return this.time;
  }

  public setTime(t: number) {
    this.time = ((t % 24000) + 24000) % 24000;
    this.accumulatedTicks = this.dayCount * 24000 + this.time;
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Directional & Ambient lights
    this.sunLight = new THREE.DirectionalLight(0xfffaea, 1.35);
    this.sunLight.castShadow = true;
    this.setupShadowCamera();
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.moonLight = new THREE.DirectionalLight(0x4477bb, 0.28);
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(this.ambientLight);

    // Natural sky-to-ground hemisphere ambient bounce (removes dark crushed shadows in RTX)
    this.hemisphereLight = new THREE.HemisphereLight(0xd0e8ff, 0x759850, 0.75);
    this.scene.add(this.hemisphereLight);

    // 2. Celestial group (orbits camera)
    this.celestialGroup = new THREE.Group();
    this.scene.add(this.celestialGroup);

    // Sun Texture & Mesh (Luminous circular disk with radiant solar corona flare)
    const sunTex = this.createSunTexture();
    const sunGeo = new THREE.PlaneGeometry(54, 54);
    const sunMat = new THREE.MeshBasicMaterial({
      map: sunTex,
      transparent: true,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.position.set(0, 160, 0);
    this.sunMesh.lookAt(0, 0, 0);
    this.sunMesh.renderOrder = -9;
    this.celestialGroup.add(this.sunMesh);

    // Sun Atmospheric Glow Flare (Warm volumetric golden halo with atmospheric sunburst rays)
    const glowTex = this.createSunGlowTexture();
    const glowGeo = new THREE.PlaneGeometry(135, 135);
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      depthWrite: false
    });
    this.sunGlowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.sunGlowMesh.position.set(0, 162, 0);
    this.sunGlowMesh.lookAt(0, 0, 0);
    this.sunGlowMesh.renderOrder = -10;
    this.celestialGroup.add(this.sunGlowMesh);

    // Moon Phase Textures (8 authentic lunar phases rotating through cycles)
    this.moonTextures = this.createMoonPhaseTextures();
    const initialMoonTex = this.moonTextures[this.currentMoonPhase] || this.createMoonTexture(this.currentMoonPhase);
    const moonGeo = new THREE.PlaneGeometry(46, 46);
    const moonMat = new THREE.MeshBasicMaterial({
      map: initialMoonTex,
      transparent: true,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.moonMesh.position.set(0, -160, 0);
    this.moonMesh.lookAt(0, 0, 0);
    this.moonMesh.renderOrder = -9;
    this.celestialGroup.add(this.moonMesh);

    // Moon Atmospheric Glow Flare (Mystical pale cyan-silver lunar aura BEHIND moon disc)
    const moonGlowTex = this.createMoonGlowTexture();
    const moonGlowGeo = new THREE.PlaneGeometry(105, 105);
    const moonGlowMat = new THREE.MeshBasicMaterial({
      map: moonGlowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      depthWrite: false
    });
    this.moonGlowMesh = new THREE.Mesh(moonGlowGeo, moonGlowMat);
    this.moonGlowMesh.position.set(0, -162, 0);
    this.moonGlowMesh.lookAt(0, 0, 0);
    this.moonGlowMesh.renderOrder = -10;
    this.celestialGroup.add(this.moonGlowMesh);

    // 3. Starry sky points
    this.stars = this.createStars();
    this.stars.renderOrder = -11;
    this.celestialGroup.add(this.stars);

    // 4. Cloud system
    this.cloudsGroup = new THREE.Group();
    this.scene.add(this.cloudsGroup);
    this.buildClouds();
  }

  public setupShadowCamera() {
    this.sunLight.shadow.mapSize.width = this.shadowResolution;
    this.sunLight.shadow.mapSize.height = this.shadowResolution;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 280;
    this.sunLight.shadow.camera.left = -40;
    this.sunLight.shadow.camera.right = 40;
    this.sunLight.shadow.camera.top = 40;
    this.sunLight.shadow.camera.bottom = -40;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.05;
  }

  public setShadowResolution(res: number) {
    this.shadowResolution = res;
    if (res <= 0) {
      this.sunLight.castShadow = false;
    } else {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = res;
      this.sunLight.shadow.mapSize.height = res;
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null as any;
      }
    }
  }

  private createSunTexture(): THREE.CanvasTexture {
    if (typeof document === 'undefined') {
      return new THREE.CanvasTexture({} as HTMLCanvasElement);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;

    const cx = 128, cy = 128;

    // 1. Radiant outer solar corona flare
    const coronaGrad = ctx.createRadialGradient(cx, cy, 38, cx, cy, 126);
    coronaGrad.addColorStop(0.00, 'rgba(255, 240, 140, 0.95)');
    coronaGrad.addColorStop(0.25, 'rgba(255, 190, 50, 0.65)');
    coronaGrad.addColorStop(0.55, 'rgba(255, 130, 20, 0.28)');
    coronaGrad.addColorStop(0.85, 'rgba(255, 80, 10, 0.08)');
    coronaGrad.addColorStop(1.00, 'rgba(255, 60, 0, 0.0)');
    ctx.fillStyle = coronaGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 126, 0, Math.PI * 2);
    ctx.fill();

    // 2. Multi-angle radiant solar corona flares & streamers
    ctx.save();
    const flareRays = 24;
    for (let i = 0; i < flareRays; i++) {
      const angle = (i / flareRays) * Math.PI * 2 + (i % 2 === 0 ? 0.05 : -0.05);
      const length = 55 + (i % 3 === 0 ? 55 : (i % 2 === 0 ? 35 : 20));
      const width = (i % 3 === 0 ? 0.08 : 0.04);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, length, angle - width, angle + width);
      ctx.closePath();
      const flareGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, length);
      flareGrad.addColorStop(0, 'rgba(255, 235, 120, 0.45)');
      flareGrad.addColorStop(0.5, 'rgba(255, 160, 30, 0.22)');
      flareGrad.addColorStop(1, 'rgba(255, 100, 10, 0.0)');
      ctx.fillStyle = flareGrad;
      ctx.fill();
    }
    ctx.restore();

    // 3. Subtle atmospheric sunburst diffraction halo spikes
    ctx.save();
    const spikeLengths = [122, 105, 92, 80];
    for (let i = 0; i < 4; i++) {
      const baseAngle = (i * Math.PI) / 4;
      const len = spikeLengths[i];
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(baseAngle) * len, cy + Math.sin(baseAngle) * len);
      ctx.lineTo(cx + Math.cos(baseAngle + Math.PI / 2) * 5, cy + Math.sin(baseAngle + Math.PI / 2) * 5);
      ctx.lineTo(cx - Math.cos(baseAngle) * len, cy - Math.sin(baseAngle) * len);
      ctx.lineTo(cx - Math.cos(baseAngle + Math.PI / 2) * 5, cy - Math.sin(baseAngle + Math.PI / 2) * 5);
      ctx.closePath();
      const spikeGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, len);
      spikeGrad.addColorStop(0, 'rgba(255, 255, 220, 0.60)');
      spikeGrad.addColorStop(0.4, 'rgba(255, 200, 70, 0.20)');
      spikeGrad.addColorStop(1, 'rgba(255, 140, 30, 0.0)');
      ctx.fillStyle = spikeGrad;
      ctx.fill();
    }
    ctx.restore();

    // 4. Luminous circular solar disk (layered white-hot core and warm golden mantles)
    const rDisc = 48;
    // Outer transitional amber solar limb
    ctx.beginPath();
    ctx.arc(cx, cy, rDisc, 0, Math.PI * 2);
    ctx.fillStyle = '#f39c12';
    ctx.fill();

    // Radiant warm golden mantle
    ctx.beginPath();
    ctx.arc(cx, cy, rDisc - 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f1c40f';
    ctx.fill();

    // Blazing vibrant yellow core
    ctx.beginPath();
    ctx.arc(cx, cy, rDisc - 12, 0, Math.PI * 2);
    ctx.fillStyle = '#ffea3b';
    ctx.fill();

    // Luminous bright solar core
    ctx.beginPath();
    ctx.arc(cx, cy, rDisc - 22, 0, Math.PI * 2);
    ctx.fillStyle = '#fff9c4';
    ctx.fill();

    // White-hot nuclear center
    ctx.beginPath();
    ctx.arc(cx, cy, rDisc - 30, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  private createSunGlowTexture(): THREE.CanvasTexture {
    if (typeof document === 'undefined') {
      return new THREE.CanvasTexture({} as HTMLCanvasElement);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const cx = 128, cy = 128;

    // Atmospheric sunburst halo with radiant golden falloff
    const grad = ctx.createRadialGradient(cx, cy, 14, cx, cy, 128);
    grad.addColorStop(0.00, 'rgba(255, 255, 245, 0.95)');
    grad.addColorStop(0.18, 'rgba(255, 235, 145, 0.68)');
    grad.addColorStop(0.42, 'rgba(255, 180, 55, 0.32)');
    grad.addColorStop(0.70, 'rgba(255, 125, 20, 0.10)');
    grad.addColorStop(0.90, 'rgba(255, 80, 10, 0.03)');
    grad.addColorStop(1.00, 'rgba(255, 50, 5, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle atmospheric sunburst diffraction rays
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const gradRay = ctx.createRadialGradient(cx, cy, 10, cx, cy, 126);
      gradRay.addColorStop(0, 'rgba(255, 250, 210, 0.35)');
      gradRay.addColorStop(0.5, 'rgba(255, 190, 80, 0.12)');
      gradRay.addColorStop(1, 'rgba(255, 120, 20, 0.0)');
      ctx.fillStyle = gradRay;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 126, angle - 0.05, angle + 0.05);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  private createMoonPhaseTextures(): THREE.CanvasTexture[] {
    if (typeof document === 'undefined') {
      return [new THREE.CanvasTexture({} as HTMLCanvasElement)];
    }
    const textures: THREE.CanvasTexture[] = [];
    for (let p = 0; p < 8; p++) {
      textures.push(this.createMoonTexture(p));
    }
    return textures;
  }

  public createMoonTexture(phaseIndex: number = 4): THREE.CanvasTexture {
    if (typeof document === 'undefined') {
      return new THREE.CanvasTexture({} as HTMLCanvasElement);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;

    const cx = 64, cy = 64, R = 44;

    // 1. Faint outer lunar limb fringe
    const halo = ctx.createRadialGradient(cx, cy, R - 6, cx, cy, 64);
    halo.addColorStop(0.0, 'rgba(215, 235, 255, 0.65)');
    halo.addColorStop(0.6, 'rgba(165, 205, 255, 0.22)');
    halo.addColorStop(1.0, 'rgba(120, 170, 255, 0.0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, 64, 0, Math.PI * 2);
    ctx.fill();

    // 2. Base circular lunar body with pale silver-white disc
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#f0f4fc';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // Dark lunar maria (basalt plains & impact craters with authentic placement)
    const maria = [
      // Oceanus Procellarum & Mare Imbrium (Top-left mare complex)
      { x: cx - 30, y: cy - 28, w: 26, h: 18, c: '#9bb0ca' },
      { x: cx - 24, y: cy - 22, w: 18, h: 12, c: '#7b92b3' },
      { x: cx - 18, y: cy - 18, w: 8, h: 6, c: '#617999' },
      // Mare Tranquillitatis & Serenitatis (Center-right basalt plains)
      { x: cx + 4, y: cy - 20, w: 28, h: 22, c: '#9bb0ca' },
      { x: cx + 10, y: cy - 16, w: 18, h: 14, c: '#788fae' },
      { x: cx + 16, y: cy - 12, w: 8, h: 6, c: '#617999' },
      // Tycho crater complex (Bottom-left ray system)
      { x: cx - 22, y: cy + 8, w: 24, h: 24, c: '#93a9c7' },
      { x: cx - 16, y: cy + 14, w: 14, h: 14, c: '#6b83a2' },
      { x: cx - 12, y: cy + 18, w: 6, h: 6, c: '#546b8b' },
      // Mare Crisium (Bottom-right isolated crater basin)
      { x: cx + 12, y: cy + 12, w: 20, h: 18, c: '#9bb0ca' },
      { x: cx + 18, y: cy + 16, w: 10, h: 10, c: '#7187a4' },
      // Bright highland rims along lunar perimeter
      { x: cx - R + 4, y: cy - R + 4, w: R * 2 - 8, h: 3, c: '#ffffff' },
      { x: cx - R + 4, y: cy - R + 4, w: 3, h: R * 2 - 8, c: '#ffffff' }
    ];

    for (const m of maria) {
      ctx.fillStyle = m.c;
      ctx.beginPath();
      ctx.arc(m.x + m.w / 2, m.y + m.h / 2, Math.min(m.w, m.h) / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Authentic 8 Lunar Phase Shadowing via terminator scanline geometry:
    // 0 = New Moon, 1 = Waxing Crescent, 2 = First Quarter, 3 = Waxing Gibbous,
    // 4 = Full Moon, 5 = Waning Gibbous, 6 = Third Quarter, 7 = Waning Crescent
    if (phaseIndex === 0) {
      // New Moon: dark eerie silhouette with subtle earthshine & ghostly rim
      ctx.fillStyle = 'rgba(7, 11, 20, 0.95)';
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // Delicate earthshine outline
      ctx.strokeStyle = 'rgba(160, 200, 255, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
      ctx.stroke();
    } else if (phaseIndex !== 4) {
      // Phases 1, 2, 3 (Waxing) and 5, 6, 7 (Waning)
      const isWaxing = phaseIndex >= 1 && phaseIndex <= 3;
      const isWaning = phaseIndex >= 5 && phaseIndex <= 7;

      ctx.fillStyle = 'rgba(6, 10, 18, 0.94)';

      for (let y = cy - R; y <= cy + R; y++) {
        const dy = y - cy;
        const rSq = R * R - dy * dy;
        if (rSq < 0) continue;
        const w = Math.sqrt(rSq);
        const xLeft = cx - w;
        const xRight = cx + w;

        if (isWaxing) {
          // Waxing: illuminated on the right; shadow on the left [xLeft, xTerm]
          const xTerm = cx + w * Math.cos((phaseIndex * Math.PI) / 4);
          ctx.fillRect(xLeft, y, Math.max(0, xTerm - xLeft), 1);
        } else if (isWaning) {
          // Waning: illuminated on the left; shadow on the right [xTerm, xRight]
          const xTerm = cx - w * Math.cos(((8 - phaseIndex) * Math.PI) / 4);
          ctx.fillRect(xTerm, y, Math.max(0, xRight - xTerm), 1);
        }
      }

      // Soft penumbra along terminator
      const pAngle = (phaseIndex * Math.PI) / 4;
      ctx.strokeStyle = 'rgba(10, 16, 28, 0.50)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const termXOffset = isWaxing ? Math.cos(pAngle) : -Math.cos(((8 - phaseIndex) * Math.PI) / 4);
      ctx.ellipse(cx + termXOffset * R * 0.5, cy, Math.max(1, Math.abs(termXOffset) * R * 0.5), R, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  private createMoonGlowTexture(): THREE.CanvasTexture {
    if (typeof document === 'undefined') {
      return new THREE.CanvasTexture({} as HTMLCanvasElement);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 14, 128, 128, 128);
    grad.addColorStop(0, 'rgba(225, 242, 255, 0.88)');
    grad.addColorStop(0.24, 'rgba(170, 215, 255, 0.48)');
    grad.addColorStop(0.55, 'rgba(105, 165, 255, 0.18)');
    grad.addColorStop(0.85, 'rgba(60, 110, 240, 0.04)');
    grad.addColorStop(1, 'rgba(30, 70, 200, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  private createStars(): THREE.Points {
    const starCount = 650;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 240;

      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.2,
      transparent: true,
      fog: false,
      opacity: 0
    });

    return new THREE.Points(starGeo, starMat);
  }

  public setCloudQuality(quality: CloudQuality) {
    this.cloudQuality = quality;
    this.buildClouds();
  }

  private buildClouds() {
    // Clean up existing
    if (this.volumetricCloudMesh) {
      this.cloudsGroup.remove(this.volumetricCloudMesh);
      this.volumetricCloudMesh.geometry.dispose();
      (this.volumetricCloudMesh.material as THREE.Material).dispose();
      this.volumetricCloudMesh = null;
    }
    if (this.flatCloudMesh) {
      this.cloudsGroup.remove(this.flatCloudMesh);
      this.flatCloudMesh.geometry.dispose();
      (this.flatCloudMesh.material as THREE.Material).dispose();
      this.flatCloudMesh = null;
    }

    if (this.cloudQuality === 'off') {
      this.cloudsGroup.visible = false;
      return;
    }

    this.cloudsGroup.visible = true;

    if (this.cloudQuality === 'fancy') {
      // True 3D Volumetric Voxel Clouds (4-block thick slabs with top/bottom ambient shading)
      this.volumetricCloudMesh = this.create3DVolumetricClouds();
      this.cloudsGroup.add(this.volumetricCloudMesh);
    } else {
      // Fast 2D cloud plane
      this.flatCloudMesh = this.createFlatClouds();
      this.cloudsGroup.add(this.flatCloudMesh);
    }
  }

  // Generate 3D Volumetric Voxel Clouds with distinct top/bottom/side shading
  private create3DVolumetricClouds(): THREE.Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const gridSize = 48; // 48x48 cloud grid
    const blockScale = 8; // 8x8 blocks horizontally
    const cloudHeight = 4; // 4 blocks physical thickness

    // Deterministic pseudo-random cellular cloud pattern
    const cloudMap: boolean[][] = [];
    for (let x = 0; x < gridSize; x++) {
      cloudMap[x] = [];
      for (let z = 0; z < gridSize; z++) {
        // Continuous organic cloud clusters
        const nx = (x / gridSize) * 4.0;
        const nz = (z / gridSize) * 4.0;
        const v = Math.sin(nx * 3.14) * Math.cos(nz * 3.14) +
                  Math.sin(nx * 6.28 + 1.2) * 0.4 +
                  Math.cos(nz * 5.0 + 0.8) * 0.4;
        cloudMap[x][z] = v > 0.15;
      }
    }

    let vertexOffset = 0;

    const addQuad = (
      p0: [number, number, number],
      p1: [number, number, number],
      p2: [number, number, number],
      p3: [number, number, number],
      normal: [number, number, number],
      shade: number
    ) => {
      positions.push(
        p0[0], p0[1], p0[2],
        p1[0], p1[1], p1[2],
        p2[0], p2[1], p2[2],
        p3[0], p3[1], p3[2]
      );
      for (let i = 0; i < 4; i++) {
        normals.push(normal[0], normal[1], normal[2]);
        colors.push(shade, shade, shade * 1.02);
      }
      indices.push(
        vertexOffset + 0, vertexOffset + 1, vertexOffset + 2,
        vertexOffset + 0, vertexOffset + 2, vertexOffset + 3
      );
      vertexOffset += 4;
    };

    const half = (gridSize * blockScale) / 2;

    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        if (!cloudMap[x][z]) continue;

        const x0 = x * blockScale - half;
        const x1 = x0 + blockScale;
        const z0 = z * blockScale - half;
        const z1 = z0 + blockScale;
        const y0 = 0;
        const y1 = cloudHeight;

        // Top face: bright sunlit (shade = 1.0)
        addQuad(
          [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0],
          [0, 1, 0], 1.0
        );

        // Bottom face: shaded ambient underside (shade = 0.68)
        addQuad(
          [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
          [0, -1, 0], 0.68
        );

        // North face (z0)
        if (z === 0 || !cloudMap[x][z - 1]) {
          addQuad(
            [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0],
            [0, 0, -1], 0.85
          );
        }
        // South face (z1)
        if (z === gridSize - 1 || !cloudMap[x][z + 1]) {
          addQuad(
            [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
            [0, 0, 1], 0.85
          );
        }
        // West face (x0)
        if (x === 0 || !cloudMap[x - 1][z]) {
          addQuad(
            [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0],
            [-1, 0, 0], 0.80
          );
        }
        // East face (x1)
        if (x === gridSize - 1 || !cloudMap[x + 1][z]) {
          addQuad(
            [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1],
            [1, 0, 0], 0.80
          );
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      side: THREE.FrontSide
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = this.cloudBaseY;
    return mesh;
  }

  private createFlatClouds(): THREE.Mesh {
    const cloudGeo = new THREE.PlaneGeometry(384, 384, 16, 16);
    cloudGeo.rotateX(-Math.PI / 2);

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';

    for (let i = 0; i < 20; i++) {
      const cx = Math.floor(Math.random() * 8) * 8;
      const cy = Math.floor(Math.random() * 8) * 8;
      const cw = (2 + Math.floor(Math.random() * 4)) * 8;
      const ch = (1 + Math.floor(Math.random() * 3)) * 8;
      ctx.fillRect(cx, cy, cw, ch);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(cloudGeo, mat);
    mesh.position.y = this.cloudBaseY;
    return mesh;
  }

  // Asymmetric Time Engine:
  // Daylight is leisurely (default ~20 min cycle)
  // Golden hour transitions are gradual and rich
  // Night passes swiftly (~4x faster in fastNights mode)
  public update(dt: number, playerPos: THREE.Vector3) {
    if (this.isTimeAdvancing) {
      let speedMultiplier = 1.0;

      // In ticks:
      // 0 - 11500: Daytime
      // 11500 - 13800: Sunset (golden hour)
      // 13800 - 22200: Nighttime
      // 22200 - 24000: Sunrise (dawn)
      if (this.fastNights && this.time >= 13800 && this.time < 22200) {
        // Deep night progresses 4x faster so player returns to day quickly
        speedMultiplier = 4.0;
      } else if ((this.time >= 11500 && this.time < 13800) || (this.time >= 22200 && this.time < 24000)) {
        // Golden hour moves at a measured pace so sunsets and sunrises are enjoyed
        speedMultiplier = 1.0;
      } else {
        // Standard leisurely daytime
        speedMultiplier = 1.0;
      }

      const baseTicksPerSecond = 24000 / this.dayDurationSeconds;
      const deltaTicks = dt * baseTicksPerSecond * speedMultiplier;
      this.time = (this.time + deltaTicks) % 24000;
      this.accumulatedTicks += deltaTicks;

      // Seamless lunar phase progression based on day count
      const calculatedDay = Math.floor(this.accumulatedTicks / 24000);
      if (calculatedDay !== this.dayCount) {
        this.dayCount = calculatedDay;
        const targetPhase = ((this.dayCount + 4) % 8 + 8) % 8;
        if (targetPhase !== this.currentMoonPhase) {
          this.setMoonPhase(targetPhase);
        }
      }
    }

    // Keep celestial objects centered over player
    this.celestialGroup.position.set(playerPos.x, playerPos.y, playerPos.z);

    // Drifting clouds across the sky
    this.cloudOffset.x += dt * 0.8;
    this.cloudOffset.y += dt * 0.4;
    const cloudPeriod = 384;
    const cx = (playerPos.x + this.cloudOffset.x) % cloudPeriod;
    const cz = (playerPos.z + this.cloudOffset.y) % cloudPeriod;
    this.cloudsGroup.position.set(playerPos.x - cx + cloudPeriod / 2, this.cloudBaseY, playerPos.z - cz + cloudPeriod / 2);

    // Celestial angle (0 to 2*PI)
    // 0 = sunrise, PI/2 = noon, PI = sunset, 3*PI/2 = midnight
    const angle = (this.time / 24000) * Math.PI * 2 - Math.PI / 2;
    this.celestialGroup.rotation.z = angle;

    // Sun & Moon positions relative to world
    const sunDir = new THREE.Vector3(Math.cos(angle + Math.PI / 2), Math.sin(angle + Math.PI / 2), 0.2).normalize();
    this.sunLight.position.copy(sunDir).multiplyScalar(120).add(playerPos);
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    const moonDir = sunDir.clone().negate();
    this.moonLight.position.copy(moonDir).multiplyScalar(120).add(playerPos);
    this.moonLight.target.position.copy(playerPos);
    this.moonLight.target.updateMatrixWorld();

    const sunElevation = Math.sin(angle + Math.PI / 2);

    let skyColor: THREE.Color;
    let starOpacity = 0;
    let cloudTint = new THREE.Color(0xffffff);

    // Dynamically cull shadow rendering pass when sun is below the horizon at night
    const canCastShadow = (this.shadowResolution > 0 && sunElevation > -0.10);
    if (this.sunLight.castShadow !== canCastShadow) {
      this.sunLight.castShadow = canCastShadow;
    }

    if (sunElevation > 0.20) {
      // 1. Broad Sunny Daylight (Crisp & Vibrant Azure, natural photographic exposure)
      const t = Math.min(1, (sunElevation - 0.20) / 0.5);
      skyColor = new THREE.Color(0x9bc2ff).lerp(new THREE.Color(0x71a5f5), t);
      this.ambientLight.intensity = THREE.MathUtils.lerp(0.50, 0.58, t);
      this.ambientLight.color.setHex(0xf4f8ff);
      this.hemisphereLight.intensity = THREE.MathUtils.lerp(0.38, 0.46, t);
      this.hemisphereLight.color.setHex(0xd4eaff);
      this.hemisphereLight.groundColor.setHex(0x7da85b);
      this.sunLight.intensity = THREE.MathUtils.lerp(0.65, 0.95, t);
      this.sunLight.color.setHex(0xfffaea);
      this.moonLight.intensity = 0.0;
      this.sunGlowMesh.visible = true;
      this.moonGlowMesh.visible = false;
      cloudTint.setHex(0xffffff);
    } else if (sunElevation > -0.15) {
      // 2. Sunset / Sunrise (Cinematic Golden Hour & Vivid Twilight with warm golden Rayleigh scattering)
      const t = (sunElevation + 0.15) / 0.35; // 0 = dusk/night, 1 = daytime
      skyColor = this.getRayleighScatteringColor(sunElevation);

      if (t > 0.5) {
        const subT = (t - 0.5) * 2;
        cloudTint = new THREE.Color(0xffa866).lerp(new THREE.Color(0xffffff), subT);
      } else {
        const subT = t * 2;
        cloudTint = new THREE.Color(0xaa6688).lerp(new THREE.Color(0xffa866), subT);
      }

      this.ambientLight.intensity = THREE.MathUtils.lerp(0.38, 0.52, t);
      this.ambientLight.color.setHex(0xffb077);
      this.hemisphereLight.intensity = THREE.MathUtils.lerp(0.26, 0.40, t);
      this.hemisphereLight.color.setHex(0xffc288);
      this.hemisphereLight.groundColor.setHex(0x6b4a32);
      this.sunLight.intensity = THREE.MathUtils.lerp(0.0, 0.65, t);
      this.sunLight.color.setHex(0xff9944);
      this.moonLight.intensity = THREE.MathUtils.lerp(0.25, 0.0, t);
      this.sunGlowMesh.visible = t > 0.1;
      this.moonGlowMesh.visible = t < 0.45;
      starOpacity = (1 - t) * 0.85;

      // Warm golden corona halo modulation during golden hour
      if (this.sunGlowMesh.material instanceof THREE.MeshBasicMaterial) {
        const goldenFactor = THREE.MathUtils.clamp(1.0 - Math.abs(sunElevation - 0.04) / 0.16, 0.0, 1.0);
        this.sunGlowMesh.material.color.setHex(0xffffff).lerp(new THREE.Color(0xffb244), goldenFactor * 0.82);
      }
    } else {
      // 3. Nighttime (Moonlit Navy & Sparkling Stars modulated by authentic lunar phase)
      skyColor = new THREE.Color(0x060a14);
      const moonIllum = this.getMoonPhaseIllumination();
      this.ambientLight.intensity = 0.24 + 0.18 * moonIllum;
      this.ambientLight.color.setHex(0x3a4c6e);
      this.hemisphereLight.intensity = 0.14 + 0.14 * moonIllum;
      this.hemisphereLight.color.setHex(0x283858);
      this.hemisphereLight.groundColor.setHex(0x182014);
      this.sunLight.intensity = 0.0;
      this.moonLight.intensity = 0.14 + 0.44 * moonIllum;
      this.moonLight.color.setHex(0x77aaff);
      this.sunGlowMesh.visible = false;
      this.moonGlowMesh.visible = true;
      if (this.moonGlowMesh.material instanceof THREE.MeshBasicMaterial) {
        this.moonGlowMesh.material.opacity = 0.18 + 0.82 * moonIllum;
      }
      starOpacity = 1.0;
      cloudTint.setHex(0x384a66);
    }

    // Dynamic lightning flash illumination (casts brilliant white flashes across celestial vault)
    if (this.lightningFlashFactor > 0.005) {
      skyColor.lerp(new THREE.Color(0xf2f7ff), this.lightningFlashFactor * 0.95);
      this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientLight.intensity, 3.4, this.lightningFlashFactor);
      this.ambientLight.color.lerp(new THREE.Color(0xf5f8ff), this.lightningFlashFactor);
      this.hemisphereLight.intensity = THREE.MathUtils.lerp(this.hemisphereLight.intensity, 2.8, this.lightningFlashFactor);
      this.hemisphereLight.color.lerp(new THREE.Color(0xeef6ff), this.lightningFlashFactor);
      this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, 4.6, this.lightningFlashFactor);
      this.sunLight.color.lerp(new THREE.Color(0xffffff), this.lightningFlashFactor);
    }

    if (this.isNightVisionActive) {
      this.ambientLight.intensity = Math.max(1.25, this.ambientLight.intensity * 1.85);
      this.ambientLight.color.setHex(0xf0f8ff);
      this.hemisphereLight.intensity = 1.0;
    }

    this.currentSkyColor.copy(skyColor);
    this.scene.background = skyColor;
    if (this.scene.fog && !(this.scene.fog as any).userData?.isUnderwater) {
      this.scene.fog.color.copy(skyColor);
    }

    if (this.stars.material instanceof THREE.PointsMaterial) {
      this.stars.material.opacity = starOpacity;
    }

    // Apply twilight tint to clouds
    if (this.volumetricCloudMesh && this.volumetricCloudMesh.material instanceof THREE.MeshBasicMaterial) {
      this.volumetricCloudMesh.material.color.copy(cloudTint);
    }
    if (this.flatCloudMesh && this.flatCloudMesh.material instanceof THREE.MeshBasicMaterial) {
      this.flatCloudMesh.material.color.copy(cloudTint);
    }
  }

  public setDayDuration(minutes: number) {
    this.dayDurationSeconds = Math.max(60, minutes * 60);
  }

  public setTimeOfDay(timeString: 'day' | 'night' | 'noon' | 'sunset') {
    if (timeString === 'day') this.time = 1000;
    else if (timeString === 'noon') this.time = 6000;
    else if (timeString === 'sunset') this.time = 12000;
    else if (timeString === 'night') this.time = 18000;
  }

  public get isDay(): boolean {
    return this.time >= 0 && this.time < 12000;
  }

  public get isNight(): boolean {
    return this.time >= 12000 && this.time < 24000;
  }

  public getSunPosition(): THREE.Vector3 {
    const pos = new THREE.Vector3();
    this.sunMesh.getWorldPosition(pos);
    return pos;
  }

  public getSunElevation(): number {
    const angle = (this.time / 24000) * Math.PI * 2 - Math.PI / 2;
    return Math.sin(angle + Math.PI / 2);
  }

  public getMoonPhase(): number {
    return this.currentMoonPhase;
  }

  public getMoonPhaseName(): string {
    return MOON_PHASE_NAMES[this.currentMoonPhase];
  }

  public getMoonPhaseIllumination(): number {
    return 0.5 * (1.0 - Math.cos((this.currentMoonPhase * Math.PI) / 4));
  }

  public setMoonPhase(phase: number) {
    this.currentMoonPhase = ((Math.floor(phase) % 8) + 8) % 8;
    if (this.moonMesh && this.moonTextures[this.currentMoonPhase]) {
      (this.moonMesh.material as THREE.MeshBasicMaterial).map = this.moonTextures[this.currentMoonPhase];
      (this.moonMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
  }

  public setDayCount(day: number) {
    this.dayCount = Math.max(0, Math.floor(day));
    this.accumulatedTicks = this.dayCount * 24000 + this.time;
    const targetPhase = ((this.dayCount + 4) % 8 + 8) % 8;
    this.setMoonPhase(targetPhase);
  }

  public setLightningFlash(factor: number) {
    this.lightningFlashFactor = Math.max(0, Math.min(1, factor));
  }

  /**
   * Authentic Rayleigh Atmospheric Scattering color gradient based on solar elevation angle.
   * Simulates preferential scattering of blue wavelengths through optical airmass, producing
   * vibrant honey gold, fiery amber, and deep crimson horizon transitions.
   */
  public getRayleighScatteringColor(sunElevation?: number): THREE.Color {
    const elevation = sunElevation !== undefined ? sunElevation : this.getSunElevation();

    if (elevation > 0.20) {
      const t = Math.min(1.0, (elevation - 0.20) / 0.5);
      return new THREE.Color(0x9bc2ff).lerp(new THREE.Color(0x71a5f5), t);
    } else if (elevation < -0.15) {
      return new THREE.Color(0x060a14);
    }

    // Twilight / Golden hour range [-0.15, 0.20]
    const t = (elevation + 0.15) / 0.35; // 0 = dusk, 1 = daylight

    if (t > 0.55) {
      // Golden hour to full daytime: Honey Gold -> Warm Amber -> Azure Sky
      const subT = (t - 0.55) / 0.45;
      const goldenScatter = new THREE.Color(0xff9a2b); // Warm golden Rayleigh amber
      const daylightSky = new THREE.Color(0x8cb4ff);
      return goldenScatter.lerp(daylightSky, subT);
    } else if (t > 0.25) {
      // Deep golden twilight: Fiery Crimson/Orange -> Warm Honey Gold
      const subT = (t - 0.25) / 0.30;
      const sunsetCrimson = new THREE.Color(0xeb481e); // Deep horizon crimson
      const goldenAmber = new THREE.Color(0xff9a2b);
      return sunsetCrimson.lerp(goldenAmber, subT);
    } else {
      // Dusk into night: Indigo Twilight -> Deep Horizon Crimson
      const subT = t / 0.25;
      const duskIndigo = new THREE.Color(0x18102e); // Soft nightfall indigo
      const sunsetCrimson = new THREE.Color(0xeb481e);
      return duskIndigo.lerp(sunsetCrimson, subT);
    }
  }

  /**
   * Returns the warm golden horizon Rayleigh scattering color tailored for horizon fog blending.
   */
  public getAtmosphericHorizonColor(): THREE.Color {
    const elev = this.getSunElevation();
    if (elev > -0.12 && elev < 0.22) {
      const goldenIntensity = 1.0 - Math.abs(elev - 0.05) / 0.17;
      const crimson = new THREE.Color(0xf05020);
      const gold = new THREE.Color(0xffb238);
      return crimson.lerp(gold, Math.max(0, Math.min(1, goldenIntensity)));
    }
    return this.currentSkyColor.clone();
  }
}
