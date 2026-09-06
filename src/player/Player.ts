import * as THREE from 'three';
import { World } from '../world/World';
import { AABB } from './AABB';
import { Controls } from './Controls';
import { SoundManager } from '../audio/SoundManager';
import { Block, SoundGroup, BLOCK_DEFS, ItemId } from '../world/BlockTypes';
import { TextureAtlas } from '../textures/TextureAtlas';
import { FACES } from '../world/Chunk';
import { Inventory } from '../gameplay/Inventory';
import { PlayerModel } from './PlayerModel';

export enum CameraPerspective {
  FIRST_PERSON = 0,
  THIRD_PERSON_BACK = 1,
  THIRD_PERSON_FRONT = 2,
  THIRD_PERSON_ISOMETRIC = 3
}

export class Player {
  public camera: THREE.PerspectiveCamera;
  public controls: Controls;
  public world: World;
  public sounds: SoundManager;
  public atlas: TextureAtlas;
  public perspective: CameraPerspective = CameraPerspective.FIRST_PERSON;
  public playerModel: PlayerModel;

  public position: THREE.Vector3 = new THREE.Vector3(0, 40, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public yaw: number = 0;
  public pitch: number = 0;

  // 3D Isometric Orbital Camera & 360° Control State
  public isoOrbitYaw: number = 0.785; // 45° default diagonal
  public isoOrbitPitch: number = 0.65; // ~37° classic isometric pitch
  public isoDistance: number = 7.0; // Distance of orbital camera
  public targetIsoDistance: number = 7.0; // Target distance for smooth zoom lerping
  public currentBackCamDist: number = 3.4; // Smoothed distance for 3rd person back camera
  public currentFrontCamDist: number = 3.0; // Smoothed distance for 3rd person front camera
  public modelFacingYaw: number = 0; // Steve's actual facing direction in isometric mode

  // Dimensions
  public static readonly WIDTH = 0.6;
  public static readonly HEIGHT = 1.8;
  public static readonly EYE_HEIGHT = 1.62;
  public static readonly SNEAK_EYE_HEIGHT = 1.45;

  public aabb: AABB;

  // States
  public onGround: boolean = false;
  public isSprinting: boolean = false;
  public isSneaking: boolean = false;
  public isFlying: boolean = false;
  public isInWater: boolean = false;
  public isHeadUnderwater: boolean = false;
  public gameMode: 'survival' | 'creative' = 'survival';

  // Death state and callback
  public isDead: boolean = false;
  public deathRoll: number = 0;
  public onDeath?: () => void;
  public onWaterSplash?: (pos: THREE.Vector3, count?: number) => void;

  // Stats
  public health: number = 20; // 10 hearts
  public maxHealth: number = 20;
  public hunger: number = 20; // 10 drumsticks
  public saturation: number = 5.0;
  public exhaustion: number = 0.0;
  public air: number = 300; // 10 bubbles (300 ticks)
  public maxAir: number = 300;
  public xp: number = 0;
  public level: number = 0;

  public inventory?: Inventory;
  private regenTimer: number = 0;
  private starveTimer: number = 0;
  public isChargingBow: boolean = false;
  public bowCharge: number = 0;

  // Potion status effect modifiers
  public potionSpeedMultiplier: number = 1.0;
  public hasFireResistance: boolean = false;
  public potionStrengthMultiplier: number = 1.0;
  public hasNightVision: boolean = false;

  // Drowning and aquatic timers
  private drownTimer: number = 0;
  private wasHeadUnderwater: boolean = false;
  private wasInWater: boolean = false;
  private swimSoundTimer: number = 0;

  // Fall damage
  private fallDistance: number = 0;
  private highestFallY: number = 0;

  // Bobbing & animation
  private bobTimer: number = 0;
  public swingProgress: number = 0;
  public isSwinging: boolean = false;

  // First-person held item 3D mesh
  public handContainer: THREE.Group;
  public heldItemMesh: THREE.Object3D | null = null;
  public handTorchLight: THREE.PointLight;
  public currentHeldItemId: number = 0;

  // Vehicle mounting (boat, minecart)
  public mountedVehicle: any = null;

  private lavaTimer: number = 0;

  // Audio footsteps
  private stepDistance: number = 0;

  // Camera FOV Sprint Lerping
  public baseFov: number = 75;
  public targetFov: number = 75;

  // Sprint cloud particles
  public sprintParticleGroup: THREE.Group;
  private sprintParticleTimer: number = 0;
  private sprintParticles: {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    age: number;
    maxAge: number;
    initialScale: number;
  }[] = [];

  constructor(
    camera: THREE.PerspectiveCamera,
    controls: Controls,
    world: World,
    sounds: SoundManager,
    atlas: TextureAtlas
  ) {
    this.camera = camera;
    this.controls = controls;
    this.world = world;
    this.sounds = sounds;
    this.atlas = atlas;

    this.aabb = new AABB();
    this.updateAABB();

    // Initialize base camera FOV
    if (this.camera) {
      this.baseFov = this.camera.fov;
      this.targetFov = this.camera.fov;
    }

    // Sprint cloud particle group added to scene
    this.sprintParticleGroup = new THREE.Group();
    if (this.world?.scene) {
      this.world.scene.add(this.sprintParticleGroup);
    }

    // Held item setup attached to camera
    this.handContainer = new THREE.Group();
    this.handContainer.position.set(0.35, -0.35, -0.55);
    this.camera.add(this.handContainer);

    // Dynamic hand-held torch lighting
    this.handTorchLight = new THREE.PointLight(0xffaa44, 1.4, 16);
    this.handTorchLight.visible = false;
    this.handContainer.add(this.handTorchLight);

    // 3D Steve Humanoid model for 3rd person views
    this.playerModel = new PlayerModel(this.atlas);
    this.playerModel.group.visible = false;
    this.world.scene.add(this.playerModel.group);

    // Register F5 perspective toggling
    this.controls.onTogglePerspective = () => {
      this.togglePerspective();
    };

    // Register camera zoom (mouse wheel or -/= keys in isometric mode, or Shift+wheel)
    this.controls.onZoom = (delta: number) => {
      if (this.perspective === CameraPerspective.THIRD_PERSON_ISOMETRIC) {
        this.targetIsoDistance = THREE.MathUtils.clamp(this.targetIsoDistance + delta * 0.85, 2.5, 16.0);
        this.showToast(`Isometric Zoom: ${this.targetIsoDistance.toFixed(1)}m`);
        return true;
      }
      return false;
    };
  }

  public togglePerspective() {
    this.perspective = (this.perspective + 1) % 4;
    if (this.perspective === CameraPerspective.THIRD_PERSON_ISOMETRIC) {
      this.isoOrbitYaw = this.yaw + 0.35;
      this.isoOrbitPitch = 0.65;
    }
    const names = [
      'First-Person (Normal)',
      'Third-Person Back (Trailing Camera)',
      'Third-Person Front (Selfie Camera)',
      'Isometric Orbital (360° Free View - Scroll Wheel to Zoom)'
    ];
    this.showToast(`Perspective: ${names[this.perspective]}`);
  }

  public showToast(msg: string) {
    let el = document.getElementById('camera-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'camera-toast';
      el.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 18px;border-radius:4px;font-family:sans-serif;font-size:14px;font-weight:bold;z-index:9999;pointer-events:none;transition:opacity 0.25s ease;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout((el as any)._timeout);
    (el as any)._timeout = setTimeout(() => {
      if (el) el.style.opacity = '0';
    }, 1400);
  }

  public setPosition(x: number, y: number, z: number) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.updateAABB();
    this.highestFallY = y;
  }

  public updateAABB() {
    const halfW = Player.WIDTH / 2;
    this.aabb.set(
      this.position.x - halfW,
      this.position.y,
      this.position.z - halfW,
      this.position.x + halfW,
      this.position.y + Player.HEIGHT,
      this.position.z + halfW
    );
  }

  public update(deltaTime: number) {
    const rawDt = Math.min(deltaTime, 0.1);

    if (this.isDead) {
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, this.deathRoll, 'YXZ');
      return;
    }

    // 1. Mouse rotation (processed immediately at rendering framerate for zero latency)
    const { dx, dy } = this.controls.consumeMouseLook();
    const sensitivity = 0.0022;

    if (this.perspective === CameraPerspective.THIRD_PERSON_ISOMETRIC) {
      // Full 360° Horizontal Orbit around character
      this.isoOrbitYaw -= dx * sensitivity;
      // Vertical Elevation Tilt: mouse moving up tilts camera up (and looking down), mouse moving down lowers camera towards ground
      this.isoOrbitPitch += dy * sensitivity;
      // Clamp between -0.35 rad (camera looking up at character from ground) and 1.46 rad (tactical top-down)
      this.isoOrbitPitch = THREE.MathUtils.clamp(this.isoOrbitPitch, -0.35, 1.46);
    } else {
      this.yaw -= dx * sensitivity;
      this.pitch -= dy * sensitivity;
      // Clamp pitch between -89.5 and +89.5 degrees to avoid gimbal flip
      const maxPitch = (Math.PI / 2) - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

      // Enforce YXZ Euler rotation order: yaw (Y) then pitch (X) with 0 roll (Z)
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }

    // 2. Fixed-timestep physics sub-stepping loop (60 Hz = ~0.0166s per sub-step)
    const FIXED_DT = 1 / 60;
    let accumulator = rawDt;
    let lastMoveDir = new THREE.Vector3();
    while (accumulator >= FIXED_DT) {
      lastMoveDir = this.physicsStep(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    if (accumulator > 0.001) {
      lastMoveDir = this.physicsStep(accumulator);
    }

    // 3. Camera Bobbing, Perspectives, and 3D Player Model Rendering
    this.updateCamera(rawDt, lastMoveDir);

    const dt = rawDt;
    const moveDir = lastMoveDir;

    // 4. Oxygen and Drowning in Survival
    if (this.gameMode === 'survival') {
      if (this.isHeadUnderwater) {
        this.air -= dt * 20;
        if (this.air <= 0) {
          this.air = 0;
          this.drownTimer += dt;
          if (this.drownTimer >= 1.0) {
            this.drownTimer = 0;
            this.takeDamage(2); // 1 heart of drowning damage
            this.sounds.playDrown();
          }
        }
      } else {
        this.air = Math.min(this.maxAir, this.air + dt * 60);
        this.drownTimer = 0;
      }

      // Hunger Exhaustion & Natural Regeneration
      if (this.isSprinting && moveDir.lengthSq() > 0) {
        this.addExhaustion(0.12 * dt);
      }

      // Natural Regeneration: if hunger >= 18 and health < 20, heal 1 HP every 4s
      if (this.hunger >= 18 && this.health < 20) {
        this.regenTimer += dt;
        if (this.regenTimer >= 4.0) {
          this.regenTimer = 0;
          this.health = Math.min(20, this.health + 1);
          this.addExhaustion(1.5);
        }
      } else {
        this.regenTimer = 0;
      }

      // Starvation damage: if hunger === 0, damage 1 HP every 4s
      if (this.hunger <= 0) {
        this.starveTimer += dt;
        if (this.starveTimer >= 4.0) {
          this.starveTimer = 0;
          this.takeDamage(1);
        }
      } else {
        this.starveTimer = 0;
      }
    }

    // 5. Update held item animation (swinging)
    this.updateHeldItem(dt);

    // 6. Update active sprint dust cloud particles
    this.updateSprintParticles(rawDt);
  }

  private physicsStep(dt: number): THREE.Vector3 {
    // 1. Check water state
    const blockAtFeet = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.2),
      Math.floor(this.position.z)
    );
    const blockAtTorso = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.8),
      Math.floor(this.position.z)
    );
    const blockAtEyes = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + Player.EYE_HEIGHT),
      Math.floor(this.position.z)
    );
    this.isInWater = blockAtFeet === Block.WATER || blockAtTorso === Block.WATER;
    this.isHeadUnderwater = blockAtEyes === Block.WATER;

    // Underwater visual effect toggle
    const waterOverlay = document.getElementById('water-overlay');
    if (waterOverlay) {
      if (this.isHeadUnderwater) waterOverlay.classList.remove('hidden');
      else waterOverlay.classList.add('hidden');
    }

    // 2. Movement input & speed
    this.isSprinting = this.controls.isKeyDown('ControlLeft') || (this.controls.isKeyDown('KeyW') && this.isSprinting);
    this.isSneaking = this.controls.isKeyDown('ShiftLeft') || this.controls.isKeyDown('ShiftRight');

    let baseSpeed = 4.3; // Walk speed
    if (this.isSprinting) baseSpeed = 5.6;
    if (this.isSneaking) baseSpeed = 1.3;
    if (this.isInWater) baseSpeed = this.isSprinting ? 3.8 : 2.2; // Fast swim strokes when sprinting in water
    if (this.isFlying) baseSpeed = 11.0;

    // Apply speed potion multiplier
    if (this.potionSpeedMultiplier !== 1.0) {
      baseSpeed *= this.potionSpeedMultiplier;
    }

    // Soul sand sludge slowing
    const blockBelowFeet = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y - 0.1),
      Math.floor(this.position.z)
    );
    if (blockBelowFeet === Block.SOUL_SAND && !this.isFlying) {
      baseSpeed *= 0.45;
    }

    // Molten Lava burning damage (immune if Fire Resistance potion active)
    const inLava = blockAtFeet === Block.LAVA || blockAtEyes === Block.LAVA;
    if (inLava && this.gameMode === 'survival' && !this.hasFireResistance) {
      this.lavaTimer += dt;
      if (this.lavaTimer >= 0.5) {
        this.lavaTimer = 0;
        this.takeDamage(4); // 2 hearts burning
      }
    } else {
      this.lavaTimer = 0;
    }

    // Movement direction vectors
    const moveDir = new THREE.Vector3();

    if (this.perspective === CameraPerspective.THIRD_PERSON_ISOMETRIC) {
      // True 360° Camera-Relative Directional Movement
      // Forward/Right vectors on the horizontal ground plane relative to camera orbital view
      const camForward = new THREE.Vector3(-Math.sin(this.isoOrbitYaw), 0, -Math.cos(this.isoOrbitYaw)).normalize();
      const camRight = new THREE.Vector3(Math.cos(this.isoOrbitYaw), 0, -Math.sin(this.isoOrbitYaw)).normalize();

      if (this.controls.isKeyDown('KeyW')) moveDir.add(camForward);
      if (this.controls.isKeyDown('KeyS')) moveDir.sub(camForward);
      if (this.controls.isKeyDown('KeyD')) moveDir.add(camRight);
      if (this.controls.isKeyDown('KeyA')) moveDir.sub(camRight);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        // Steve smoothly faces the exact 360° direction of movement
        const targetFacing = Math.atan2(-moveDir.x, -moveDir.z);
        let diff = targetFacing - this.modelFacingYaw;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.modelFacingYaw += diff * Math.min(1.0, 18.0 * dt);
        this.yaw = this.modelFacingYaw;
      }
    } else {
      // First Person & Standard 3rd Person: Forward is based on player yaw
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

      if (this.controls.isKeyDown('KeyW')) moveDir.add(forward);
      if (this.controls.isKeyDown('KeyS')) moveDir.sub(forward);
      if (this.controls.isKeyDown('KeyD')) moveDir.add(right);
      if (this.controls.isKeyDown('KeyA')) moveDir.sub(right);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
      }
      this.modelFacingYaw = this.yaw;
    }

    // 3. Handle Flying vs Standard Gravity
    if (this.isFlying) {
      this.velocity.x = moveDir.x * baseSpeed;
      this.velocity.z = moveDir.z * baseSpeed;
      this.velocity.y = 0;

      if (this.controls.isKeyDown('Space')) this.velocity.y = baseSpeed * 0.8;
      if (this.isSneaking) this.velocity.y = -baseSpeed * 0.8;

      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.z += this.velocity.z * dt;
      this.updateAABB();
      this.highestFallY = this.position.y;
    } else {
      // Standard physics: acceleration & friction
      const accel = this.onGround ? 12.0 : 3.0;
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveDir.x * baseSpeed, accel * dt);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveDir.z * baseSpeed, accel * dt);

      // Swimming or Gravity
      if (this.isInWater) {
        // Cushion fall immediately upon entering water - cancels fall damage!
        this.highestFallY = this.position.y;

        // Fluid current flow push from water streams and waterfalls
        if (this.world.fluidSimulator) {
          const flow = this.world.fluidSimulator.getFlowVector(
            this.position.x,
            this.position.y + 0.4,
            this.position.z
          );
          if (flow.lengthSq() > 0.001) {
            const currentForce = 2.4;
            this.velocity.x += flow.x * currentForce * dt;
            this.velocity.z += flow.z * currentForce * dt;
            if (flow.y < 0) {
              this.velocity.y += flow.y * 3.2 * dt;
            }
          }
        }

        // Water vertical swimming & buoyancy
        if (this.controls.isKeyDown('Space')) {
          this.velocity.y = 3.4; // Swim up
        } else if (this.isSneaking) {
          this.velocity.y = -3.2; // Dive down
        } else {
          // Gentle neutral settling in water (doesn't plummet like a stone)
          this.velocity.y = Math.max(-1.5, this.velocity.y - 4.5 * dt);
        }

        // Viscous horizontal water drag
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveDir.x * baseSpeed, 6.0 * dt);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveDir.z * baseSpeed, 6.0 * dt);
      } else if (inLava) {
        this.highestFallY = this.position.y;

        // Fluid current flow push in molten lava (viscous, slower)
        if (this.world.fluidSimulator) {
          const flow = this.world.fluidSimulator.getFlowVector(
            this.position.x,
            this.position.y + 0.4,
            this.position.z
          );
          if (flow.lengthSq() > 0.001) {
            const currentForce = 1.0;
            this.velocity.x += flow.x * currentForce * dt;
            this.velocity.z += flow.z * currentForce * dt;
            if (flow.y < 0) {
              this.velocity.y += flow.y * 1.6 * dt;
            }
          }
        }

        if (this.controls.isKeyDown('Space')) {
          this.velocity.y = 2.0;
        } else if (this.isSneaking) {
          this.velocity.y = -2.0;
        } else {
          this.velocity.y = Math.max(-1.0, this.velocity.y - 5.0 * dt);
        }

        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveDir.x * baseSpeed * 0.4, 8.0 * dt);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveDir.z * baseSpeed * 0.4, 8.0 * dt);
      } else {
        // Normal Gravity
        this.velocity.y -= 28.0 * dt;

        // Jump
        if (this.onGround && this.controls.isKeyDown('Space')) {
          this.velocity.y = 8.6;
          this.onGround = false;
        }
      }

      // Track fall distance
      if (this.velocity.y < 0 && !this.isInWater && !inLava) {
        if (this.position.y > this.highestFallY) {
          this.highestFallY = this.position.y;
        }
      }

      // Resolve AABB Collisions
      const proposedMove = this.velocity.clone().multiplyScalar(dt);

      // Ledge-sneaking fall protection: clamp proposed horizontal movement to prevent falling off ledges into 1+ block drops
      if (this.isSneaking && this.onGround && !this.isFlying && !this.isInWater && !inLava) {
        const step = 0.01;
        // Check X movement
        while (proposedMove.x !== 0 && !AABB.hasBlockBelow(this.aabb, proposedMove.x, 0, this.world)) {
          if (proposedMove.x < step && proposedMove.x >= -step) {
            proposedMove.x = 0;
            this.velocity.x = 0;
          } else if (proposedMove.x > 0) {
            proposedMove.x -= step;
          } else {
            proposedMove.x += step;
          }
        }
        // Check Z movement
        while (proposedMove.z !== 0 && !AABB.hasBlockBelow(this.aabb, 0, proposedMove.z, this.world)) {
          if (proposedMove.z < step && proposedMove.z >= -step) {
            proposedMove.z = 0;
            this.velocity.z = 0;
          } else if (proposedMove.z > 0) {
            proposedMove.z -= step;
          } else {
            proposedMove.z += step;
          }
        }
        // Check diagonal movement
        while (proposedMove.x !== 0 && proposedMove.z !== 0 && !AABB.hasBlockBelow(this.aabb, proposedMove.x, proposedMove.z, this.world)) {
          if (proposedMove.x < step && proposedMove.x >= -step) {
            proposedMove.x = 0;
            this.velocity.x = 0;
          } else if (proposedMove.x > 0) {
            proposedMove.x -= step;
          } else {
            proposedMove.x += step;
          }
          if (proposedMove.z < step && proposedMove.z >= -step) {
            proposedMove.z = 0;
            this.velocity.z = 0;
          } else if (proposedMove.z > 0) {
            proposedMove.z -= step;
          } else {
            proposedMove.z += step;
          }
        }
      }

      const col = AABB.moveAndCollide(
        this.aabb,
        proposedMove,
        this.world,
        this.isSneaking,
        this.onGround
      );

      // Apply resolved position
      this.position.set(
        (this.aabb.min.x + this.aabb.max.x) / 2,
        this.aabb.min.y,
        (this.aabb.min.z + this.aabb.max.z) / 2
      );

      if (col.hitCeiling && this.velocity.y > 0) {
        this.velocity.y = 0;
      }

      // Landing and Fall damage
      if (col.onGround) {
        if (!this.onGround && this.gameMode === 'survival') {
          const fallDist = this.highestFallY - this.position.y;
          if (fallDist > 3.5) {
            const damage = Math.floor(fallDist - 3);
            this.takeDamage(damage);
          }
        }
        this.highestFallY = this.position.y;
        this.velocity.y = 0;
      }

      this.onGround = col.onGround;

      // Emit white dust cloud particles at Steve's feet when sprinting on solid ground
      if (this.isSprinting && this.onGround && moveDir.lengthSq() > 0.01 && !this.isInWater && !this.isFlying) {
        this.sprintParticleTimer += dt;
        if (this.sprintParticleTimer >= 0.08) {
          this.sprintParticleTimer = 0;
          this.spawnSprintDustParticles(moveDir);
        }
      } else {
        this.sprintParticleTimer = 0.08;
      }

      // Footstep sound triggering
      if (this.onGround && moveDir.lengthSq() > 0) {
        const distMoved = Math.sqrt(proposedMove.x * proposedMove.x + proposedMove.z * proposedMove.z);
        this.stepDistance += distMoved;
        const stepInterval = this.isSprinting ? 1.8 : 2.4;
        if (this.stepDistance > stepInterval) {
          this.stepDistance = 0;
          const blockUnder = this.world.getBlock(
            Math.floor(this.position.x),
            Math.floor(this.position.y - 0.5),
            Math.floor(this.position.z)
          );
          const soundType: SoundGroup = BLOCK_DEFS[blockUnder]?.soundType || 'grass';
          this.sounds.playFootstep(soundType);
        }
      }
    }

    return moveDir;
  }

  private updateCamera(dt: number, moveDir: THREE.Vector3) {
    // Smoothly lerp camera FOV (+8 degrees) while sprinting
    this.targetFov = (this.isSprinting && (moveDir.lengthSq() > 0.01 || this.controls.isKeyDown('KeyW')))
      ? this.baseFov + 8
      : this.baseFov;

    if (this.camera && Math.abs(this.camera.fov - this.targetFov) > 0.01) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFov, Math.min(1.0, 10.0 * dt));
      this.camera.updateProjectionMatrix();
    }

    const eyeOffset = this.isSneaking ? Player.SNEAK_EYE_HEIGHT : Player.EYE_HEIGHT;
    let bobY = 0;
    let bobLateral = 0;

    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

    if (this.onGround && moveDir.lengthSq() > 0 && !this.isFlying) {
      const bobFreq = this.isSprinting ? 14 : 10;
      this.bobTimer += dt * bobFreq;
      bobY = Math.sin(this.bobTimer) * 0.04;
      bobLateral = Math.cos(this.bobTimer * 0.5) * 0.025;
    } else {
      this.bobTimer = 0;
    }

    const eyeBase = this.position.clone();
    eyeBase.y += eyeOffset;

    if (this.perspective === CameraPerspective.FIRST_PERSON) {
      this.handContainer.visible = true;
      this.playerModel.group.visible = false;

      const camPos = eyeBase.clone();
      camPos.y += bobY;
      camPos.addScaledVector(right, bobLateral);
      this.camera.position.copy(camPos);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else if (this.perspective === CameraPerspective.THIRD_PERSON_BACK) {
      this.handContainer.visible = false;
      this.playerModel.group.visible = true;

      // Authentic trailing camera along pitch and yaw
      const backDir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      const targetDist = 3.5;

      // Smooth camera occlusion raycast
      let desiredDist = targetDist;
      const hit = this.world.raycast(eyeBase, backDir, targetDist + 0.3);
      if (hit.hit) {
        desiredDist = Math.max(0.6, hit.distance - 0.25);
      }

      // Spring-arm distance damping: fast pull-in on collision, smooth push-out
      const lerpSpeed = desiredDist < this.currentBackCamDist ? 22.0 : 8.0;
      this.currentBackCamDist = THREE.MathUtils.lerp(this.currentBackCamDist, desiredDist, Math.min(1.0, lerpSpeed * dt));

      const camPos = eyeBase.clone().addScaledVector(backDir, this.currentBackCamDist);
      this.camera.position.copy(camPos);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else if (this.perspective === CameraPerspective.THIRD_PERSON_FRONT) {
      // THIRD_PERSON_FRONT: Selfie camera in front facing player
      this.handContainer.visible = false;
      this.playerModel.group.visible = true;

      const frontDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(-this.pitch, this.yaw, 0, 'YXZ'));
      const targetDist = 3.0;

      let desiredDist = targetDist;
      const hit = this.world.raycast(eyeBase, frontDir, targetDist + 0.3);
      if (hit.hit) {
        desiredDist = Math.max(0.6, hit.distance - 0.25);
      }

      const lerpSpeed = desiredDist < this.currentFrontCamDist ? 22.0 : 8.0;
      this.currentFrontCamDist = THREE.MathUtils.lerp(this.currentFrontCamDist, desiredDist, Math.min(1.0, lerpSpeed * dt));

      const camPos = eyeBase.clone().addScaledVector(frontDir, this.currentFrontCamDist);
      this.camera.position.copy(camPos);
      this.camera.lookAt(eyeBase.clone().add(new THREE.Vector3(0, -0.1, 0)));
    } else {
      // THIRD_PERSON_ISOMETRIC: True 360° 3D Orbital & Vertical Camera Control
      this.handContainer.visible = false;
      this.playerModel.group.visible = true;

      // Smooth zoom distance lerp toward targetIsoDistance
      this.isoDistance = THREE.MathUtils.lerp(this.isoDistance, this.targetIsoDistance, Math.min(1.0, 10.0 * dt));

      // Full 360° horizontal (yaw) and vertical (pitch) orbital spherical coordinates
      const cosP = Math.cos(this.isoOrbitPitch);
      const sinP = Math.sin(this.isoOrbitPitch);
      const sinY = Math.sin(this.isoOrbitYaw);
      const cosY = Math.cos(this.isoOrbitYaw);

      // Spherical direction vector pointing from player to camera position
      const orbitDir = new THREE.Vector3(
        sinY * cosP,
        sinP,
        cosY * cosP
      ).normalize();

      let targetDist = this.isoDistance;

      // Smooth collision detection raycast so camera avoids clipping into terrain / blocks
      const hit = this.world.raycast(eyeBase, orbitDir, targetDist + 0.3);
      if (hit.hit) {
        targetDist = Math.max(1.5, hit.distance - 0.3);
      }

      const camPos = eyeBase.clone().addScaledVector(orbitDir, targetDist);
      this.camera.position.copy(camPos);
      // Focus target at chest height for balanced isometric framing
      this.camera.lookAt(eyeBase.clone().add(new THREE.Vector3(0, -0.2, 0)));
    }

    // Update 3D player model when in third-person
    if (this.perspective !== CameraPerspective.FIRST_PERSON) {
      this.playerModel.group.position.copy(this.position);
      this.playerModel.group.rotation.y = this.modelFacingYaw;

      // Calculate relative head yaw (angle between player's look target and body orientation)
      let headYaw = 0;
      if (this.perspective === CameraPerspective.THIRD_PERSON_BACK) {
        headYaw = this.yaw - this.modelFacingYaw;
      } else if (this.perspective === CameraPerspective.THIRD_PERSON_FRONT) {
        headYaw = 0;
      } else {
        // In isometric mode, Steve looks in his forward movement direction or toward camera
        headYaw = 0;
      }

      // In isometric view, Steve can look up and down according to the camera orbital pitch
      const headPitch = this.perspective === CameraPerspective.THIRD_PERSON_ISOMETRIC 
        ? -this.isoOrbitPitch * 0.75 
        : this.pitch;

      this.playerModel.update(
        dt,
        headPitch,
        headYaw,
        moveDir.lengthSq() > 0,
        this.isSprinting,
        this.isSneaking,
        this.isSwinging,
        this.swingProgress,
        this.isChargingBow,
        this.bowCharge
      );
      this.playerModel.updateArmor(this.inventory);
      const held = this.inventory?.getSelectedItem();
      this.playerModel.updateHeldItem(held?.id || 0);
    }

    // Water splash sounds on entering / exiting water & underwater audio filter
    if (this.isInWater && !this.wasInWater) {
      this.sounds.playSplash();
      this.onWaterSplash?.(this.position, 12);
    } else if (!this.isInWater && this.wasInWater && this.velocity.y > 1.0) {
      this.sounds.playSplash();
      this.onWaterSplash?.(this.position, 8);
    }
    this.wasInWater = this.isInWater;

    if (this.isHeadUnderwater && !this.wasHeadUnderwater) {
      this.sounds.setUnderwater(true);
    } else if (!this.isHeadUnderwater && this.wasHeadUnderwater) {
      this.sounds.setUnderwater(false);
    }
    this.wasHeadUnderwater = this.isHeadUnderwater;

    // Swimming strokes sound and wake bubbles
    if (this.isInWater && moveDir.lengthSq() > 0) {
      this.swimSoundTimer += dt;
      if (this.swimSoundTimer >= 0.65) {
        this.swimSoundTimer = 0;
        this.sounds.playSwim();
        this.onWaterSplash?.(this.position, 3);
      }
    } else {
      this.swimSoundTimer = 0;
    }
  }

  // Add experience points and trigger level up fanfare if threshold reached
  public addXp(amount: number): boolean {
    this.xp += amount;
    const xpNeeded = 7 + (this.level * 7);
    if (this.xp >= xpNeeded) {
      this.xp -= xpNeeded;
      this.level++;
      this.sounds.playLevelUp();
      return true;
    }
    return false;
  }

  // Damage handling & visual hurt flash with armor damage reduction
  public takeDamage(amount: number) {
    if (this.gameMode === 'creative') return;

    const defense = this.inventory?.getArmorDefense() || 0;
    // Vanilla Minecraft armor absorption: 4% per defense point
    const reduction = Math.min(20, defense) * 0.04;
    const finalDamage = Math.max(0.5, amount * (1 - reduction));

    this.health = Math.max(0, this.health - finalDamage);
    this.inventory?.damageArmor(1);
    this.sounds.playHurt();

    const hurtOverlay = document.getElementById('hurt-overlay');
    if (hurtOverlay) {
      hurtOverlay.classList.add('flash');
      setTimeout(() => hurtOverlay.classList.remove('flash'), 180);
    }

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.deathRoll = Math.PI / 3;
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, this.deathRoll, 'YXZ');
      this.onDeath?.();
      return;
    }
  }

  public addExhaustion(amount: number) {
    if (this.gameMode === 'creative') return;
    this.exhaustion += amount;
    while (this.exhaustion >= 4.0) {
      this.exhaustion -= 4.0;
      if (this.saturation > 0) {
        this.saturation = Math.max(0, this.saturation - 1);
      } else {
        this.hunger = Math.max(0, this.hunger - 1);
      }
    }
  }

  // Respawn safely
  public respawn() {
    this.isDead = false;
    this.deathRoll = 0;
    this.health = this.maxHealth;
    this.hunger = 20;
    this.air = this.maxAir;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const safeLoc = this.world.getSafeSpawnLocation(0, 0);
    this.setPosition(safeLoc.x + 0.5, safeLoc.y + 1, safeLoc.z + 0.5);
  }

  // Trigger mining/attacking swing animation
  public triggerSwing() {
    if (!this.isSwinging) {
      this.isSwinging = true;
      this.swingProgress = 0;
    }
  }

  // Helper to create a miniature 3D voxel block with authentic texture coordinates on each face
  private createVoxelBlockGeometry(blockId: Block): THREE.BufferGeometry {
    const def = BLOCK_DEFS[blockId];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let vOffset = 0;

    const size = 0.18;
    const half = 0.5;

    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      const texIndex = def ? def.textures[f] : 0;
      const [u0, v0, u1, v1] = TextureAtlas.getUV(texIndex);

      for (let c = 0; c < 4; c++) {
        const corner = face.corners[c];
        positions.push(
          (corner[0] - half) * size,
          (corner[1] - half) * size,
          (corner[2] - half) * size
        );
        normals.push(face.norm[0], face.norm[1], face.norm[2]);
        colors.push(face.light, face.light, face.light);
      }

      uvs.push(
        u0, v0,
        u1, v0,
        u1, v1,
        u0, v1
      );

      indices.push(
        vOffset + 0, vOffset + 1, vOffset + 2,
        vOffset + 0, vOffset + 2, vOffset + 3
      );
      vOffset += 4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    return geo;
  }

  // Helper to create detailed 3D tools (Swords, Pickaxes, Axes, Shovels)
  private createHeldToolObject(itemId: number): THREE.Object3D {
    const group = new THREE.Group();

    // Material colors
    let matColor = 0x866043;
    let isDiamond = false;
    let isIron = false;

    if (itemId === ItemId.DIAMOND_SWORD || itemId === ItemId.DIAMOND_PICKAXE || itemId === ItemId.DIAMOND_AXE || itemId === ItemId.DIAMOND_SHOVEL) {
      matColor = 0x38f5f8;
      isDiamond = true;
    } else if (itemId === ItemId.IRON_SWORD || itemId === ItemId.IRON_PICKAXE || itemId === ItemId.IRON_AXE || itemId === ItemId.IRON_SHOVEL) {
      matColor = 0xe8e8e8;
      isIron = true;
    } else if (itemId === ItemId.STONE_SWORD || itemId === ItemId.STONE_PICKAXE || itemId === ItemId.STONE_AXE || itemId === ItemId.STONE_SHOVEL) {
      matColor = 0x7a7a7a;
    }

    // 1. Stick Handle
    const handleGeo = new THREE.BoxGeometry(0.024, 0.32, 0.024);
    const handleMat = new THREE.MeshLambertMaterial({ color: 0x5c4028 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = -0.04;
    group.add(handle);

    const headMat = new THREE.MeshStandardMaterial({
      color: matColor,
      emissive: isDiamond ? 0x0a3c3c : 0x000000,
      emissiveIntensity: isDiamond ? 0.6 : 0,
      roughness: isIron ? 0.25 : 0.6,
      metalness: isIron ? 0.75 : 0.1
    });

    // 2. Head based on tool category
    if (itemId === ItemId.WOODEN_SWORD || itemId === ItemId.STONE_SWORD || itemId === ItemId.IRON_SWORD || itemId === ItemId.DIAMOND_SWORD) {
      // Sword crossguard
      const guardGeo = new THREE.BoxGeometry(0.13, 0.024, 0.035);
      const guardMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
      const guard = new THREE.Mesh(guardGeo, guardMat);
      guard.position.y = 0.03;
      group.add(guard);

      // Sword blade
      const bladeGeo = new THREE.BoxGeometry(0.045, 0.34, 0.016);
      const blade = new THREE.Mesh(bladeGeo, headMat);
      blade.position.y = 0.21;
      group.add(blade);
    } else if (itemId === ItemId.WOODEN_PICKAXE || itemId === ItemId.STONE_PICKAXE || itemId === ItemId.IRON_PICKAXE || itemId === ItemId.DIAMOND_PICKAXE) {
      // Pickaxe arched cross head
      const pickHeadGeo = new THREE.BoxGeometry(0.20, 0.038, 0.032);
      const pickHead = new THREE.Mesh(pickHeadGeo, headMat);
      pickHead.position.y = 0.13;
      group.add(pickHead);
    } else if (itemId === ItemId.WOODEN_AXE || itemId === ItemId.STONE_AXE || itemId === ItemId.IRON_AXE || itemId === ItemId.DIAMOND_AXE) {
      // Axe wedge blade
      const axeHeadGeo = new THREE.BoxGeometry(0.09, 0.12, 0.032);
      const axeHead = new THREE.Mesh(axeHeadGeo, headMat);
      axeHead.position.set(0.045, 0.10, 0);
      group.add(axeHead);
    } else if (itemId === ItemId.WOODEN_SHOVEL || itemId === ItemId.STONE_SHOVEL || itemId === ItemId.IRON_SHOVEL || itemId === ItemId.DIAMOND_SHOVEL) {
      // Shovel blade
      const shovelHeadGeo = new THREE.BoxGeometry(0.075, 0.10, 0.02);
      const shovelHead = new THREE.Mesh(shovelHeadGeo, headMat);
      shovelHead.position.y = 0.14;
      group.add(shovelHead);
    }

    group.position.set(0.04, 0.02, 0.04);
    group.rotation.set(Math.PI / 4, 0, -Math.PI / 8);
    return group;
  }

  // Set the currently held item (changes the 3D model in hand)
  public setHeldItem(itemId: number) {
    if (this.currentHeldItemId === itemId && this.heldItemMesh) return;
    this.currentHeldItemId = itemId;

    // Remove old mesh
    if (this.heldItemMesh) {
      this.handContainer.remove(this.heldItemMesh);
      if (this.heldItemMesh instanceof THREE.Mesh) {
        this.heldItemMesh.geometry.dispose();
      }
      this.heldItemMesh = null;
    }

    // Toggle dynamic hand-held lighting (Torch, Glowstone, Sea Lantern, Lava Bucket)
    if (this.handTorchLight) {
      if (itemId === Block.TORCH) {
        this.handTorchLight.color.setHex(0xffaa44);
        this.handTorchLight.intensity = 1.8;
        this.handTorchLight.distance = 18;
        this.handTorchLight.visible = true;
      } else if (itemId === Block.GLOWSTONE) {
        this.handTorchLight.color.setHex(0xffea55);
        this.handTorchLight.intensity = 2.0;
        this.handTorchLight.distance = 20;
        this.handTorchLight.visible = true;
      } else if (itemId === Block.SEA_LANTERN) {
        this.handTorchLight.color.setHex(0x88eeff);
        this.handTorchLight.intensity = 2.0;
        this.handTorchLight.distance = 20;
        this.handTorchLight.visible = true;
      } else if (itemId === Block.LAVA) {
        this.handTorchLight.color.setHex(0xff5511);
        this.handTorchLight.intensity = 2.2;
        this.handTorchLight.distance = 18;
        this.handTorchLight.visible = true;
      } else {
        this.handTorchLight.visible = false;
      }
    }

    if (itemId === Block.AIR || itemId === 0) {
      // Empty Steve arm
      const armGroup = new THREE.Group();
      const armGeo = new THREE.BoxGeometry(0.12, 0.35, 0.12);
      const armMat = new THREE.MeshLambertMaterial({ color: 0xc68642 });
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(0, -0.05, 0);
      armGroup.add(arm);

      // Sleeve cuff
      const sleeveGeo = new THREE.BoxGeometry(0.125, 0.12, 0.125);
      const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x007f99 });
      const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      sleeve.position.set(0, -0.16, 0);
      armGroup.add(sleeve);

      armGroup.rotation.set(Math.PI / 6, -Math.PI / 8, -Math.PI / 10);
      this.heldItemMesh = armGroup;
      this.handContainer.add(this.heldItemMesh);
      return;
    }

    // Torch 3D model
    if (itemId === Block.TORCH) {
      const torchGroup = new THREE.Group();
      const stickGeo = new THREE.BoxGeometry(0.034, 0.26, 0.034);
      const stickMat = new THREE.MeshLambertMaterial({ color: 0x6e4e2a });
      const stick = new THREE.Mesh(stickGeo, stickMat);
      stick.position.y = -0.02;
      torchGroup.add(stick);

      const headGeo = new THREE.BoxGeometry(0.042, 0.065, 0.042);
      const headMat = new THREE.MeshStandardMaterial({
        color: 0xffcc33,
        emissive: 0xff8800,
        emissiveIntensity: 1.8,
        roughness: 0.1
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.12;
      torchGroup.add(head);

      torchGroup.rotation.set(Math.PI / 5, -Math.PI / 10, -Math.PI / 12);
      this.heldItemMesh = torchGroup;
      this.handContainer.add(this.heldItemMesh);
      return;
    }

    // Tools & weapons
    const isTool = (itemId >= ItemId.WOODEN_PICKAXE && itemId <= ItemId.DIAMOND_SHOVEL) || itemId === ItemId.STICK;
    if (isTool) {
      this.heldItemMesh = this.createHeldToolObject(itemId);
      this.handContainer.add(this.heldItemMesh);
      return;
    }

    // Food & Gem items
    if (itemId === ItemId.APPLE) {
      const appleGroup = new THREE.Group();
      const fruit = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), new THREE.MeshLambertMaterial({ color: 0xdc143c }));
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), new THREE.MeshLambertMaterial({ color: 0x448822 }));
      stem.position.y = 0.08;
      appleGroup.add(fruit);
      appleGroup.add(stem);
      appleGroup.rotation.set(Math.PI / 6, Math.PI / 4, 0);
      this.heldItemMesh = appleGroup;
      this.handContainer.add(this.heldItemMesh);
      return;
    }

    if (itemId === ItemId.BREAD) {
      const bread = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.11), new THREE.MeshLambertMaterial({ color: 0xc4823f }));
      bread.rotation.set(Math.PI / 6, Math.PI / 4, 0);
      this.heldItemMesh = bread;
      this.handContainer.add(this.heldItemMesh);
      return;
    }

    if (itemId === ItemId.DIAMOND || itemId === ItemId.EMERALD) {
      const gemCol = itemId === ItemId.DIAMOND ? 0x44f0f0 : 0x22ee66;
      const gem = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.14, 0.12),
        new THREE.MeshStandardMaterial({
          color: gemCol,
          emissive: gemCol,
          emissiveIntensity: 0.35,
          roughness: 0.15,
          metalness: 0.4
        })
      );
      gem.rotation.set(Math.PI / 6, Math.PI / 4, 0);
      this.heldItemMesh = gem;
      this.handContainer.add(this.heldItemMesh);
      return;
    }

    if (itemId === ItemId.IRON_INGOT || itemId === ItemId.GOLD_INGOT) {
      const ingotCol = itemId === ItemId.IRON_INGOT ? 0xdcdcdc : 0xffdd44;
      const ingot = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.06, 0.08),
        new THREE.MeshStandardMaterial({
          color: ingotCol,
          roughness: 0.25,
          metalness: 0.8
        })
      );
      ingot.rotation.set(Math.PI / 6, Math.PI / 4, 0);
      this.heldItemMesh = ingot;
      this.handContainer.add(this.heldItemMesh);
      return;
    }

    // 3D Bow Weapon
    if (itemId === ItemId.BOW) {
      const bowGroup = new THREE.Group();
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4f30, roughness: 0.7 });
      const stringMat = new THREE.MeshBasicMaterial({ color: 0xf1f2f6 });

      const limb1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), woodMat);
      limb1.position.set(0, 0.12, -0.06);
      limb1.rotation.x = -0.3;
      bowGroup.add(limb1);

      const limb2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), woodMat);
      limb2.position.set(0, -0.12, -0.06);
      limb2.rotation.x = 0.3;
      bowGroup.add(limb2);

      const tip1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), woodMat);
      tip1.position.set(0, 0.24, -0.14);
      tip1.rotation.x = -0.7;
      bowGroup.add(tip1);

      const tip2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), woodMat);
      tip2.position.set(0, -0.24, -0.14);
      tip2.rotation.x = 0.7;
      bowGroup.add(tip2);

      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.58), stringMat);
      str.position.set(0, 0, -0.18);
      bowGroup.add(str);

      bowGroup.rotation.set(0.2, -0.4, 0.2);
      this.heldItemMesh = bowGroup;
      this.handContainer.add(this.heldItemMesh);
      return;
    }

    // Standard 3D Voxel Block (Grass, Stone, Wood, Planks, TNT, etc.)
    const blockDef = BLOCK_DEFS[itemId];
    if (blockDef) {
      const blockGeo = this.createVoxelBlockGeometry(itemId);
      this.heldItemMesh = new THREE.Mesh(blockGeo, this.world.terrainMaterial);
      this.heldItemMesh.position.set(0, 0, 0);
      this.heldItemMesh.rotation.set(0.35, 0.75, -0.15);
      this.handContainer.add(this.heldItemMesh);
    } else {
      // Fallback voxel cube
      const itemGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const itemMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
      this.heldItemMesh = new THREE.Mesh(itemGeo, itemMat);
      this.heldItemMesh.rotation.set(Math.PI / 6, Math.PI / 4, 0);
      this.handContainer.add(this.heldItemMesh);
    }
  }

  private updateHeldItem(dt: number) {
    if (this.isSwinging) {
      this.swingProgress += dt * 7.5;
      if (this.swingProgress >= 1.0) {
        this.swingProgress = 0;
        this.isSwinging = false;
      }
    }

    // Calculate dynamic swing arc (punch / tool slice)
    const swingAngle = Math.sin(this.swingProgress * Math.PI);
    this.handContainer.rotation.x = -swingAngle * 0.85;
    this.handContainer.rotation.y = swingAngle * 0.55;
    this.handContainer.rotation.z = -swingAngle * 0.35;

    if (this.isChargingBow) {
      this.bowCharge = Math.min(1.0, this.bowCharge + dt * 1.5);
      const chargePull = this.bowCharge * 0.15;
      this.handContainer.position.set(0.22 - chargePull * 0.08, -0.26 + chargePull * 0.04, -0.45 + chargePull);
      this.handContainer.rotation.set(-0.15, -0.45, 0.25);
    } else {
      this.bowCharge = 0;
      // View bobbing offset on hand container
      const bobX = Math.cos(this.bobTimer * 0.5) * 0.022;
      const bobY = Math.abs(Math.sin(this.bobTimer)) * 0.025;
      this.handContainer.position.set(0.35 + bobX, -0.35 + bobY, -0.55);
    }
  }

  /**
   * Spawns authentic white dust cloud particles at Steve's feet while sprinting
   */
  private spawnSprintDustParticles(moveDir: THREE.Vector3) {
    if (!this.world?.scene || typeof document === 'undefined') return;

    const count = 2;
    for (let i = 0; i < count; i++) {
      const pGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
      const pMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.75,
        depthWrite: false
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);

      // Foot position offset
      const px = this.position.x + (Math.random() - 0.5) * 0.35;
      const py = this.position.y + 0.04 + Math.random() * 0.05;
      const pz = this.position.z + (Math.random() - 0.5) * 0.35;
      pMesh.position.set(px, py, pz);

      this.sprintParticleGroup.add(pMesh);

      // Ejected backward and upward
      const vx = -moveDir.x * 0.7 + (Math.random() - 0.5) * 0.4;
      const vy = 0.35 + Math.random() * 0.45;
      const vz = -moveDir.z * 0.7 + (Math.random() - 0.5) * 0.4;

      this.sprintParticles.push({
        mesh: pMesh,
        velocity: new THREE.Vector3(vx, vy, vz),
        age: 0,
        maxAge: 0.35 + Math.random() * 0.15,
        initialScale: 0.8 + Math.random() * 0.4
      });
    }
  }

  /**
   * Updates and decays active sprint dust cloud particles
   */
  public updateSprintParticles(dt: number) {
    if (this.sprintParticles.length === 0) return;

    for (let i = this.sprintParticles.length - 1; i >= 0; i--) {
      const p = this.sprintParticles[i];
      p.age += dt;

      if (p.age >= p.maxAge) {
        this.sprintParticleGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach(m => m.dispose());
        } else {
          p.mesh.material.dispose();
        }
        this.sprintParticles.splice(i, 1);
        continue;
      }

      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= 1.4 * dt;
      p.velocity.x *= 0.95;
      p.velocity.z *= 0.95;

      const progress = p.age / p.maxAge;
      const lifeRatio = 1 - progress;
      const scale = p.initialScale * (0.3 + 0.7 * lifeRatio);
      p.mesh.scale.set(scale, scale, scale);

      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = 0.75 * lifeRatio;
      }
    }
  }
}
