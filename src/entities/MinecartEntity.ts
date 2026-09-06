import * as THREE from 'three';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { Controls } from '../player/Controls';
import { Block } from '../world/BlockTypes';
import { SoundManager } from '../audio/SoundManager';

export class MinecartEntity {
  public id: number;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public rotationY: number = 0;
  public speed: number = 0;
  public group: THREE.Group;
  public passenger: Player | null = null;
  public isAlive: boolean = true;
  public onRail: boolean = false;

  private scene: THREE.Scene;
  private sounds?: SoundManager;
  private clatterTimer: number = 0;

  constructor(id: number, pos: THREE.Vector3, scene: THREE.Scene, sounds?: SoundManager) {
    this.id = id;
    this.position = pos.clone();
    this.scene = scene;
    this.sounds = sounds;

    this.group = new THREE.Group();
    this.buildMinecartMesh();
    this.group.position.copy(this.position);
    this.scene.add(this.group);
  }

  private buildMinecartMesh() {
    const ironMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

    // 1. Bottom floor plate
    const bottomGeo = new THREE.BoxGeometry(0.86, 0.08, 0.66);
    const bottom = new THREE.Mesh(bottomGeo, ironMat);
    bottom.position.set(0, 0.06, 0);
    this.group.add(bottom);

    // 2. 4 Side walls
    const sideLongGeo = new THREE.BoxGeometry(0.86, 0.44, 0.06);
    const sideLeft = new THREE.Mesh(sideLongGeo, ironMat);
    sideLeft.position.set(0, 0.28, 0.33);
    this.group.add(sideLeft);

    const sideRight = new THREE.Mesh(sideLongGeo, ironMat);
    sideRight.position.set(0, 0.28, -0.33);
    this.group.add(sideRight);

    const sideShortGeo = new THREE.BoxGeometry(0.06, 0.44, 0.72);
    const front = new THREE.Mesh(sideShortGeo, ironMat);
    front.position.set(0.43, 0.28, 0);
    this.group.add(front);

    const back = new THREE.Mesh(sideShortGeo, ironMat);
    back.position.set(-0.43, 0.28, 0);
    this.group.add(back);

    // 3. 4 Steel Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 8);
    const offsets = [
      [-0.28, -0.28],
      [-0.28, 0.28],
      [0.28, -0.28],
      [0.28, 0.28]
    ];
    for (const [wx, wz] of offsets) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.02, wz);
      this.group.add(wheel);
    }
  }

  public get passengerPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + 0.32, this.position.z);
  }

  public mount(player: Player) {
    if (this.passenger) return;
    this.passenger = player;
    player.mountedVehicle = this;
    this.sounds?.playClick();
  }

  public dismount() {
    if (!this.passenger) return;
    const p = this.passenger;
    this.passenger = null;
    p.mountedVehicle = null;

    // Place passenger on side of cart
    p.position.set(this.position.x + 0.9, this.position.y + 0.3, this.position.z);
    p.updateAABB();
    this.sounds?.playClick();
  }

  public handleInput(dt: number, controls: Controls) {
    let push = 0;
    if (controls.isKeyDown('KeyW')) push += 1;
    if (controls.isKeyDown('KeyS')) push -= 1;

    // Accelerate along current facing/rail vector
    const pushAccel = 5.0;
    this.speed += push * pushAccel * dt;
    // Speed cap at 8.0 m/s
    this.speed = THREE.MathUtils.clamp(this.speed, -8.0, 8.0);
  }

  public update(dt: number, world: World) {
    if (!this.isAlive) return;

    const bx = Math.floor(this.position.x);
    const by = Math.floor(this.position.y);
    const bz = Math.floor(this.position.z);

    // Check if on rail (current block or block directly below)
    const blockAt = world.getBlock(bx, by, bz);
    const blockBelow = world.getBlock(bx, by - 0.2, bz);

    this.onRail = blockAt === Block.RAIL || blockBelow === Block.RAIL;

    if (this.onRail) {
      const railY = blockAt === Block.RAIL ? by : by - 0.2;
      this.position.y = Math.floor(railY) + 0.08;
      this.velocity.y = 0;

      // Determine rail orientation by checking neighboring rails
      const hasRailX = world.getBlock(bx + 1, by, bz) === Block.RAIL || world.getBlock(bx - 1, by, bz) === Block.RAIL;
      const hasRailZ = world.getBlock(bx, by, bz + 1) === Block.RAIL || world.getBlock(bx, by, bz - 1) === Block.RAIL;

      // Check for slope climbing (rail 1 block higher)
      const slopeUpX = world.getBlock(bx + 1, by + 1, bz) === Block.RAIL;
      if (slopeUpX && this.speed > 0) {
        this.position.y += Math.abs(this.speed) * 0.4 * dt;
      }

      // Authentic low kinetic friction (0.992 per frame allows long coasting)
      const kineticFriction = Math.pow(0.992, dt * 60);
      this.speed *= kineticFriction;

      // Stop jitter at near zero
      if (Math.abs(this.speed) < 0.02) this.speed = 0;

      // Determine movement axis
      if (hasRailX || (!hasRailZ && Math.abs(this.velocity.x) >= Math.abs(this.velocity.z))) {
        // X-axis rail movement
        this.rotationY = 0;
        this.velocity.x = this.speed;
        this.velocity.z = 0;
      } else {
        // Z-axis rail movement
        this.rotationY = Math.PI / 2;
        this.velocity.x = 0;
        this.velocity.z = this.speed;
      }

      // Play rail clatter sound when moving
      if (Math.abs(this.speed) > 0.5) {
        this.clatterTimer += dt;
        if (this.clatterTimer > 0.45) {
          this.clatterTimer = 0;
          this.sounds?.playFootstep('stone');
        }
      }
    } else {
      // Off rail: high ground friction and gravity
      this.velocity.y -= 18.0 * dt;
      this.speed *= Math.pow(0.75, dt * 60);
      this.velocity.x = Math.sin(this.rotationY) * this.speed;
      this.velocity.z = Math.cos(this.rotationY) * this.speed;

      const footBlock = world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z));
      if (footBlock !== Block.AIR && footBlock !== Block.WATER) {
        this.position.y = Math.floor(this.position.y) + 1;
        this.velocity.y = 0;
      }
    }

    // Apply movement
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Update 3D mesh transform
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;
  }

  public dispose() {
    this.isAlive = false;
    if (this.passenger) {
      this.dismount();
    }
    this.scene.remove(this.group);
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
