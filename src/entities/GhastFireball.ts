import * as THREE from 'three';
import { World } from '../world/World';
import { SoundManager } from '../audio/SoundManager';
import { BLOCK_DEFS } from '../world/BlockTypes';

export class GhastFireball {
  public mesh: THREE.Group;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public isAlive: boolean = true;
  public isDeflected: boolean = false;
  private scene: THREE.Scene;
  private world: World;
  private sounds: SoundManager;
  private age: number = 0;
  private maxAge: number = 7.0;
  private trailParticles: THREE.Group;

  constructor(
    scene: THREE.Scene,
    world: World,
    sounds: SoundManager,
    startPos: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number = 14.0
  ) {
    this.scene = scene;
    this.world = world;
    this.sounds = sounds;
    this.position = startPos.clone();
    this.velocity = direction.clone().normalize().multiplyScalar(speed);

    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);

    // Inner bright hot core
    const coreGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    this.mesh.add(core);

    // Outer blazing flame envelope
    const flameGeo = new THREE.BoxGeometry(0.38, 0.38, 0.38);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    this.mesh.add(flame);

    // Fiery point light illuminating caverns as it flies
    const light = new THREE.PointLight(0xff7700, 2.5, 12);
    this.mesh.add(light);

    this.scene.add(this.mesh);

    // Particle group for smoke & sparks trail
    this.trailParticles = new THREE.Group();
    this.scene.add(this.trailParticles);
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerDamage: (damage: number) => void,
    onExplosion: (pos: THREE.Vector3, radius: number) => void
  ): boolean {
    if (!this.isAlive) return false;

    this.age += dt;
    if (this.age >= this.maxAge) {
      this.explode(onExplosion);
      return false;
    }

    // Move forward
    this.position.addScaledVector(this.velocity, dt);
    this.mesh.position.copy(this.position);

    // Spin flame
    this.mesh.rotation.x += 4.0 * dt;
    this.mesh.rotation.y += 5.0 * dt;

    // Spawn flame trail sparks
    this.spawnTrailParticle();

    // 1. Check collision with player
    const distToPlayer = this.position.distanceTo(playerPos);
    if (!this.isDeflected && distToPlayer < 1.4) {
      onPlayerDamage(9);
      this.explode(onExplosion);
      return false;
    }

    // 2. Check collision with world blocks
    const bx = Math.floor(this.position.x);
    const by = Math.floor(this.position.y);
    const bz = Math.floor(this.position.z);
    const block = this.world.getBlock(bx, by, bz);
    if (BLOCK_DEFS[block]?.solid) {
      this.explode(onExplosion);
      return false;
    }

    // Update trail particles
    this.updateTrail(dt);

    return true;
  }

  // Deflect fireball back in player's look direction
  public deflect(newDir: THREE.Vector3) {
    this.isDeflected = true;
    this.velocity.copy(newDir.normalize().multiplyScalar(18.0));
    this.sounds.playMobHit();
    this.sounds.playLevelUp();
  }

  private explode(onExplosion: (pos: THREE.Vector3, radius: number) => void) {
    this.isAlive = false;
    this.sounds.playExplosion();
    onExplosion(this.position.clone(), 3.0);
    this.dispose();
  }

  private spawnTrailParticle() {
    if (Math.random() < 0.3) return;
    const pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const colors = [0xff2200, 0xff7700, 0xffbb00, 0x444444];
    const pMat = new THREE.MeshBasicMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      transparent: true,
      opacity: 0.8
    });
    const p = new THREE.Mesh(pGeo, pMat);
    p.position.copy(this.position);
    this.trailParticles.add(p);
    p.userData = { age: 0, maxAge: 0.4 };
  }

  private updateTrail(dt: number) {
    for (let i = this.trailParticles.children.length - 1; i >= 0; i--) {
      const p = this.trailParticles.children[i] as THREE.Mesh;
      p.userData.age += dt;
      p.position.y += 0.5 * dt;
      if (p.userData.age >= p.userData.maxAge) {
        this.trailParticles.remove(p);
        p.geometry.dispose();
      }
    }
  }

  public dispose() {
    this.isAlive = false;
    this.scene.remove(this.mesh);
    this.scene.remove(this.trailParticles);
  }
}
