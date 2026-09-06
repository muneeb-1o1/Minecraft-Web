import * as THREE from 'three';
import { World } from '../world/World';
import { Block } from '../world/BlockTypes';

export interface WaterRipple {
  mesh: THREE.Mesh;
  currentScale: number;
  maxScale: number;
  speed: number;
  age: number;
  maxAge: number;
  initialOpacity: number;
}

export interface WaterDroplet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  age: number;
  maxAge: number;
  waterY: number;
}

/**
 * Dynamic Water Splash & Ripple System
 * Manages concentric expanding ring ripples on water surfaces and upward droplet spray particles.
 */
export class SplashSystem {
  public group: THREE.Group;
  private scene: THREE.Scene;
  private world?: World;

  public ripples: WaterRipple[] = [];
  public droplets: WaterDroplet[] = [];

  // Reusable ring geometry for ripples
  private rippleGeo: THREE.RingGeometry;

  // Droplet palette: authentic translucent water blues and foam whites
  private static readonly DROPLET_COLORS = [0xa6d8fc, 0xcbe7ff, 0xffffff, 0x88c4f5, 0x6bb5ed];

  constructor(scene: THREE.Scene, world?: World) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'SplashSystemGroup';
    this.scene.add(this.group);

    // Flat ring geometry oriented on XZ plane: inner radius 0.22, outer radius 0.32, 28 segments
    this.rippleGeo = new THREE.RingGeometry(0.22, 0.32, 28);
    this.rippleGeo.rotateX(-Math.PI / 2); // Lay flat on water plane
  }

  /**
   * Find water surface Y at coordinates (defaulting to block surface if block is water)
   */
  public getWaterSurfaceY(pos: THREE.Vector3): number {
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);

    if (this.world) {
      // Check if current block or block below is water
      if (this.world.getBlock(bx, by, bz) === Block.WATER) {
        // Find topmost continuous water block
        let topY = by;
        while (this.world.getBlock(bx, topY + 1, bz) === Block.WATER) {
          topY++;
        }
        return topY + 0.88; // Authentic water surface height
      }
      if (this.world.getBlock(bx, by - 1, bz) === Block.WATER) {
        return by - 1 + 0.88;
      }
    }

    // Default heuristic for water surface
    return Math.floor(pos.y) + 0.88;
  }

  /**
   * Spawn a water splash event: concentric ring ripples + upward droplet spray
   */
  public spawnSplash(pos: THREE.Vector3, intensity: number = 10, scale: number = 1.0) {
    const waterY = this.getWaterSurfaceY(pos);
    const surfacePos = new THREE.Vector3(pos.x, waterY, pos.z);

    // 1. Concentric ripples on water surface
    this.spawnRipple(surfacePos, scale);

    // 2. Upward droplet spray particles
    const dropletCount = Math.min(24, Math.max(4, Math.floor(intensity)));
    for (let i = 0; i < dropletCount; i++) {
      const col = SplashSystem.DROPLET_COLORS[Math.floor(Math.random() * SplashSystem.DROPLET_COLORS.length)];
      const size = 0.038 + Math.random() * 0.032;
      const dGeo = new THREE.BoxGeometry(size, size, size);
      const dMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.85
      });
      const dMesh = new THREE.Mesh(dGeo, dMat);

      // Randomize initial position slightly around splash origin
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 0.28 * scale;
      dMesh.position.set(
        surfacePos.x + Math.cos(angle) * dist,
        surfacePos.y + 0.05 + Math.random() * 0.15,
        surfacePos.z + Math.sin(angle) * dist
      );

      // Upward ballistic velocity with radial outward burst
      const horizSpeed = 0.6 + Math.random() * 1.8 * Math.min(scale, 1.5);
      const vertSpeed = 1.8 + Math.random() * 2.8 * Math.min(scale, 1.4);
      const vel = new THREE.Vector3(
        Math.cos(angle) * horizSpeed,
        vertSpeed,
        Math.sin(angle) * horizSpeed
      );

      // Random 3D angular tumbling
      const rotVel = new THREE.Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16
      );

      this.group.add(dMesh);
      this.droplets.push({
        mesh: dMesh,
        vel,
        rotVel,
        age: 0,
        maxAge: 0.45 + Math.random() * 0.35,
        waterY
      });
    }
  }

  /**
   * Spawn concentric expanding ring ripples on water surface
   */
  public spawnRipple(surfacePos: THREE.Vector3, scale: number = 1.0, ringCount: number = 2) {
    const waterY = surfacePos.y;

    for (let r = 0; r < ringCount; r++) {
      // Create ring mesh with additive/translucent water ripple material
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9ed6ff,
        transparent: true,
        opacity: 0.75 - r * 0.18,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(this.rippleGeo, mat);

      // Place slightly above water surface to avoid z-fighting
      mesh.position.set(surfacePos.x, waterY + 0.015 + r * 0.002, surfacePos.z);

      // Slightly staggered initial size and speed for concentric waves
      const startScale = (0.2 + r * 0.3) * scale;
      mesh.scale.set(startScale, 1.0, startScale);

      this.group.add(mesh);
      this.ripples.push({
        mesh,
        currentScale: startScale,
        maxScale: (1.35 + r * 0.4) * scale,
        speed: (1.6 + r * 0.35) * Math.max(0.6, scale),
        age: 0,
        maxAge: 0.65 + r * 0.25,
        initialOpacity: mat.opacity
      });
    }
  }

  /**
   * Update all active ripples and droplets
   */
  public update(dt: number) {
    // 1. Update expanding concentric ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rip = this.ripples[i];
      rip.age += dt;

      // Expand ring outwards
      const progress = rip.age / rip.maxAge;
      rip.currentScale = THREE.MathUtils.lerp(rip.currentScale, rip.maxScale, Math.min(1.0, rip.speed * dt));
      rip.mesh.scale.set(rip.currentScale, 1.0, rip.currentScale);

      // Smooth cubic fadeout
      const fade = Math.max(0, 1.0 - progress);
      const opacity = rip.initialOpacity * (fade * fade);

      if (rip.mesh.material instanceof THREE.MeshBasicMaterial) {
        rip.mesh.material.opacity = opacity;
      }

      if (rip.age >= rip.maxAge || opacity <= 0.01) {
        this.group.remove(rip.mesh);
        if (rip.mesh.material instanceof THREE.Material) {
          rip.mesh.material.dispose();
        }
        this.ripples.splice(i, 1);
      }
    }

    // 2. Update water droplets
    const gravity = 13.5; // Realistic water droplet gravity
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const drop = this.droplets[i];
      drop.age += dt;

      // Ballistic motion
      drop.vel.y -= gravity * dt;
      drop.vel.x *= 0.985;
      drop.vel.z *= 0.985;
      drop.mesh.position.addScaledVector(drop.vel, dt);

      // 3D tumbling rotation
      drop.mesh.rotation.x += drop.rotVel.x * dt;
      drop.mesh.rotation.y += drop.rotVel.y * dt;
      drop.mesh.rotation.z += drop.rotVel.z * dt;

      // Scale shrink as droplet evaporates/breaks up
      const lifeRatio = Math.max(0.05, 1.0 - drop.age / drop.maxAge);
      drop.mesh.scale.set(lifeRatio, lifeRatio, lifeRatio);

      // Check if droplet hits water surface or expires
      const belowWater = drop.mesh.position.y <= drop.waterY && drop.vel.y < 0;
      if (drop.age >= drop.maxAge || belowWater) {
        // If falling back into water, trigger a mini secondary ripple occasionally
        if (belowWater && Math.random() < 0.25 && this.ripples.length < 16) {
          this.spawnRipple(new THREE.Vector3(drop.mesh.position.x, drop.waterY, drop.mesh.position.z), 0.35, 1);
        }

        this.group.remove(drop.mesh);
        drop.mesh.geometry.dispose();
        if (drop.mesh.material instanceof THREE.Material) {
          drop.mesh.material.dispose();
        }
        this.droplets.splice(i, 1);
      }
    }
  }

  /**
   * Clear all active ripples and droplets
   */
  public clear() {
    for (const rip of this.ripples) {
      this.group.remove(rip.mesh);
      if (rip.mesh.material instanceof THREE.Material) {
        rip.mesh.material.dispose();
      }
    }
    this.ripples = [];

    for (const drop of this.droplets) {
      this.group.remove(drop.mesh);
      drop.mesh.geometry.dispose();
      if (drop.mesh.material instanceof THREE.Material) {
        drop.mesh.material.dispose();
      }
    }
    this.droplets = [];
  }

  /**
   * Cleanly dispose all geometries and materials
   */
  public dispose() {
    this.clear();
    this.rippleGeo.dispose();
    this.scene.remove(this.group);
  }
}
