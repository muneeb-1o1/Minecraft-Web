import * as THREE from 'three';
import { World } from '../world/World';
import { Block, ItemId } from '../world/BlockTypes';

export interface SmokeParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  seed: number;
  swaySpeed: number;
  swayAmount: number;
  age: number;
  maxAge: number;
  initialOpacity: number;
  initialScale: number;
  targetScale: number;
}

export interface EmberParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  initialScale: number;
}

export interface EmitterSource {
  pos: THREE.Vector3;
  type: 'torch' | 'furnace' | 'campfire';
  timer: number;
}

/**
 * ParticleEmitterSystem:
 * Manages atmospheric smoke and flame particle emitters for torches, furnaces, and campfires.
 * Features gentle rising, twisting smoke drifting upward and dissipating, plus luminous ember sparks.
 */
export class ParticleEmitterSystem {
  public group: THREE.Group;
  private scene: THREE.Scene;

  public smokeParticles: SmokeParticle[] = [];
  public emberParticles: EmberParticle[] = [];
  public emitters: Map<string, EmitterSource> = new Map();

  private scanTimer: number = 0;
  private heldTorchTimer: number = 0;

  // Color palettes
  private static readonly SMOKE_COLORS = [0x888888, 0xaaaaaa, 0xcccccc, 0x999999, 0xb8b8b8];
  private static readonly EMBER_COLORS = [0xffaa11, 0xff7700, 0xffcc33, 0xff5500, 0xffe066];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'ParticleEmitterGroup';
    this.scene.add(this.group);
  }

  private getKey(x: number, y: number, z: number): string {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  /**
   * Register a persistent emitter at a specific block coordinate
   */
  public registerEmitter(pos: THREE.Vector3, type: 'torch' | 'furnace' | 'campfire') {
    const key = this.getKey(pos.x, pos.y, pos.z);
    this.emitters.set(key, {
      pos: new THREE.Vector3(Math.floor(pos.x) + 0.5, Math.floor(pos.y), Math.floor(pos.z) + 0.5),
      type,
      timer: Math.random() * 0.2
    });
  }

  /**
   * Unregister an emitter when a torch or furnace is removed
   */
  public unregisterEmitter(pos: THREE.Vector3) {
    const key = this.getKey(pos.x, pos.y, pos.z);
    this.emitters.delete(key);
  }

  /**
   * Spawn a gentle rising, twisting smoke particle
   */
  public spawnSmoke(pos: THREE.Vector3, upwardSpeedMultiplier: number = 1.0, scaleMultiplier: number = 1.0): SmokeParticle {
    const col = ParticleEmitterSystem.SMOKE_COLORS[Math.floor(Math.random() * ParticleEmitterSystem.SMOKE_COLORS.length)];
    const size = 0.055 * scaleMultiplier;
    const geo = new THREE.BoxGeometry(size, size, size);
    const initialOpacity = 0.60 + Math.random() * 0.15;
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: initialOpacity,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Initial position with subtle jitter
    mesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.12,
      pos.y + (Math.random() - 0.5) * 0.06,
      pos.z + (Math.random() - 0.5) * 0.12
    );

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.15,
      (0.75 + Math.random() * 0.55) * upwardSpeedMultiplier,
      (Math.random() - 0.5) * 0.15
    );

    this.group.add(mesh);

    const p: SmokeParticle = {
      mesh,
      vel,
      seed: Math.random() * Math.PI * 2,
      swaySpeed: 3.5 + Math.random() * 2.0,
      swayAmount: 0.18 + Math.random() * 0.14,
      age: 0,
      maxAge: 0.95 + Math.random() * 0.55,
      initialOpacity,
      initialScale: 1.0,
      targetScale: 2.2 + Math.random() * 0.8
    };

    this.smokeParticles.push(p);
    return p;
  }

  /**
   * Spawn a luminous ember spark particle
   */
  public spawnEmber(pos: THREE.Vector3, speedMultiplier: number = 1.0): EmberParticle {
    const col = ParticleEmitterSystem.EMBER_COLORS[Math.floor(Math.random() * ParticleEmitterSystem.EMBER_COLORS.length)];
    const size = 0.032;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);

    mesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.14,
      pos.y + Math.random() * 0.08,
      pos.z + (Math.random() - 0.5) * 0.14
    );

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.65,
      (1.2 + Math.random() * 1.1) * speedMultiplier,
      (Math.random() - 0.5) * 0.65
    );

    this.group.add(mesh);

    const p: EmberParticle = {
      mesh,
      vel,
      age: 0,
      maxAge: 0.32 + Math.random() * 0.28,
      initialScale: 1.0
    };

    this.emberParticles.push(p);
    return p;
  }

  /**
   * Spawn torch-specific smoke and ember particles
   */
  public spawnTorchParticles(pos: THREE.Vector3) {
    // Torch tip is located around y + 0.65
    const tipPos = new THREE.Vector3(pos.x, pos.y + 0.68, pos.z);
    this.spawnSmoke(tipPos, 0.9, 0.85);

    if (Math.random() < 0.6) {
      this.spawnEmber(tipPos, 0.9);
    }
  }

  /**
   * Spawn campfire / active furnace smoke and sparks
   */
  public spawnCampfireParticles(pos: THREE.Vector3) {
    const firePos = new THREE.Vector3(pos.x, pos.y + 0.45, pos.z);
    this.spawnSmoke(firePos, 1.35, 1.4);
    if (Math.random() < 0.4) {
      this.spawnSmoke(firePos, 1.1, 1.1);
    }
    this.spawnEmber(firePos, 1.4);
    if (Math.random() < 0.5) {
      this.spawnEmber(firePos, 1.2);
    }
  }

  /**
   * Dynamic discovery of torch and furnace blocks in active radius around player
   */
  public scanAroundPlayer(playerPos: THREE.Vector3, world: World, radius: number = 8) {
    const px = Math.floor(playerPos.x);
    const py = Math.floor(playerPos.y);
    const pz = Math.floor(playerPos.z);

    // Prune out-of-range emitters
    const maxDistSq = (radius + 3) * (radius + 3);
    for (const [key, em] of this.emitters) {
      if (em.pos.distanceToSquared(playerPos) > maxDistSq) {
        this.emitters.delete(key);
      }
    }

    // Quick radial slice scan
    for (let dx = -radius; dx <= radius; dx += 2) {
      for (let dz = -radius; dz <= radius; dz += 2) {
        for (let dy = -3; dy <= 4; dy++) {
          const bx = px + dx;
          const by = py + dy;
          const bz = pz + dz;
          const b = world.getBlock(bx, by, bz);

          if (b === Block.TORCH) {
            const key = this.getKey(bx, by, bz);
            if (!this.emitters.has(key)) {
              this.registerEmitter(new THREE.Vector3(bx, by, bz), 'torch');
            }
          }
        }
      }
    }
  }

  /**
   * Update particle motions, twists, expansion, and emissions
   */
  public update(
    dt: number,
    playerPos?: THREE.Vector3,
    world?: World,
    heldItemId?: ItemId,
    playerLookDir?: THREE.Vector3
  ) {
    // 1. Scan for nearby emitters around player every 0.6 seconds
    if (playerPos && world) {
      this.scanTimer += dt;
      if (this.scanTimer >= 0.6) {
        this.scanTimer = 0;
        this.scanAroundPlayer(playerPos, world, 9);
      }
    }

    // 2. Emission from registered emitters
    for (const [_, em] of this.emitters) {
      em.timer += dt;
      const interval = em.type === 'torch' ? 0.22 : 0.14;
      if (em.timer >= interval) {
        em.timer = 0;
        if (em.type === 'torch') {
          this.spawnTorchParticles(em.pos);
        } else {
          this.spawnCampfireParticles(em.pos);
        }
      }
    }

    // 3. Held torch particle emissions drifting near player
    if (heldItemId === (Block.TORCH as number) && playerPos && playerLookDir) {
      this.heldTorchTimer += dt;
      if (this.heldTorchTimer >= 0.2) {
        this.heldTorchTimer = 0;
        const right = new THREE.Vector3(-playerLookDir.z, 0, playerLookDir.x).normalize();
        const heldTorchPos = playerPos.clone()
          .add(new THREE.Vector3(0, 1.25, 0))
          .addScaledVector(playerLookDir, 0.45)
          .addScaledVector(right, 0.32);

        this.spawnSmoke(heldTorchPos, 0.8, 0.7);
        if (Math.random() < 0.5) {
          this.spawnEmber(heldTorchPos, 0.85);
        }
      }
    }

    // 4. Update smoke particles: gentle rising + sinusoidal twisting drift + expansion + fadeout
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.age += dt;

      // Base upward movement
      p.mesh.position.y += p.vel.y * dt;

      // Sinusoidal twisting/swirling drift in XZ
      const twistPhase = p.age * p.swaySpeed + p.seed;
      p.mesh.position.x += Math.sin(twistPhase) * p.swayAmount * dt;
      p.mesh.position.z += Math.cos(twistPhase * 0.85) * p.swayAmount * dt;

      // Expansion as smoke rises and disperses
      const progress = p.age / p.maxAge;
      const curScale = THREE.MathUtils.lerp(p.initialScale, p.targetScale, Math.sqrt(progress));
      p.mesh.scale.set(curScale, curScale, curScale);

      // Smooth cubic opacity fadeout
      const fade = Math.max(0, 1.0 - progress);
      const opacity = p.initialOpacity * (fade * fade * fade);

      if (p.mesh.material instanceof THREE.MeshBasicMaterial) {
        p.mesh.material.opacity = opacity;
      }

      if (p.age >= p.maxAge || opacity <= 0.01) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (p.mesh.material instanceof THREE.Material) {
          p.mesh.material.dispose();
        }
        this.smokeParticles.splice(i, 1);
      }
    }

    // 5. Update ember sparks: fast pop, air resistance, flickering and quick expiration
    for (let i = this.emberParticles.length - 1; i >= 0; i--) {
      const e = this.emberParticles[i];
      e.age += dt;

      // Air resistance and upward deceleration
      e.vel.y -= 2.2 * dt;
      e.vel.x *= 0.94;
      e.vel.z *= 0.94;
      e.mesh.position.addScaledVector(e.vel, dt);

      // Rapid flickering
      const progress = e.age / e.maxAge;
      const flicker = 0.7 + Math.sin(e.age * 30.0) * 0.3;
      const curScale = Math.max(0.1, (1.0 - progress) * flicker);
      e.mesh.scale.set(curScale, curScale, curScale);

      if (e.age >= e.maxAge) {
        this.group.remove(e.mesh);
        e.mesh.geometry.dispose();
        if (e.mesh.material instanceof THREE.Material) {
          e.mesh.material.dispose();
        }
        this.emberParticles.splice(i, 1);
      }
    }
  }

  /**
   * Clear all active particles
   */
  public clear() {
    for (const p of this.smokeParticles) {
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
      if (p.mesh.material instanceof THREE.Material) {
        p.mesh.material.dispose();
      }
    }
    this.smokeParticles = [];

    for (const e of this.emberParticles) {
      this.group.remove(e.mesh);
      e.mesh.geometry.dispose();
      if (e.mesh.material instanceof THREE.Material) {
        e.mesh.material.dispose();
      }
    }
    this.emberParticles = [];
    this.emitters.clear();
  }

  /**
   * Cleanly dispose of the system
   */
  public dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
