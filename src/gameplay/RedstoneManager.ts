import * as THREE from 'three';
import { World } from '../world/World';
import { Block, BLOCK_DEFS } from '../world/BlockTypes';
import { SoundManager } from '../audio/SoundManager';
import { Player } from '../player/Player';
import { MobManager } from '../entities/MobManager';

export interface PoweredNode {
  x: number;
  y: number;
  z: number;
  power: number; // 0 - 15
}

export interface PrimedTNT {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  fuseTime: number; // seconds
  flashTimer: number;
}

export class RedstoneManager {
  private world: World;
  private sounds: SoundManager;
  private scene: THREE.Scene;
  private player?: Player;
  private mobManager?: MobManager;

  // Track coordinates of toggled levers: 'x,y,z' -> boolean (true = ON)
  public leverStates: Map<string, boolean> = new Map();

  // Active primed TNT entities
  public primedTntList: PrimedTNT[] = [];
  private tntGroup: THREE.Group;

  // Particle group for explosion smoke & debris
  private particleGroup: THREE.Group;

  // Power cache 'x,y,z' -> power (0-15)
  private powerMap: Map<string, number> = new Map();

  public onSpawnDropItem?: (id: number, count: number, pos: THREE.Vector3) => void;

  constructor(world: World, sounds: SoundManager, scene: THREE.Scene) {
    this.world = world;
    this.sounds = sounds;
    this.scene = scene;

    this.tntGroup = new THREE.Group();
    this.scene.add(this.tntGroup);

    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);
  }

  public setEntities(player: Player, mobManager: MobManager) {
    this.player = player;
    this.mobManager = mobManager;
  }

  private getKey(x: number, y: number, z: number): string {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  // Check if a block is a redstone conductor or component
  public isRedstoneComponent(block: Block): boolean {
    return (
      block === Block.REDSTONE_WIRE ||
      block === Block.REDSTONE_TORCH ||
      block === Block.LEVER ||
      block === Block.REDSTONE_LAMP ||
      block === Block.REDSTONE_LAMP_LIT ||
      block === Block.TNT
    );
  }

  // Toggle lever state (right-click)
  public toggleLever(x: number, y: number, z: number): boolean {
    const key = this.getKey(x, y, z);
    const currentState = this.leverStates.get(key) || false;
    const newState = !currentState;
    this.leverStates.set(key, newState);

    this.sounds.playClick();
    this.updateNetworkAround(x, y, z, 16);
    return newState;
  }

  public isLeverActive(x: number, y: number, z: number): boolean {
    return this.leverStates.get(this.getKey(x, y, z)) || false;
  }

  // Calculate power emitted directly by a block
  public getDirectPower(x: number, y: number, z: number): number {
    const block = this.world.getBlock(x, y, z);
    if (block === Block.LEVER) {
      return this.isLeverActive(x, y, z) ? 15 : 0;
    }
    if (block === Block.REDSTONE_TORCH) {
      // Redstone torch inverts: if block below is powered, torch is OFF (0)
      const belowPower = this.powerMap.get(this.getKey(x, y - 1, z)) || 0;
      return belowPower > 0 ? 0 : 15;
    }
    return 0;
  }

  // Query calculated redstone power at coordinate (0 to 15)
  public getPower(x: number, y: number, z: number): number {
    return this.powerMap.get(this.getKey(x, y, z)) || 0;
  }

  // Propagate signals across redstone wire and connected components in radius
  public updateNetworkAround(centerX: number, centerY: number, centerZ: number, radius: number = 15) {
    const minX = Math.floor(centerX - radius);
    const maxX = Math.floor(centerX + radius);
    const minY = Math.max(0, Math.floor(centerY - 4));
    const maxY = Math.min(63, Math.floor(centerY + 4));
    const minZ = Math.floor(centerZ - radius);
    const maxZ = Math.floor(centerZ + radius);

    // 1. Clear old power values in radius
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          this.powerMap.delete(this.getKey(x, y, z));
        }
      }
    }

    // 2. Multi-source BFS queue for signal propagation
    const queue: PoweredNode[] = [];

    // Find all primary power sources (Levers, Redstone Torches)
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const power = this.getDirectPower(x, y, z);
          if (power > 0) {
            this.powerMap.set(this.getKey(x, y, z), power);
            queue.push({ x, y, z, power });
          }
        }
      }
    }

    // 3. Propagate power with signal decay
    const directions = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1]
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.power <= 0) continue;

      for (const [dx, dy, dz] of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nz = current.z + dz;

        if (nx < minX || nx > maxX || ny < minY || ny > maxY || nz < minZ || nz > maxZ) continue;

        const neighborBlock = this.world.getBlock(nx, ny, nz);
        const neighborKey = this.getKey(nx, ny, nz);
        const existingPower = this.powerMap.get(neighborKey) || 0;

        // Propagates through redstone wire with -1 decay, or powers consumer blocks
        if (neighborBlock === Block.REDSTONE_WIRE) {
          const newPower = current.power - 1;
          if (newPower > existingPower) {
            this.powerMap.set(neighborKey, newPower);
            queue.push({ x: nx, y: ny, z: nz, power: newPower });
          }
        } else if (
          neighborBlock === Block.REDSTONE_LAMP ||
          neighborBlock === Block.REDSTONE_LAMP_LIT ||
          neighborBlock === Block.TNT
        ) {
          if (current.power > existingPower) {
            this.powerMap.set(neighborKey, current.power);
          }
        }
      }
    }

    // 4. Update state of consumer blocks
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const b = this.world.getBlock(x, y, z);
          const p = this.powerMap.get(this.getKey(x, y, z)) || 0;

          // Redstone Lamp toggle
          if (b === Block.REDSTONE_LAMP && p > 0) {
            this.world.setBlock(x, y, z, Block.REDSTONE_LAMP_LIT);
          } else if (b === Block.REDSTONE_LAMP_LIT && p === 0) {
            this.world.setBlock(x, y, z, Block.REDSTONE_LAMP);
          }

          // TNT ignition on redstone power
          if (b === Block.TNT && p > 0) {
            this.primeTNT(x, y, z);
          }
        }
      }
    }
  }

  // Prime TNT block (spawns flashing white TNT entity and starts fuse)
  public primeTNT(x: number, y: number, z: number, fuseSeconds: number = 3.0) {
    this.world.setBlock(x, y, z, Block.AIR);

    // Create 3D primed TNT mesh
    const geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const mat = new THREE.MeshLambertMaterial({ color: 0xdb2b2b });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.tntGroup.add(mesh);

    // Initial slight upward pop velocity
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.8,
      2.5,
      (Math.random() - 0.5) * 0.8
    );

    const tnt: PrimedTNT = {
      mesh,
      position: mesh.position,
      velocity,
      fuseTime: fuseSeconds,
      flashTimer: 0
    };

    this.primedTntList.push(tnt);
    this.sounds.playBowPull(); // Authentic fuse sizzle
  }

  // Update primed TNT physics, flashing, and detonation
  public update(dt: number) {
    for (let i = this.primedTntList.length - 1; i >= 0; i--) {
      const tnt = this.primedTntList[i];
      tnt.fuseTime -= dt;
      tnt.flashTimer += dt;

      // Flashing white effect
      const isWhite = Math.floor(tnt.flashTimer * 8) % 2 === 0;
      (tnt.mesh.material as THREE.MeshLambertMaterial).color.setHex(isWhite ? 0xffffff : 0xdb2b2b);

      // Expansion swelling near detonation
      if (tnt.fuseTime < 0.8) {
        const scale = 1.0 + (0.8 - tnt.fuseTime) * 0.35;
        tnt.mesh.scale.set(scale, scale, scale);
      }

      // Physics: gravity and drag
      tnt.velocity.y -= 9.8 * dt;
      tnt.position.addScaledVector(tnt.velocity, dt);

      // Floor collision check
      const blockX = Math.floor(tnt.position.x);
      const blockY = Math.floor(tnt.position.y);
      const blockZ = Math.floor(tnt.position.z);
      const blockBelow = this.world.getBlock(blockX, blockY, blockZ);
      if (BLOCK_DEFS[blockBelow]?.solid) {
        tnt.position.y = blockY + 1.0;
        tnt.velocity.set(0, 0, 0);
      }

      // Detonation!
      if (tnt.fuseTime <= 0) {
        this.detonate(tnt.position);
        this.tntGroup.remove(tnt.mesh);
        tnt.mesh.geometry.dispose();
        (tnt.mesh.material as THREE.Material).dispose();
        this.primedTntList.splice(i, 1);
      }
    }

    this.updateParticles(dt);
  }

  // Execute authentic Minecraft explosion
  public detonate(pos: THREE.Vector3, blastRadius: number = 3.5) {
    this.sounds.playExplosion();

    const originX = pos.x;
    const originY = pos.y;
    const originZ = pos.z;

    // 1. Destroy blocks in blast sphere
    const rInt = Math.ceil(blastRadius);
    for (let dx = -rInt; dx <= rInt; dx++) {
      for (let dy = -rInt; dy <= rInt; dy++) {
        for (let dz = -rInt; dz <= rInt; dz++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist <= blastRadius) {
            const bx = Math.floor(originX + dx);
            const by = Math.floor(originY + dy);
            const bz = Math.floor(originZ + dz);

            const block = this.world.getBlock(bx, by, bz);
            if (block !== Block.AIR && block !== Block.BEDROCK) {
              this.world.setBlock(bx, by, bz, Block.AIR);

              // 40% chance to drop item
              if (Math.random() < 0.4) {
                this.onSpawnDropItem?.(block, 1, new THREE.Vector3(bx + 0.5, by + 0.5, bz + 0.5));
              }
            }
          }
        }
      }
    }

    // 2. Damage & Knockback nearby Player
    if (this.player) {
      const pDist = this.player.position.distanceTo(pos);
      if (pDist < blastRadius * 2.2) {
        const damage = Math.round((1 - pDist / (blastRadius * 2.2)) * 14);
        if (damage > 0) {
          const knockDir = this.player.position.clone().sub(pos).normalize();
          this.player.takeDamage(damage);
          this.player.velocity.addScaledVector(knockDir, 8.0);
        }
      }
    }

    // 3. Damage & Knockback nearby Mobs
    if (this.mobManager) {
      for (const mob of this.mobManager.mobs) {
        if (!mob.isAlive) continue;
        const mDist = mob.position.distanceTo(pos);
        if (mDist < blastRadius * 2.2) {
          const damage = Math.round((1 - mDist / (blastRadius * 2.2)) * 16);
          if (damage > 0) {
            const knockDir = mob.position.clone().sub(pos).normalize();
            mob.takeDamage(damage, knockDir.multiplyScalar(6.0));
          }
        }
      }
    }

    // 4. Spawn Explosion Particles
    this.spawnExplosionParticles(pos);
  }

  private spawnExplosionParticles(pos: THREE.Vector3) {
    const colors = [0xffffff, 0x444444, 0x777777, 0xff7700, 0xff2200];
    for (let i = 0; i < 48; i++) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const size = 0.15 + Math.random() * 0.25;
      const pGeo = new THREE.BoxGeometry(size, size, size);
      const pMat = new THREE.MeshBasicMaterial({ color: col });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.copy(pos);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 12.0,
        Math.random() * 10.0 + 2.0,
        (Math.random() - 0.5) * 12.0
      );

      this.particleGroup.add(pMesh);

      const startTime = performance.now();
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 0.9) {
          this.particleGroup.remove(pMesh);
          pGeo.dispose();
          pMat.dispose();
          return;
        }
        vel.y -= 14.0 * 0.016;
        pMesh.position.addScaledVector(vel, 0.016);
        pMesh.rotation.x += 0.2;
        pMesh.rotation.z += 0.2;
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }

  private updateParticles(_dt: number) {
    // Particle animation handled per particle
  }

  public dispose() {
    this.scene.remove(this.tntGroup);
    this.scene.remove(this.particleGroup);
    this.primedTntList = [];
    this.leverStates.clear();
    this.powerMap.clear();
  }
}
