import * as THREE from 'three';
import { World } from '../world/World';
import { SoundManager } from '../audio/SoundManager';
import { Mob, MobType } from './Mob';
import { Block, BLOCK_DEFS } from '../world/BlockTypes';
import { ItemEntity } from '../gameplay/ItemEntity';
import { DayNightCycle } from '../gameplay/DayNightCycle';
import { GhastFireball } from './GhastFireball';

export class MobManager {
  public mobs: Mob[] = [];
  public fireballs: GhastFireball[] = [];
  private nextMobId: number = 1;
  private scene: THREE.Scene;
  private world: World;
  private sounds: SoundManager;

  // Max active mobs in simulation radius (sparse and natural)
  private readonly MAX_MOBS = 16;
  private spawnTimer: number = 8.0;
  private aquaticSpawnTimer: number = 1.0;

  // Particle group for mob death poof & creeper explosions
  private particleGroup: THREE.Group;

  // Callbacks
  public onVillagerInteract?: (villager: Mob) => void;
  public onSpawnDropItem?: (id: number, count: number, pos: THREE.Vector3) => void;
  public onPlayerDamage?: (damage: number) => void;

  constructor(scene: THREE.Scene, world: World, sounds: SoundManager) {
    this.scene = scene;
    this.world = world;
    this.sounds = sounds;

    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);
  }

  public spawnMob(type: MobType, x: number, y: number, z: number): Mob {
    const mob = new Mob(this.nextMobId++, type, new THREE.Vector3(x, y, z), this.scene, this.sounds);
    mob.onSpawnFireball = (pos, dir) => this.spawnFireball(pos, dir);
    mob.onPigmanAggro = (pos) => this.alertNearbyPigmen(pos);
    mob.onSpawnHearts = (pos) => this.createHeartParticles(pos);
    this.mobs.push(mob);
    return mob;
  }

  public spawnFireball(pos: THREE.Vector3, dir: THREE.Vector3) {
    const fireball = new GhastFireball(this.scene, this.world, this.sounds, pos, dir);
    this.fireballs.push(fireball);
  }

  public alertNearbyPigmen(pigmanPos: THREE.Vector3) {
    for (const mob of this.mobs) {
      if (mob.type === MobType.ZOMBIE_PIGMAN && !mob.isAngry) {
        if (mob.position.distanceTo(pigmanPos) < 28) {
          mob.isAngry = true;
          mob.isHostile = true;
          (mob as any).moveSpeed = 4.2;
        }
      }
    }
  }

  // Player melee swing can deflect incoming Ghast fireball back in crosshair direction!
  public deflectFireball(playerPos: THREE.Vector3, lookDir: THREE.Vector3): boolean {
    for (const fb of this.fireballs) {
      if (fb.isAlive && fb.position.distanceTo(playerPos) < 3.2) {
        fb.deflect(lookDir);
        return true;
      }
    }
    return false;
  }

  // Spawn natural herds, spawn village villagers, and swimming fish
  public spawnNaturalHerds(playerPos: THREE.Vector3) {
    // 1. Natural animal herd (2-3 cows/sheep/pigs)
    const animalTypes = [MobType.COW, MobType.SHEEP, MobType.PIG];
    const herdType = animalTypes[Math.floor(Math.random() * animalTypes.length)];
    const herdAngle = Math.random() * Math.PI * 2;
    const herdDist = 28 + Math.random() * 8;
    const centerX = Math.floor(playerPos.x + Math.sin(herdAngle) * herdDist);
    const centerZ = Math.floor(playerPos.z + Math.cos(herdAngle) * herdDist);

    const herdCount = 2 + Math.floor(Math.random() * 2); // 2 or 3 animals
    for (let i = 0; i < herdCount; i++) {
      const offsetX = centerX + Math.floor((Math.random() - 0.5) * 5);
      const offsetZ = centerZ + Math.floor((Math.random() - 0.5) * 5);
      const y = this.world.getSafeSpawnHeight(offsetX, offsetZ);
      const blockBelow = this.world.getBlock(offsetX, y - 1, offsetZ);
      if (blockBelow === Block.GRASS) {
        this.spawnMob(herdType, offsetX + 0.5, y + 0.1, offsetZ + 0.5);
      }
    }

    // 2. Spawn Villagers and an Iron Golem guardian in the guaranteed spawn village at chunk (1, 0)
    const v1Y = this.world.getSafeSpawnHeight(23, 7);
    if (v1Y > 10) {
      this.spawnMob(MobType.VILLAGER, 23.5, v1Y + 0.1, 7.5);
      const v2Y = this.world.getSafeSpawnHeight(25, 8);
      this.spawnMob(MobType.VILLAGER, 25.5, v2Y + 0.1, 8.5);
      const gY = this.world.getSafeSpawnHeight(24, 9);
      this.spawnMob(MobType.IRON_GOLEM, 24.5, gY + 0.1, 9.5);
    }

    // 3. Search nearby water to spawn swimming fish schools
    for (let search = 0; search < 32; search++) {
      const fx = Math.floor(playerPos.x + (Math.random() - 0.5) * 48);
      const fz = Math.floor(playerPos.z + (Math.random() - 0.5) * 48);
      for (let fy = 12; fy <= 30; fy++) {
        if (this.world.getBlock(fx, fy, fz) === Block.WATER) {
          const fishType = Math.random() < 0.5 ? MobType.COD : MobType.SALMON;
          this.spawnMob(fishType, fx + 0.5, fy + 0.5, fz + 0.5);
          this.spawnMob(fishType, fx + 1.2, fy + 0.5, fz + 0.8);
          this.spawnMob(fishType, fx - 0.8, fy + 0.5, fz + 1.1);
          search += 8;
          break;
        }
      }
    }
  }

  public update(dt: number, playerPos: THREE.Vector3, dayNight: DayNightCycle, playerHeldItemId: number = 0) {
    // 1. Spawner routine (runs peacefully every 14 seconds)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 14.0;
      this.trySpawnNaturalMobs(playerPos, dayNight);
    }

    // Aquatic fish spawner (maintains swimming schools of fish in rivers, oceans, and lakes)
    this.aquaticSpawnTimer -= dt;
    if (this.aquaticSpawnTimer <= 0) {
      this.aquaticSpawnTimer = 3.2;
      this.trySpawnAquaticFish(playerPos);
    }

    // 2. Update active mobs
    const isDay = dayNight.isDay;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];

      // Daylight burning for zombies
      if (mob.type === MobType.ZOMBIE && isDay && mob.isAlive) {
        const exposedToSky = this.isExposedToSky(mob.position.x, mob.position.y, mob.position.z);
        if (exposedToSky) {
          mob.takeDamage(1, new THREE.Vector3(0, 0, 0));
        }
      }

      mob.update(
        dt,
        this.world,
        playerPos,
        (amt) => this.onPlayerDamage?.(amt),
        (pos, radius) => this.createExplosionEffect(pos, radius),
        this.mobs,
        playerHeldItemId
      );

      // If mob died, spawn death poof particles and item drops
      if (!mob.isAlive) {
        this.createDeathPoof(mob.position);
        const drops = mob.getDeathDrops();
        for (const drop of drops) {
          this.onSpawnDropItem?.(drop.id, drop.count, mob.position.clone());
        }
        mob.dispose();
        this.mobs.splice(i, 1);
        continue;
      }

      // Despawn non-village mobs that are far from player (> 54 blocks)
      if (mob.type !== MobType.VILLAGER && mob.type !== MobType.IRON_GOLEM) {
        const distSq = mob.position.distanceToSquared(playerPos);
        if (distSq > 54 * 54) {
          mob.dispose();
          this.mobs.splice(i, 1);
        }
      }
    }

    // 3. Update active Ghast / Blaze fireballs
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i];
      fb.update(
        dt,
        playerPos,
        (dmg: number) => this.onPlayerDamage?.(dmg),
        (pos: THREE.Vector3, rad: number) => this.createExplosionEffect(pos, rad)
      );
      if (!fb.isAlive) {
        fb.dispose();
        this.fireballs.splice(i, 1);
      }
    }

    // 4. Update particle effects (death poof, explosions, fire)
    this.updateParticles(dt);
  }

  // Raycast against mob bounding volumes for attacks / right-click interaction
  public raycastMob(rayOrigin: THREE.Vector3, rayDir: THREE.Vector3, maxDist: number = 3.8): Mob | null {
    let closestMob: Mob | null = null;
    let closestDist = maxDist;

    const ray = new THREE.Ray(rayOrigin, rayDir);
    const mobBox = new THREE.Box3();

    for (const mob of this.mobs) {
      if (!mob.isAlive) continue;

      const halfW = mob.width / 2;
      const halfD = mob.depth / 2;
      mobBox.min.set(mob.position.x - halfW, mob.position.y, mob.position.z - halfD);
      mobBox.max.set(mob.position.x + halfW, mob.position.y + mob.height, mob.position.z + halfD);

      const intersection = ray.intersectBox(mobBox, new THREE.Vector3());
      if (intersection) {
        const dist = rayOrigin.distanceTo(intersection);
        if (dist < closestDist) {
          closestDist = dist;
          closestMob = mob;
        }
      }
    }

    return closestMob;
  }

  private trySpawnNaturalMobs(playerPos: THREE.Vector3, dayNight: DayNightCycle) {
    if (this.mobs.length >= this.MAX_MOBS) return;

    if (this.world.currentDimension === 'nether') {
      // Nether mob spawning algorithm
      const angle = Math.random() * Math.PI * 2;
      const dist = 24 + Math.random() * 18;
      const x = Math.floor(playerPos.x + Math.sin(angle) * dist);
      const z = Math.floor(playerPos.z + Math.cos(angle) * dist);

      const roll = Math.random();
      if (roll < 0.28) {
        // Ghast spawn high up in open cavern (y = 26..46)
        const ghastY = 26 + Math.floor(Math.random() * 18);
        if (this.world.getBlock(x, ghastY, z) === Block.AIR) {
          this.spawnMob(MobType.GHAST, x + 0.5, ghastY, z + 0.5);
        }
      } else if (roll < 0.55) {
        // Blaze spawn
        const safeY = this.world.getSafeSpawnHeight(x, z);
        if (safeY > 5 && safeY < 60) {
          this.spawnMob(MobType.BLAZE, x + 0.5, safeY + 0.5, z + 0.5);
        }
      } else {
        // Zombie Pigman pack (1 to 3 pigmen)
        const safeY = this.world.getSafeSpawnHeight(x, z);
        if (safeY > 5 && safeY < 60) {
          const packSize = 1 + Math.floor(Math.random() * 3);
          for (let p = 0; p < packSize; p++) {
            const px = x + Math.floor((Math.random() - 0.5) * 4);
            const pz = z + Math.floor((Math.random() - 0.5) * 4);
            const py = this.world.getSafeSpawnHeight(px, pz);
            this.spawnMob(MobType.ZOMBIE_PIGMAN, px + 0.5, py + 0.1, pz + 0.5);
          }
        }
      }
      return;
    }

    // 1. Underground Dark Cave monster spawning (Zombies & Creepers below Y=40, unexposed to sky)
    const caveAngle = Math.random() * Math.PI * 2;
    const caveDist = 16 + Math.random() * 24;
    const caveX = Math.floor(playerPos.x + Math.sin(caveAngle) * caveDist);
    const caveZ = Math.floor(playerPos.z + Math.cos(caveAngle) * caveDist);
    for (let cy = 6; cy <= 38; cy++) {
      const block = this.world.getBlock(caveX, cy, caveZ);
      const floorBlock = this.world.getBlock(caveX, cy - 1, caveZ);
      if (block === Block.AIR && BLOCK_DEFS[floorBlock]?.solid && floorBlock !== Block.LAVA && floorBlock !== Block.WATER) {
        if (!this.isExposedToSky(caveX, cy, caveZ)) {
          // Found dark cavern chamber!
          if (Math.random() < 0.45) {
            const mob = Math.random() < 0.6 ? MobType.ZOMBIE : MobType.CREEPER;
            this.spawnMob(mob, caveX + 0.5, cy + 0.1, caveZ + 0.5);
            return;
          }
        }
      }
    }

    // 2. Aquatic swimming fish spawning in oceans and rivers
    if (Math.random() < 0.35) {
      if (this.trySpawnAquaticFish(playerPos)) {
        return;
      }
    }

    // 3. Surface spawning (Plains, Forests, Mountains, Deserts, Villages)
    const angle = Math.random() * Math.PI * 2;
    const dist = 28 + Math.random() * 16;
    const x = Math.floor(playerPos.x + Math.sin(angle) * dist);
    const z = Math.floor(playerPos.z + Math.cos(angle) * dist);
    const y = this.world.getSafeSpawnHeight(x, z);

    const surfaceBlock = this.world.getBlock(x, y - 1, z);
    if (!BLOCK_DEFS[surfaceBlock]?.solid) return;

    // Replenish villagers if near spawn village (chunk 1, 0)
    const distToVillage = Math.hypot(x - 23, z - 7);
    if (distToVillage < 18) {
      const villagerCount = this.mobs.filter(m => m.type === MobType.VILLAGER).length;
      if (villagerCount < 3 && Math.random() < 0.4) {
        this.spawnMob(MobType.VILLAGER, x + 0.5, y + 0.1, z + 0.5);
        return;
      }
    }

    if (dayNight.isNight) {
      // Night-time: hostile mob on surface (35% chance)
      if (Math.random() < 0.35) {
        const hostileType = Math.random() < 0.5 ? MobType.ZOMBIE : MobType.CREEPER;
        this.spawnMob(hostileType, x + 0.5, y + 0.1, z + 0.5);
      }
    } else {
      // Day-time: passive grazing animal on grass (25% chance)
      if (surfaceBlock === Block.GRASS && Math.random() < 0.25) {
        const passives = [MobType.COW, MobType.PIG, MobType.SHEEP, MobType.CHICKEN];
        const chosen = passives[Math.floor(Math.random() * passives.length)];
        this.spawnMob(chosen, x + 0.5, y + 0.1, z + 0.5);
      }
    }
  }

  private isExposedToSky(x: number, y: number, z: number): boolean {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    for (let checkY = Math.floor(y) + 2; checkY < 120; checkY++) {
      const block = this.world.getBlock(ix, checkY, iz);
      if (block !== Block.AIR && BLOCK_DEFS[block]?.solid) {
        return false;
      }
    }
    return true;
  }

  public trySpawnAquaticFish(playerPos: THREE.Vector3): boolean {
    const currentFish = this.mobs.filter(m => m.isFish && m.isAlive).length;
    if (currentFish >= 12) return false;

    // Scan for nearby water body within 28 blocks of player
    for (let attempts = 0; attempts < 14; attempts++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 22;
      const wx = Math.floor(playerPos.x + Math.sin(angle) * dist);
      const wz = Math.floor(playerPos.z + Math.cos(angle) * dist);

      for (let wy = 12; wy <= 32; wy++) {
        if (this.world.getBlock(wx, wy, wz) === Block.WATER) {
          const schoolType = Math.random() < 0.5 ? MobType.COD : MobType.SALMON;
          this.spawnMob(schoolType, wx + 0.5, wy + 0.4, wz + 0.5);
          if (Math.random() < 0.75) {
            this.spawnMob(schoolType, wx + 0.9, wy + 0.4, wz + 0.8);
          }
          if (Math.random() < 0.5) {
            this.spawnMob(schoolType, wx - 0.6, wy + 0.5, wz + 0.3);
          }
          return true;
        }
      }
    }
    return false;
  }

  // --- BREEDING SYSTEM ---

  public checkBreeding(fedMob: Mob): boolean {
    if (fedMob.isBaby || fedMob.inLove <= 0) return false;

    // Search for another mob of same type in love within 6 blocks
    for (const other of this.mobs) {
      if (other !== fedMob && other.type === fedMob.type && other.isAlive && !other.isBaby && other.inLove > 0) {
        const dist = fedMob.position.distanceTo(other.position);
        if (dist < 6.0) {
          // Success! Consume love mode
          fedMob.inLove = 0;
          other.inLove = 0;

          // Spawn baby mob at midpoint
          const midX = (fedMob.position.x + other.position.x) / 2;
          const midY = (fedMob.position.y + other.position.y) / 2;
          const midZ = (fedMob.position.z + other.position.z) / 2;
          const baby = this.spawnMob(fedMob.type, midX, midY, midZ);
          baby.isBaby = true;
          baby.growUpTimer = 60.0;
          baby.group.scale.set(0.5, 0.5, 0.5);
          baby.health = Math.round(baby.maxHealth / 2);

          // Heart burst!
          this.createHeartParticles(baby.position);
          this.createHeartParticles(fedMob.position);
          this.createHeartParticles(other.position);

          return true;
        }
      }
    }
    return false;
  }

  public createHeartParticles(pos: THREE.Vector3) {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const pMat = new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(pGeo, pMat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.6,
        pos.y + 0.6 + Math.random() * 0.4,
        pos.z + (Math.random() - 0.5) * 0.6
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        0.8 + Math.random() * 0.6,
        (Math.random() - 0.5) * 0.5
      );
      this.particleGroup.add(mesh);
      mesh.userData = { vel, age: 0, maxAge: 0.8 };
    }
  }

  // --- PARTICLE EFFECTS (DEATH POOF, EXPLOSION, FIRE) ---

  private createDeathPoof(pos: THREE.Vector3) {
    const count = 16;
    for (let i = 0; i < count; i++) {
      const pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(pGeo, pMat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.6,
        pos.y + 0.5 + (Math.random() - 0.5) * 0.6,
        pos.z + (Math.random() - 0.5) * 0.6
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        1.0 + Math.random() * 1.5,
        (Math.random() - 0.5) * 2.5
      );
      this.particleGroup.add(mesh);
      mesh.userData = { vel, age: 0, maxAge: 0.6 };
    }
  }

  private createExplosionEffect(pos: THREE.Vector3, _radius: number) {
    const count = 36;
    for (let i = 0; i < count; i++) {
      const pGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const colors = [0x555555, 0x888888, 0xff7722, 0xffbb33, 0xffffff];
      const pMat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(pGeo, pMat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.8,
        pos.y + 0.5 + (Math.random() - 0.5) * 0.8,
        pos.z + (Math.random() - 0.5) * 0.8
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 9.0,
        2.0 + Math.random() * 6.0,
        (Math.random() - 0.5) * 9.0
      );
      this.particleGroup.add(mesh);
      mesh.userData = { vel, age: 0, maxAge: 0.8 };
    }
  }

  private spawnBurnParticles(pos: THREE.Vector3) {
    if (Math.random() < 0.6) return;
    const pGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const mesh = new THREE.Mesh(pGeo, pMat);
    mesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.4,
      pos.y + 1.2 + Math.random() * 0.5,
      pos.z + (Math.random() - 0.5) * 0.4
    );
    this.particleGroup.add(mesh);
    mesh.userData = {
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5),
      age: 0,
      maxAge: 0.35
    };
  }

  private updateParticles(dt: number) {
    for (let i = this.particleGroup.children.length - 1; i >= 0; i--) {
      const p = this.particleGroup.children[i] as THREE.Mesh;
      const data = p.userData;
      data.age += dt;

      data.vel.y -= 10.0 * dt;
      p.position.addScaledVector(data.vel, dt);

      if (data.age >= data.maxAge) {
        this.particleGroup.remove(p);
        p.geometry.dispose();
      }
    }
  }

  public dispose() {
    for (const mob of this.mobs) {
      mob.dispose();
    }
    this.mobs = [];
    for (const fb of this.fireballs) {
      fb.dispose();
    }
    this.fireballs = [];
    this.scene.remove(this.particleGroup);
  }
}
