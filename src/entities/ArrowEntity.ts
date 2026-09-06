import * as THREE from 'three';
import { World } from '../world/World';
import { SoundManager } from '../audio/SoundManager';
import { MobManager } from './MobManager';
import { Block, BLOCK_DEFS } from '../world/BlockTypes';

export class ArrowEntity {
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public isStuck: boolean = false;
  public isAlive: boolean = true;
  public power: number; // 0.1 to 1.0
  public damage: number;
  public age: number = 0;

  public mesh: THREE.Group;
  private scene: THREE.Scene;
  private sounds: SoundManager;

  constructor(
    scene: THREE.Scene,
    sounds: SoundManager,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    power: number
  ) {
    this.scene = scene;
    this.sounds = sounds;
    this.power = Math.max(0.15, Math.min(1.0, power));
    this.damage = Math.round(this.power * 8 + 3); // 4 to 11 damage

    this.position = origin.clone();
    const speed = 14.0 + this.power * 22.0; // 17 to 36 m/s
    this.velocity = direction.clone().normalize().multiplyScalar(speed);

    // Build authentic 3D arrow mesh
    this.mesh = new THREE.Group();

    // 1. Wooden Shaft
    const shaftGeo = new THREE.BoxGeometry(0.04, 0.04, 0.6);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    this.mesh.add(shaft);

    // 2. Metallic Flint Arrowhead Tip
    const tipGeo = new THREE.ConeGeometry(0.06, 0.14, 4);
    tipGeo.rotateX(-Math.PI / 2);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, metalness: 0.6, roughness: 0.4 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(0, 0, -0.36);
    this.mesh.add(tip);

    // 3. Feather Fletching Fins
    const finGeo = new THREE.BoxGeometry(0.12, 0.01, 0.12);
    const finMat = new THREE.MeshStandardMaterial({ color: 0xf1f2f6, roughness: 0.9 });
    const fin1 = new THREE.Mesh(finGeo, finMat);
    fin1.position.set(0, 0, 0.24);
    this.mesh.add(fin1);

    const fin2 = new THREE.Mesh(finGeo, finMat);
    fin2.rotation.z = Math.PI / 2;
    fin2.position.set(0, 0, 0.24);
    this.mesh.add(fin2);

    this.mesh.position.copy(this.position);
    this.orientMesh();

    this.scene.add(this.mesh);
  }

  private orientMesh() {
    if (this.velocity.lengthSq() > 0.01) {
      const forward = new THREE.Vector3(0, 0, -1);
      const dir = this.velocity.clone().normalize();
      this.mesh.quaternion.setFromUnitVectors(forward, dir);
    }
  }

  public update(dt: number, world: World, mobManager?: MobManager): boolean {
    if (!this.isAlive) return false;

    this.age += dt;

    // Despawn if stuck too long or out of bounds
    if ((this.isStuck && this.age > 45) || this.age > 60 || this.position.y < -10 || this.position.y > 160) {
      this.dispose();
      return false;
    }

    if (this.isStuck) {
      return true;
    }

    // Ballistic Physics
    this.velocity.y -= 15.0 * dt; // Gravity
    this.velocity.x *= (1 - 0.02 * dt); // Air drag
    this.velocity.z *= (1 - 0.02 * dt);

    const step = this.velocity.clone().multiplyScalar(dt);
    const nextPos = this.position.clone().add(step);

    // 1. Check Mob Collision
    if (mobManager) {
      for (const mob of mobManager.mobs) {
        if (!mob.isAlive) continue;
        const mobCenter = mob.position.clone().add(new THREE.Vector3(0, 0.7, 0));
        const dist = nextPos.distanceTo(mobCenter);
        if (dist < 0.75) {
          const knockback = this.velocity.clone().normalize().setY(0.35).multiplyScalar(1.2);
          mob.takeDamage(this.damage, knockback);
          this.sounds.playCritHit();
          this.sounds.playArrowHit();
          this.dispose();
          return false;
        }
      }
    }

    // 2. Check Solid Voxel Collision
    const blockX = Math.floor(nextPos.x);
    const blockY = Math.floor(nextPos.y);
    const blockZ = Math.floor(nextPos.z);
    const block = world.getBlock(blockX, blockY, blockZ);

    if (block !== Block.AIR && block !== Block.WATER && BLOCK_DEFS[block]?.solid) {
      // Arrow embeds into the block
      this.isStuck = true;
      this.position.copy(nextPos);
      this.mesh.position.copy(this.position);
      this.sounds.playArrowHit();
      return true;
    }

    // Advance position
    this.position.copy(nextPos);
    this.mesh.position.copy(this.position);
    this.orientMesh();

    return true;
  }

  public dispose() {
    this.isAlive = false;
    this.scene.remove(this.mesh);
  }
}
