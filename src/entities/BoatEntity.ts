import * as THREE from 'three';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { Controls } from '../player/Controls';
import { Block } from '../world/BlockTypes';
import { SoundManager } from '../audio/SoundManager';

export class BoatEntity {
  public id: number;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public rotationY: number = 0;
  public forwardSpeed: number = 0;
  public turnVelocity: number = 0;
  public group: THREE.Group;
  public passenger: Player | null = null;
  public isAlive: boolean = true;
  public inWater: boolean = false;
  public onIce: boolean = false;

  // 3D Visual Parts
  private leftOarGroup: THREE.Group;
  private rightOarGroup: THREE.Group;
  private oarStrokeTimer: number = 0;
  private waveTimer: number = 0;

  private scene: THREE.Scene;
  private sounds?: SoundManager;

  constructor(id: number, pos: THREE.Vector3, scene: THREE.Scene, sounds?: SoundManager) {
    this.id = id;
    this.position = pos.clone();
    this.scene = scene;
    this.sounds = sounds;

    this.group = new THREE.Group();
    const { leftOar, rightOar } = this.buildBoatMesh();
    this.leftOarGroup = leftOar;
    this.rightOarGroup = rightOar;

    this.group.position.copy(this.position);
    this.scene.add(this.group);
  }

  private buildBoatMesh(): { leftOar: THREE.Group; rightOar: THREE.Group } {
    // Authentic oak wood material
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x85582e });
    const darkWoodMat = new THREE.MeshLambertMaterial({ color: 0x66401e });

    // 1. Boat bottom floor
    const floorGeo = new THREE.BoxGeometry(1.4, 0.1, 0.82);
    const floorMesh = new THREE.Mesh(floorGeo, woodMat);
    floorMesh.position.set(0, 0.05, 0);
    this.group.add(floorMesh);

    // 2. Left gunwale (side rim)
    const sideGeo = new THREE.BoxGeometry(1.4, 0.38, 0.08);
    const leftSide = new THREE.Mesh(sideGeo, woodMat);
    leftSide.position.set(0, 0.24, 0.45);
    this.group.add(leftSide);

    // 3. Right gunwale
    const rightSide = new THREE.Mesh(sideGeo, woodMat);
    rightSide.position.set(0, 0.24, -0.45);
    this.group.add(rightSide);

    // 4. Bow (front rim)
    const bowGeo = new THREE.BoxGeometry(0.08, 0.38, 0.98);
    const bow = new THREE.Mesh(bowGeo, woodMat);
    bow.position.set(0.74, 0.24, 0);
    this.group.add(bow);

    // 5. Stern (back rim)
    const stern = new THREE.Mesh(bowGeo, woodMat);
    stern.position.set(-0.74, 0.24, 0);
    this.group.add(stern);

    // 6. Left & Right Wooden Oars
    const oarShaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6);
    const oarBladeGeo = new THREE.BoxGeometry(0.03, 0.28, 0.12);

    const createOar = (isLeft: boolean) => {
      const oarGroup = new THREE.Group();
      const shaft = new THREE.Mesh(oarShaftGeo, darkWoodMat);
      shaft.rotation.z = Math.PI / 3;
      shaft.position.set(0, -0.15, 0);
      oarGroup.add(shaft);

      const blade = new THREE.Mesh(oarBladeGeo, darkWoodMat);
      blade.position.set(isLeft ? 0.35 : 0.35, -0.38, 0);
      blade.rotation.z = Math.PI / 3;
      oarGroup.add(blade);

      return oarGroup;
    };

    const leftOar = createOar(true);
    leftOar.position.set(0.1, 0.35, 0.52);
    leftOar.rotation.y = 0.2;
    this.group.add(leftOar);

    const rightOar = createOar(false);
    rightOar.position.set(0.1, 0.35, -0.52);
    rightOar.rotation.y = -0.2;
    this.group.add(rightOar);

    return { leftOar, rightOar };
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

    // Place player safely next to boat
    const exitOffset = new THREE.Vector3(
      Math.sin(this.rotationY + Math.PI / 2) * 1.1,
      0.4,
      Math.cos(this.rotationY + Math.PI / 2) * 1.1
    );
    p.position.add(exitOffset);
    p.updateAABB();
    this.sounds?.playClick();
  }

  public handleInput(dt: number, controls: Controls) {
    let accelerate = 0;
    let turn = 0;

    if (controls.isKeyDown('KeyW')) accelerate += 1;
    if (controls.isKeyDown('KeyS')) accelerate -= 0.5;
    if (controls.isKeyDown('KeyA')) turn += 1;
    if (controls.isKeyDown('KeyD')) turn -= 1;

    // Speed limits: water ~7.5 m/s, ice ~16.0 m/s, ground ~2.5 m/s
    let maxSpeed = 7.5;
    let accelRate = 6.0;

    if (this.onIce) {
      maxSpeed = 16.0; // Authentic high-speed ice boat racing!
      accelRate = 8.0;
    } else if (!this.inWater) {
      maxSpeed = 2.5;
      accelRate = 3.0;
    }

    // Accelerate forward/backward
    const targetSpeed = accelerate * maxSpeed;
    this.forwardSpeed = THREE.MathUtils.lerp(this.forwardSpeed, targetSpeed, accelRate * dt);

    // Turning with inertia
    const turnRate = this.onIce ? 1.8 : 2.5;
    this.turnVelocity = THREE.MathUtils.lerp(this.turnVelocity, turn * turnRate, 8.0 * dt);
    this.rotationY += this.turnVelocity * dt;

    // Oar rowing stroke animation
    if (Math.abs(this.forwardSpeed) > 0.1 || Math.abs(turn) > 0.1) {
      this.oarStrokeTimer += dt * 8.0;
      const stroke = Math.sin(this.oarStrokeTimer) * 0.35;
      this.leftOarGroup.rotation.y = 0.2 + stroke;
      this.rightOarGroup.rotation.y = -0.2 - stroke;
    }
  }

  public update(dt: number, world: World) {
    if (!this.isAlive) return;

    const bx = Math.floor(this.position.x);
    const by = Math.floor(this.position.y);
    const bz = Math.floor(this.position.z);

    const blockAtPos = world.getBlock(bx, by, bz);
    const blockBelow = world.getBlock(bx, by - 0.2, bz);

    this.inWater = blockAtPos === Block.WATER || blockBelow === Block.WATER;
    this.onIce = blockBelow === Block.ICE;

    // 1. Buoyancy & Water Surface settling
    if (this.inWater) {
      // Find top surface of water at current coordinates
      let waterSurfaceY = by;
      if (world.getBlock(bx, by + 1, bz) === Block.WATER) {
        waterSurfaceY = by + 1;
      }
      const targetY = waterSurfaceY + 0.15;
      this.velocity.y += (targetY - this.position.y) * 14.0 * dt - this.velocity.y * 6.0 * dt;

      // Realistic wave rocking tilt
      this.waveTimer += dt * 3.2;
      this.group.rotation.z = Math.sin(this.waveTimer) * 0.035;
      this.group.rotation.x = Math.cos(this.waveTimer * 0.7) * 0.025;

      // Drift realistically on fluid currents
      if (world.fluidSimulator) {
        const flow = world.fluidSimulator.getFlowVector(this.position.x, this.position.y, this.position.z);
        if (flow.lengthSq() > 0.001) {
          this.velocity.x += flow.x * 2.8 * dt;
          this.velocity.z += flow.z * 2.8 * dt;
          if (flow.y < 0) {
            this.velocity.y += flow.y * 3.0 * dt;
          }
        }
      }
    } else {
      // Gravity on dry land
      this.velocity.y -= 18.0 * dt;
      this.group.rotation.z = 0;
      this.group.rotation.x = 0;
    }

    // 2. Forward propulsion along boat facing yaw
    const forwardX = Math.sin(this.rotationY) * this.forwardSpeed;
    const forwardZ = Math.cos(this.rotationY) * this.forwardSpeed;

    this.velocity.x = forwardX;
    this.velocity.z = forwardZ;

    // 3. Move boat
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Simple block ground collision
    const footBlock = world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z));
    if (footBlock !== Block.AIR && footBlock !== Block.WATER && !this.inWater) {
      this.position.y = Math.floor(this.position.y) + 1;
      this.velocity.y = 0;
    }

    // 4. Update 3D mesh transform
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
