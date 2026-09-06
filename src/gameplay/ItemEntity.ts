import * as THREE from 'three';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { Block, BLOCK_DEFS, ItemId, ITEM_DEFS } from '../world/BlockTypes';
import { SoundManager } from '../audio/SoundManager';

export class ItemEntity {
  public id: number;
  public count: number;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public mesh: THREE.Mesh;
  public isAlive: boolean = true;
  public wasInWater: boolean = false;
  public onWaterSplash?: (pos: THREE.Vector3) => void;
  private age: number = 0;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, world: World, id: number, count: number, pos: THREE.Vector3) {
    this.scene = scene;
    this.id = id;
    this.count = count;
    this.position = pos.clone();
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      2.5 + Math.random() * 1.5,
      (Math.random() - 0.5) * 2
    );

    // Create 3D floating mini block mesh
    const geo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    const mat = world.terrainMaterial;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  public update(dt: number, world: World, player: Player, sounds: SoundManager, onPickup: (id: number, count: number) => boolean) {
    if (!this.isAlive) return;

    this.age += dt;

    // Fluid buoyancy and current forces
    const blockAtItem = world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y),
      Math.floor(this.position.z)
    );
    const inFluid = blockAtItem === Block.WATER || blockAtItem === Block.LAVA;

    if (inFluid && !this.wasInWater) {
      this.wasInWater = true;
      if (blockAtItem === Block.WATER) {
        sounds?.playSplash?.();
        this.onWaterSplash?.(this.position);
      }
    } else if (!inFluid) {
      this.wasInWater = false;
    }

    if (inFluid) {
      // Gentle buoyancy: items float to water / lava surface
      if (blockAtItem === Block.WATER) {
        this.velocity.y = Math.min(this.velocity.y + 16.0 * dt, 1.2);
        this.velocity.x *= 0.92;
        this.velocity.z *= 0.92;
      } else {
        // Lava buoyancy and viscous drag
        this.velocity.y = Math.min(this.velocity.y + 12.0 * dt, 0.8);
        this.velocity.x *= 0.85;
        this.velocity.z *= 0.85;
      }

      // Fluid current forces push dropped items down streams and waterfalls
      if (world.fluidSimulator) {
        const flow = world.fluidSimulator.getFlowVector(this.position.x, this.position.y, this.position.z);
        if (flow.lengthSq() > 0.001) {
          const force = blockAtItem === Block.WATER ? 2.6 : 1.2;
          this.velocity.x += flow.x * force * dt;
          this.velocity.z += flow.z * force * dt;
          if (flow.y < 0) {
            this.velocity.y += flow.y * 2.5 * dt;
          }
        }
      }
    } else {
      // Gravity
      this.velocity.y -= 12.0 * dt;
    }

    // Move
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Simple block ground collision
    const blockBelow = world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y),
      Math.floor(this.position.z)
    );

    if (blockBelow !== Block.AIR && blockBelow !== Block.WATER && blockBelow !== Block.LAVA && BLOCK_DEFS[blockBelow]?.solid) {
      this.position.y = Math.floor(this.position.y) + 1;
      this.velocity.y = 0;
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
    }

    // Floating bob & rotation
    const bob = Math.sin(this.age * 4) * 0.08;
    this.mesh.position.set(this.position.x, this.position.y + 0.12 + bob, this.position.z);
    this.mesh.rotation.y += dt * 2.5;

    // Magnetic pull towards player if closer than 2.2 blocks
    const playerCenter = player.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    const distToPlayer = this.position.distanceTo(playerCenter);

    if (distToPlayer < 2.5 && this.age > 0.4) {
      const pullDir = playerCenter.clone().sub(this.position).normalize();
      this.position.add(pullDir.multiplyScalar(dt * 7.5));

      // Pickup distance
      if (distToPlayer < 0.9) {
        const pickedUp = onPickup(this.id, this.count);
        if (pickedUp) {
          sounds.playPop();
          this.dispose();
        }
      }
    }

    // Despawn after 5 minutes
    if (this.age > 300) {
      this.dispose();
    }
  }

  public dispose() {
    this.isAlive = false;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
