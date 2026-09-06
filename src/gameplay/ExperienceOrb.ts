import * as THREE from 'three';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { Block, BLOCK_DEFS } from '../world/BlockTypes';
import { SoundManager } from '../audio/SoundManager';

export class ExperienceOrb {
  public value: number;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public mesh: THREE.Mesh;
  public isAlive: boolean = true;
  private age: number = 0;
  private scene: THREE.Scene;
  private mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, pos: THREE.Vector3, value: number = 1) {
    this.scene = scene;
    this.value = value;
    this.position = pos.clone();
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      2.0 + Math.random() * 1.5,
      (Math.random() - 0.5) * 2
    );

    // Glowing pulsating chartreuse/emerald crystal orb
    const geo = new THREE.OctahedronGeometry(0.12, 0);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x88ff00,
      wireframe: false,
      transparent: true,
      opacity: 0.88
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  public update(dt: number, world: World, player: Player, sounds: SoundManager) {
    if (!this.isAlive) return;

    this.age += dt;

    // Gravity
    this.velocity.y -= 10.0 * dt;

    // Velocity integration
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Ground bounce & collision
    const blockBelow = world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y),
      Math.floor(this.position.z)
    );

    if (blockBelow !== Block.AIR && blockBelow !== Block.WATER && BLOCK_DEFS[blockBelow]?.solid) {
      this.position.y = Math.floor(this.position.y) + 1;
      this.velocity.y = Math.abs(this.velocity.y) * 0.4;
      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;
    }

    // Pulsating color shifting between green (#76ff03) and bright gold (#ffd600)
    const colorPhase = Math.sin(this.age * 12) * 0.5 + 0.5;
    const r = THREE.MathUtils.lerp(0.46, 1.0, colorPhase);
    const g = THREE.MathUtils.lerp(1.0, 0.84, colorPhase);
    const b = THREE.MathUtils.lerp(0.01, 0.0, colorPhase);
    this.mat.color.setRGB(r, g, b);

    // Floating bob & dynamic rotation
    const bob = Math.sin(this.age * 6) * 0.06;
    this.mesh.position.set(this.position.x, this.position.y + 0.08 + bob, this.position.z);
    this.mesh.rotation.x += dt * 3.5;
    this.mesh.rotation.y += dt * 4.2;

    // Magnetic pull towards player if closer than 6.0 blocks
    const playerCenter = player.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const distToPlayer = this.position.distanceTo(playerCenter);

    if (distToPlayer < 6.5 && this.age > 0.2) {
      // Acceleration increases as orb gets closer
      const accel = THREE.MathUtils.lerp(12.0, 4.0, distToPlayer / 6.5);
      const pullDir = playerCenter.clone().sub(this.position).normalize();
      this.position.add(pullDir.multiplyScalar(dt * accel));

      // Collection radius
      if (distToPlayer < 0.9) {
        player.addXp(this.value);
        sounds.playOrb();
        this.dispose();
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
    this.mat.dispose();
  }
}
