import * as THREE from 'three';
import { World, RaycastHit } from '../world/World';
import { Player, CameraPerspective } from '../player/Player';
import { Controls } from '../player/Controls';
import { SoundManager } from '../audio/SoundManager';
import { Inventory } from './Inventory';
import { Block, BLOCK_DEFS, ItemId, ITEM_DEFS, SoundGroup, isBlockItem } from '../world/BlockTypes';
import { ItemEntity } from './ItemEntity';
import { ExperienceOrb } from './ExperienceOrb';
import { TextureAtlas } from '../textures/TextureAtlas';
import { MobManager } from '../entities/MobManager';
import { MobType } from '../entities/Mob';
import { ArrowEntity } from '../entities/ArrowEntity';
import { EnchantingManager } from './EnchantingManager';
import { PotionManager } from './PotionManager';
import { AdvancementManager } from './Advancements';
import { RedstoneManager } from './RedstoneManager';
import { SplashSystem } from './SplashSystem';
import { ParticleEmitterSystem } from './ParticleEmitter';

export class BlockInteraction {
  public scene: THREE.Scene;
  public world: World;
  public player: Player;
  public controls: Controls;
  public sounds: SoundManager;
  public inventory: Inventory;
  public atlas: TextureAtlas;
  public mobManager?: MobManager;
  public potionManager?: PotionManager;
  public splashSystem?: SplashSystem;
  public particleEmitter?: ParticleEmitterSystem;
  public enchantingManager: EnchantingManager;
  public redstoneManager?: RedstoneManager;
  public advancements?: AdvancementManager;

  // Real-time eating & drinking mechanics
  public isEating: boolean = false;
  public eatingTimer: number = 0;
  public eatingItemId: number = 0;
  private eatSoundTimer: number = 0;

  // Visual outline around targeted block
  private highlightBox: THREE.LineSegments;
  private currentHit: RaycastHit | null = null;

  // Mining progress state
  public isMining: boolean = false;
  public miningProgress: number = 0; // 0 to 1
  private miningTarget: THREE.Vector3 | null = null;
  public crackMesh: THREE.Mesh;
  private creativeBreakTimer: number = 0;
  private miningSoundTimer: number = 0;

  // Particle systems for broken blocks
  public particleGroup: THREE.Group;

  // Dropped items, XP orbs, and flying arrows
  public itemEntities: ItemEntity[] = [];
  public experienceOrbs: ExperienceOrb[] = [];
  public arrows: ArrowEntity[] = [];
  private portalTimer: number = 0;

  // Callbacks
  public onOpenCraftingTable?: () => void;
  public onOpenTrading?: () => void;
  public onOpenFurnace?: (pos: THREE.Vector3) => void;
  public onOpenChest?: (pos: THREE.Vector3) => void;
  public onOpenBed?: (pos: THREE.Vector3) => void;
  public onOpenEnchanting?: (pos: THREE.Vector3) => void;

  constructor(
    scene: THREE.Scene,
    world: World,
    player: Player,
    controls: Controls,
    sounds: SoundManager,
    inventory: Inventory,
    atlas: TextureAtlas
  ) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.controls = controls;
    this.sounds = sounds;
    this.inventory = inventory;
    this.atlas = atlas;
    this.enchantingManager = new EnchantingManager(this.player, this.inventory, this.sounds, this.scene);

    // 1. Highlight box (wireframe outline)
    const boxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const wireGeo = new THREE.EdgesGeometry(boxGeo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    this.highlightBox = new THREE.LineSegments(wireGeo, wireMat);
    this.highlightBox.visible = false;
    this.scene.add(this.highlightBox);

    // 2. Crack overlay box mesh
    const crackGeo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    const crackMat = new THREE.MeshBasicMaterial({
      map: this.atlas.crackTexture,
      transparent: true,
      opacity: 0.7,
      depthTest: true,
      depthWrite: false
    });
    this.crackMesh = new THREE.Mesh(crackGeo, crackMat);
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    // 3. Particle debris group
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    // 4. Fluid simulation event callbacks
    this.world.fluidSimulator.onExtinguish = (pos, _resultBlock) => {
      this.sounds.playExtinguish();
      this.spawnSteamParticles(pos);
    };

    this.world.fluidSimulator.onDropItem = (id, count, pos) => {
      const item = new ItemEntity(this.scene, this.world, id, count, pos);
      this.itemEntities.push(item);
    };

    this.initControls();
  }

  private getAttackDamage(): number {
    const held = this.inventory.getSelectedItem();
    let dmg = 1;
    if (held) {
      switch (held.id) {
        case ItemId.DIAMOND_SWORD: dmg = 7; break;
        case ItemId.IRON_SWORD: dmg = 6; break;
        case ItemId.STONE_SWORD: dmg = 5; break;
        case ItemId.WOODEN_SWORD: dmg = 4; break;
        case ItemId.DIAMOND_AXE: dmg = 6; break;
        case ItemId.IRON_AXE: dmg = 5; break;
        case ItemId.STONE_AXE: dmg = 4; break;
        case ItemId.WOODEN_AXE: dmg = 3; break;
        case ItemId.DIAMOND_PICKAXE: dmg = 4; break;
        case ItemId.IRON_PICKAXE: dmg = 3; break;
        case ItemId.STONE_PICKAXE: dmg = 2; break;
        case ItemId.WOODEN_PICKAXE: dmg = 2; break;
        default: dmg = 1; break;
      }
    }
    if (this.player.potionStrengthMultiplier > 1.0) {
      dmg *= this.player.potionStrengthMultiplier;
    }
    return dmg;
  }

  private isFoodItem(id: number): boolean {
    return [
      ItemId.APPLE,
      ItemId.BREAD,
      ItemId.RAW_BEEF,
      ItemId.COOKED_BEEF,
      ItemId.PORKCHOP,
      ItemId.RAW_CHICKEN,
      ItemId.RAW_FISH,
      ItemId.COOKED_FISH
    ].includes(id);
  }

  private isPotionItem(id: number): boolean {
    return [
      ItemId.POTION_HEALING,
      ItemId.POTION_SPEED,
      ItemId.POTION_FIRE_RESISTANCE,
      ItemId.POTION_NIGHT_VISION,
      ItemId.POTION_STRENGTH
    ].includes(id);
  }

  private getFoodRestore(id: number): { hunger: number; health: number } {
    switch (id) {
      case ItemId.APPLE: return { hunger: 4, health: 2 };
      case ItemId.BREAD: return { hunger: 5, health: 3 };
      case ItemId.COOKED_BEEF: return { hunger: 8, health: 4 };
      case ItemId.PORKCHOP: return { hunger: 3, health: 1 };
      case ItemId.RAW_BEEF: return { hunger: 3, health: 1 };
      case ItemId.RAW_CHICKEN: return { hunger: 2, health: 1 };
      case ItemId.RAW_FISH: return { hunger: 2, health: 1 };
      case ItemId.COOKED_FISH: return { hunger: 5, health: 3 };
      default: return { hunger: 2, health: 1 };
    }
  }

  private initControls() {
    this.controls.onLeftClick = () => {
      this.player.triggerSwing();

      // Check if striking a mob first
      if (this.mobManager) {
        const rayOrigin = this.player.camera.position.clone();
        const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.camera.quaternion).normalize();

        // Deflect incoming Ghast fireball on swing!
        if (this.mobManager.deflectFireball(this.player.position, rayDir)) {
          this.sounds.playCritHit();
          return;
        }

        const hitMob = this.mobManager.raycastMob(rayOrigin, rayDir, 3.8);
        if (hitMob) {
          const dmg = this.getAttackDamage();
          const knockback = rayDir.clone().setY(0.3).normalize();
          hitMob.takeDamage(dmg, knockback);
          this.sounds.playCritHit();
          this.spawnCritParticles(hitMob.position);
          if (hitMob.type === MobType.ZOMBIE || hitMob.type === MobType.CREEPER) {
            this.advancements?.award('monster_hunter');
          }
          return;
        }
      }

      if (this.currentHit && this.currentHit.hit) {
        // Creative mode instant break
        if (this.player.gameMode === 'creative') {
          const hitPos = this.currentHit.pos.clone();
          this.miningTarget = hitPos;
          this.creativeBreakTimer = -0.15; // 0.25s delay before continuous breaking begins
          this.breakBlock(hitPos, this.currentHit.block);
        }
      }
    };

    this.controls.onRightClick = () => {
      const rayOrigin = this.player.camera.position.clone();
      const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.camera.quaternion).normalize();

      // Check Mob right click interaction (Villager trading or Cow milking)
      if (this.mobManager) {
        const hitMob = this.mobManager.raycastMob(rayOrigin, rayDir, 3.8);
        if (hitMob && hitMob.type === MobType.VILLAGER) {
          this.onOpenTrading?.();
          return;
        }

        const heldItem = this.inventory.getSelectedItem();
        if (hitMob && hitMob.type === MobType.COW && heldItem && heldItem.id === ItemId.BUCKET) {
          this.sounds.playCowMoo();
          this.player.triggerSwing();
          if (this.player.gameMode === 'survival') {
            const slot = this.inventory.getSelectedSlot();
            if (heldItem.count <= 1) {
              this.inventory.setSlot(slot, { id: ItemId.MILK_BUCKET, count: 1 });
            } else {
              this.inventory.removeFromSlot(slot, 1);
              this.inventory.addItem(ItemId.MILK_BUCKET, 1);
            }
          }
          return;
        }

        // Animal feeding & breeding with favored food
        if (hitMob && heldItem && hitMob.isFavoredFood(heldItem.id) && !hitMob.isBaby && hitMob.inLove <= 0) {
          this.sounds.playEat();
          this.player.triggerSwing();
          if (this.player.gameMode === 'survival') {
            const slot = this.inventory.getSelectedSlot();
            this.inventory.removeFromSlot(slot, 1);
          }
          hitMob.feed();
          const bred = this.mobManager.checkBreeding(hitMob);
          if (bred) {
            this.advancements?.award('the_parrots_and_the_bats');
          }
          return;
        }
      }

      const held = this.inventory.getSelectedItem();

      // 1. Bow Charging
      if (held && held.id === ItemId.BOW) {
        const hasArrow = this.player.gameMode === 'creative' || this.inventory.countItem(ItemId.ARROW) > 0;
        if (hasArrow) {
          this.player.isChargingBow = true;
          this.player.bowCharge = 0;
          this.sounds.playBowPull();
        } else {
          this.sounds.playClick();
        }
        return;
      }

      // 2. Armor Quick Equip
      if (held && ITEM_DEFS[held.id]?.armorSlot) {
        const replaced = this.inventory.equipArmor(held);
        this.inventory.setSlot(this.inventory.getSelectedSlot(), replaced);
        this.sounds.playArmorEquip();
        return;
      }

      // 3. Food Eating (Apple, Bread, Meats) - start eating hold timer
      if (held && this.isFoodItem(held.id)) {
        if (this.player.hunger < 20 || this.player.health < 20) {
          this.isEating = true;
          this.eatingTimer = 0;
          this.eatingItemId = held.id;
          this.eatSoundTimer = 0;
        }
        return;
      }

      // 4. Potion & Milk Drinking - start drinking hold timer
      if (held && (this.isPotionItem(held.id) || held.id === ItemId.MILK_BUCKET)) {
        this.isEating = true;
        this.eatingTimer = 0;
        this.eatingItemId = held.id;
        this.eatSoundTimer = 0;
        return;
      }

      // 5. Bucket Fluid Scooping (Raycast targeting water/lava blocks)
      if (held && held.id === ItemId.BUCKET) {
        const isIso = this.player.perspective === CameraPerspective.THIRD_PERSON_ISOMETRIC;
        const maxRayDist = isIso ? (this.player.isoDistance + 6.0) : 5.5;
        const fluidHit = this.world.raycast(rayOrigin, rayDir, maxRayDist, true);

        if (fluidHit.hit && (fluidHit.block === Block.WATER || fluidHit.block === Block.LAVA)) {
          const isWater = fluidHit.block === Block.WATER;
          const bucketResult = isWater ? ItemId.WATER_BUCKET : ItemId.LAVA_BUCKET;
          this.world.setBlock(fluidHit.pos.x, fluidHit.pos.y, fluidHit.pos.z, Block.AIR);
          this.sounds.playSplash();
          this.player.triggerSwing();
          if (this.player.gameMode === 'survival') {
            const slot = this.inventory.getSelectedSlot();
            if (held.count <= 1) {
              this.inventory.setSlot(slot, { id: bucketResult, count: 1 });
            } else {
              this.inventory.removeFromSlot(slot, 1);
              this.inventory.addItem(bucketResult, 1);
            }
          }
          return;
        }
      }

      // 6. Water Bucket & Lava Bucket Placement
      if (held && (held.id === ItemId.WATER_BUCKET || held.id === ItemId.LAVA_BUCKET)) {
        if (this.currentHit && this.currentHit.hit) {
          const placePos = this.currentHit.pos.clone().add(this.currentHit.normal);
          const fluidBlock = held.id === ItemId.WATER_BUCKET ? Block.WATER : Block.LAVA;
          this.world.setBlock(placePos.x, placePos.y, placePos.z, fluidBlock);
          this.world.fluidSimulator.registerSource(placePos.x, placePos.y, placePos.z, fluidBlock);
          this.sounds.playSplash();
          this.player.triggerSwing();
          if (this.player.gameMode === 'survival') {
            this.inventory.setSlot(this.inventory.getSelectedSlot(), { id: ItemId.BUCKET, count: 1 });
          }
          return;
        }
      }

      // 7. Hoe Tilling (Turn Grass / Dirt into Farmland)
      const isHoe = held && (
        held.id === ItemId.WOODEN_HOE ||
        held.id === ItemId.STONE_HOE ||
        held.id === ItemId.IRON_HOE ||
        held.id === ItemId.DIAMOND_HOE
      );
      if (isHoe && this.currentHit && this.currentHit.hit) {
        const hitBlock = this.currentHit.block;
        const hitPos = this.currentHit.pos;
        if (hitBlock === Block.GRASS || hitBlock === Block.DIRT) {
          const aboveBlock = this.world.getBlock(hitPos.x, hitPos.y + 1, hitPos.z);
          if (aboveBlock === Block.AIR || !BLOCK_DEFS[aboveBlock]?.solid) {
            this.world.setBlock(hitPos.x, hitPos.y, hitPos.z, Block.FARMLAND);
            this.sounds.playDig('gravel');
            this.player.triggerSwing();
            if (this.player.gameMode === 'survival') {
              const broke = this.inventory.damageHeldItem(1);
              if (broke) {
                this.sounds.playBreak('glass');
                this.spawnToolBreakParticles();
              }
            }
            return;
          }
        }
      }

      // 8. Wheat Seeds Planting (On Farmland with Air above)
      if (held && held.id === ItemId.WHEAT_SEEDS && this.currentHit && this.currentHit.hit) {
        const hitBlock = this.currentHit.block;
        const hitPos = this.currentHit.pos;
        if (hitBlock === Block.FARMLAND) {
          const plantY = hitPos.y + 1;
          const aboveBlock = this.world.getBlock(hitPos.x, plantY, hitPos.z);
          if (aboveBlock === Block.AIR) {
            this.world.setBlock(hitPos.x, plantY, hitPos.z, Block.WHEAT_CROP);
            this.sounds.playPlace('grass');
            this.player.triggerSwing();
            if (this.player.gameMode === 'survival') {
              this.inventory.removeFromSlot(this.inventory.getSelectedSlot(), 1);
            }
            return;
          }
        }
      }

      if (!this.currentHit || !this.currentHit.hit) return;

      const hitPos = this.currentHit.pos;
      const hitBlock = this.currentHit.block;

      // 4. Obsidian Portal Frame Ignition
      if (hitBlock === Block.OBSIDIAN) {
        const ignited = this.tryIgnitePortal(hitPos);
        if (ignited) {
          this.sounds.playPortalHum();
          return;
        }
      }

      // Right-click Crafting Table
      if (hitBlock === Block.CRAFTING_TABLE) {
        this.sounds.playClick();
        this.onOpenCraftingTable?.();
        return;
      }

      // Right-click Furnace
      if (hitBlock === Block.FURNACE) {
        this.sounds.playClick();
        this.onOpenFurnace?.(hitPos);
        return;
      }

      // Right-click Chest
      if (hitBlock === Block.CHEST) {
        this.sounds.playClick();
        this.onOpenChest?.(hitPos);
        return;
      }

      // Right-click Bed
      if (hitBlock === Block.BED) {
        this.onOpenBed?.(hitPos);
        return;
      }

      // Right-click Lever
      if (hitBlock === Block.LEVER) {
        this.redstoneManager?.toggleLever(hitPos.x, hitPos.y, hitPos.z);
        this.player.triggerSwing();
        return;
      }

      // Right-click TNT
      if (hitBlock === Block.TNT) {
        this.redstoneManager?.primeTNT(hitPos.x, hitPos.y, hitPos.z);
        this.player.triggerSwing();
        return;
      }

      // Right-click Enchanting Table
      if (hitBlock === Block.ENCHANTING_TABLE) {
        this.sounds.playClick();
        if (this.onOpenEnchanting) {
          this.onOpenEnchanting(hitPos);
        } else {
          this.enchantingManager.applyEnchantment(0, hitPos);
        }
        return;
      }

      if (!held) return;

      // Check if held item is a placeable block or Redstone Dust
      const blockToPlace = (held.id === ItemId.REDSTONE_DUST) ? Block.REDSTONE_WIRE : (isBlockItem(held.id) ? (held.id as Block) : null);
      if (blockToPlace !== null) {
        const placePos = hitPos.clone().add(this.currentHit.normal);

        // Verify that placing block does not collide with player's bounding box
        const blockAABB = new THREE.Box3(
          placePos,
          new THREE.Vector3(placePos.x + 1, placePos.y + 1, placePos.z + 1)
        );

        const playerBox3 = new THREE.Box3(
          this.player.aabb.min,
          this.player.aabb.max
        );

        const def = BLOCK_DEFS[blockToPlace];
        if (def?.solid && blockAABB.intersectsBox(playerBox3)) {
          return; // Cannot place inside player
        }

        // Place block
        const success = this.world.setBlock(placePos.x, placePos.y, placePos.z, blockToPlace);
        if (success) {
          if (blockToPlace === Block.ENCHANTING_TABLE) {
            this.enchantingManager.registerTable(placePos.x, placePos.y, placePos.z);
          }
          if (this.redstoneManager?.isRedstoneComponent(blockToPlace)) {
            this.redstoneManager.updateNetworkAround(placePos.x, placePos.y, placePos.z);
          }
          this.sounds.playPlace(def?.soundType || 'stone');
          this.player.triggerSwing();

          if (this.player.gameMode === 'survival') {
            this.inventory.removeFromSlot(this.inventory.getSelectedSlot(), 1);
          }
        }
      }
    };

    // Release right click
    this.controls.onRightClickUp = () => {
      this.isEating = false;
      this.eatingTimer = 0;

      if (this.player.isChargingBow) {
        const charge = this.player.bowCharge;
        this.player.isChargingBow = false;
        this.player.bowCharge = 0;

        if (charge >= 0.15) {
          const rayOrigin = this.player.camera.position.clone().add(
            new THREE.Vector3(0.1, -0.12, -0.4).applyQuaternion(this.player.camera.quaternion)
          );
          const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.camera.quaternion).normalize();
          const arrow = new ArrowEntity(this.scene, this.sounds, rayOrigin, rayDir, charge);
          this.arrows.push(arrow);
          this.sounds.playBowShoot();

          if (this.player.gameMode === 'survival') {
            this.inventory.removeItem(ItemId.ARROW, 1);
            this.inventory.damageHeldItem(1);
          }
        }
      }
    };
  }

  public update(dt: number) {
    // Process continuous eating/drinking hold mechanics
    if (this.isEating) {
      const held = this.inventory.getSelectedItem();
      if (!this.controls.mouseRightDown || !held || held.id !== this.eatingItemId) {
        this.isEating = false;
        this.eatingTimer = 0;
      } else {
        this.eatingTimer += dt;
        this.eatSoundTimer += dt;

        // Rapid hand bobbing towards player's mouth
        this.player.handContainer.position.y += Math.sin(this.eatingTimer * 28) * 0.008;

        if (this.eatSoundTimer >= 0.22) {
          this.eatSoundTimer = 0;
          if (this.isFoodItem(this.eatingItemId)) {
            this.sounds.playEat();
            this.spawnFoodCrumbParticles(this.eatingItemId);
          } else {
            this.sounds.playDrinkPotion();
          }
        }

        if (this.eatingTimer >= 1.2) {
          this.isEating = false;
          this.eatingTimer = 0;

          if (this.isFoodItem(this.eatingItemId)) {
            const restore = this.getFoodRestore(this.eatingItemId);
            this.player.hunger = Math.min(20, this.player.hunger + restore.hunger);
            this.player.saturation = Math.min(20, this.player.saturation + restore.hunger * 0.8);
            this.player.health = Math.min(20, this.player.health + restore.health);
            if (this.player.gameMode === 'survival') {
              this.inventory.removeFromSlot(this.inventory.getSelectedSlot(), 1);
            }
            this.sounds.playBurp();
          } else if (this.isPotionItem(this.eatingItemId)) {
            if (this.potionManager) {
              const drank = this.potionManager.drinkPotion(this.eatingItemId);
              if (drank && this.player.gameMode === 'survival') {
                this.inventory.removeFromSlot(this.inventory.getSelectedSlot(), 1);
                this.inventory.addItem(ItemId.GLASS_BOTTLE, 1);
              }
            }
          } else if (this.eatingItemId === ItemId.MILK_BUCKET) {
            this.potionManager?.clearEffects();
            this.player.hunger = Math.min(20, this.player.hunger + 1);
            this.player.health = Math.min(20, this.player.health + 1);
            if (this.player.gameMode === 'survival') {
              this.inventory.setSlot(this.inventory.getSelectedSlot(), { id: ItemId.BUCKET, count: 1 });
            }
            this.sounds.playBurp();
          }
        }
      }
    }

    // 1. Raycast from camera center
    const rayOrigin = this.player.camera.position.clone();
    const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.camera.quaternion).normalize();

    const isIso = this.player.perspective === CameraPerspective.THIRD_PERSON_ISOMETRIC;
    const maxRayDist = isIso ? (this.player.isoDistance + 6.0) : 5.5;

    this.currentHit = this.world.raycast(rayOrigin, rayDir, maxRayDist);

    // In isometric mode, enforce that the targeted block is within player's reach (5.5 blocks from Steve)
    if (this.currentHit.hit && isIso) {
      const distFromPlayer = this.currentHit.pos.clone().addScalar(0.5).distanceTo(this.player.position);
      if (distFromPlayer > 5.5) {
        this.currentHit = { hit: false, pos: new THREE.Vector3(), normal: new THREE.Vector3(), block: 0, distance: 0 };
      }
    }

    if (this.currentHit.hit) {
      this.highlightBox.visible = true;
      const b = this.currentHit.block;
      if (b === Block.TORCH || b === Block.REDSTONE_TORCH) {
        // Torch hitbox: centered 2x2 pixels, 10 pixels high
        this.highlightBox.scale.set(0.2, 0.65, 0.2);
        this.highlightBox.position.set(
          this.currentHit.pos.x + 0.5,
          this.currentHit.pos.y + 0.325,
          this.currentHit.pos.z + 0.5
        );
        this.crackMesh.scale.set(0.21, 0.66, 0.21);
      } else if (b === Block.RAIL || b === Block.LILY_PAD) {
        this.highlightBox.scale.set(1.0, 0.08, 1.0);
        this.highlightBox.position.set(
          this.currentHit.pos.x + 0.5,
          this.currentHit.pos.y + 0.04,
          this.currentHit.pos.z + 0.5
        );
        this.crackMesh.scale.set(1.01, 0.09, 1.01);
      } else {
        this.highlightBox.scale.set(1.0, 1.0, 1.0);
        this.highlightBox.position.set(
          this.currentHit.pos.x + 0.5,
          this.currentHit.pos.y + 0.5,
          this.currentHit.pos.z + 0.5
        );
        this.crackMesh.scale.set(1.0, 1.0, 1.0);
      }
    } else {
      this.highlightBox.visible = false;
      this.stopMining();
    }

    // Update 3D hovering enchanting books and glyphs
    this.enchantingManager.update(dt, this.player.position, this.world);

    // 2. Continuous Mining logic via continued press (Creative & Survival)
    if (this.controls.mouseLeftDown && this.player.gameMode === 'creative' && this.currentHit.hit) {
      this.creativeBreakTimer += dt;
      const hitPos = this.currentHit.pos;
      if (this.creativeBreakTimer >= 0.18) {
        this.creativeBreakTimer = 0;
        this.miningTarget = hitPos.clone();
        this.player.triggerSwing();
        this.breakBlock(hitPos, this.currentHit.block);

        // Immediate re-raycast so continuous press chains into next block seamlessly
        const nextHit = this.world.raycast(rayOrigin, rayDir, maxRayDist);
        if (nextHit.hit) {
          this.currentHit = nextHit;
          this.highlightBox.visible = true;
          this.highlightBox.position.set(nextHit.pos.x + 0.5, nextHit.pos.y + 0.5, nextHit.pos.z + 0.5);
        } else {
          this.highlightBox.visible = false;
        }
      }
    } else if (this.controls.mouseLeftDown && this.player.gameMode === 'survival' && this.currentHit.hit) {
      const hitPos = this.currentHit.pos;
      if (!this.miningTarget || !this.miningTarget.equals(hitPos)) {
        this.miningTarget = hitPos.clone();
        this.miningProgress = 0;
        this.miningSoundTimer = 0;
      }

      this.isMining = true;
      this.player.triggerSwing();

      const blockDef = BLOCK_DEFS[this.currentHit.block];
      if (blockDef && blockDef.hardness < Infinity) {
        // Periodic block cracking sound feedback while continuously holding
        this.miningSoundTimer += dt;
        if (this.miningSoundTimer >= 0.24) {
          this.miningSoundTimer = 0;
          this.sounds.playDig(blockDef.soundType || 'stone');
        }

        // Calculate tiered mining speed with authentic tool categories & tier requirements
        let speedMultiplier = 1.0;
        const held = this.inventory.getSelectedItem();
        const itemDef = held ? ITEM_DEFS[held.id] : undefined;

        const isStoneCategory = [
          Block.STONE, Block.COBBLESTONE, Block.COAL_ORE, Block.IRON_ORE,
          Block.GOLD_ORE, Block.DIAMOND_ORE, Block.REDSTONE_ORE, Block.BRICKS,
          Block.FURNACE, Block.SANDSTONE, Block.OBSIDIAN, Block.NETHERRACK,
          Block.NETHER_BRICKS, Block.NETHER_QUARTZ_ORE, Block.ENCHANTING_TABLE
        ].includes(this.currentHit.block);

        const isWoodCategory = [
          Block.OAK_LOG, Block.BIRCH_LOG, Block.OAK_PLANKS, Block.BIRCH_PLANKS,
          Block.BOOKSHELF, Block.CRAFTING_TABLE, Block.CHEST, Block.BED
        ].includes(this.currentHit.block);

        const isDirtCategory = [
          Block.DIRT, Block.GRASS, Block.SAND, Block.GRAVEL, Block.SNOW
        ].includes(this.currentHit.block);

        if (isStoneCategory) {
          if (itemDef?.toolType === 'pickaxe') {
            const tier = itemDef.toolTier || 1;
            const meetsTier = (this.currentHit.block === Block.OBSIDIAN && tier >= 4) ||
              ((this.currentHit.block === Block.DIAMOND_ORE || this.currentHit.block === Block.GOLD_ORE || this.currentHit.block === Block.REDSTONE_ORE) && tier >= 3) ||
              (this.currentHit.block === Block.IRON_ORE && tier >= 2) ||
              (![Block.OBSIDIAN, Block.DIAMOND_ORE, Block.GOLD_ORE, Block.REDSTONE_ORE, Block.IRON_ORE].includes(this.currentHit.block));
            speedMultiplier = meetsTier ? (itemDef.miningSpeedMultiplier || 2.0) : 1.0;
          } else {
            speedMultiplier = 0.35; // Harsh penalty for mining stone with bare hand or wrong tool
          }
        } else if (isWoodCategory) {
          if (itemDef?.toolType === 'axe') {
            speedMultiplier = itemDef.miningSpeedMultiplier || 2.0;
          } else {
            speedMultiplier = 0.6;
          }
        } else if (isDirtCategory) {
          if (itemDef?.toolType === 'shovel') {
            speedMultiplier = itemDef.miningSpeedMultiplier || 2.0;
          } else {
            speedMultiplier = 1.0;
          }
        }

        const breakDuration = Math.max(0.04, blockDef.hardness / speedMultiplier);
        this.miningProgress += dt / breakDuration;

        // Show cracking overlay
        this.crackMesh.visible = true;
        this.crackMesh.position.copy(this.highlightBox.position);

        // Update crack stage (0 to 9)
        const stage = Math.min(9, Math.floor(this.miningProgress * 10));
        // Offset UV of crack texture
        this.atlas.crackTexture.offset.x = stage * 0.1;
        this.atlas.crackTexture.repeat.x = 0.1;

        if (this.miningProgress >= 1.0) {
          const brokenBlock = this.currentHit.block;
          this.breakBlock(hitPos, brokenBlock);

          // Continuous mining chaining: immediately re-raycast so continuous press mines the next block!
          const nextHit = this.world.raycast(rayOrigin, rayDir, maxRayDist);
          const nextDef = nextHit.hit ? BLOCK_DEFS[nextHit.block] : undefined;
          if (nextHit.hit && this.controls.mouseLeftDown && nextDef && nextDef.hardness < Infinity) {
            this.currentHit = nextHit;
            this.miningTarget = nextHit.pos.clone();
            this.miningProgress = 0;
            this.miningSoundTimer = 0;
            this.isMining = true;
            this.highlightBox.visible = true;
            this.highlightBox.position.set(nextHit.pos.x + 0.5, nextHit.pos.y + 0.5, nextHit.pos.z + 0.5);
            this.crackMesh.visible = true;
            this.crackMesh.position.copy(this.highlightBox.position);
            this.atlas.crackTexture.offset.x = 0;
            this.player.triggerSwing();
          } else {
            this.stopMining();
            if (nextHit.hit) {
              this.currentHit = nextHit;
              this.highlightBox.visible = true;
              this.highlightBox.position.set(nextHit.pos.x + 0.5, nextHit.pos.y + 0.5, nextHit.pos.z + 0.5);
            }
          }
        }
      } else {
        // Bedrock or unbreakable
        this.crackMesh.visible = false;
      }
    } else {
      this.stopMining();
      this.creativeBreakTimer = 0;
      this.miningSoundTimer = 0;
    }

    // 3. Update dropped items
    for (let i = this.itemEntities.length - 1; i >= 0; i--) {
      const entity = this.itemEntities[i];
      entity.update(dt, this.world, this.player, this.sounds, (id, count) => {
        return this.inventory.addItem(id, count);
      });
      if (!entity.isAlive) {
        this.itemEntities.splice(i, 1);
      }
    }

    // 4. Update experience orbs
    for (let i = this.experienceOrbs.length - 1; i >= 0; i--) {
      const orb = this.experienceOrbs[i];
      orb.update(dt, this.world, this.player, this.sounds);
      if (!orb.isAlive) {
        this.experienceOrbs.splice(i, 1);
      }
    }

    // 5. Update flying projectile arrows
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const alive = this.arrows[i].update(dt, this.world, this.mobManager);
      if (!alive) {
        this.arrows.splice(i, 1);
      }
    }

    // 6. Nether portal standing teleport check
    const px = Math.floor(this.player.position.x);
    const py = Math.floor(this.player.position.y);
    const pz = Math.floor(this.player.position.z);
    if (this.world.getBlock(px, py, pz) === Block.PORTAL || this.world.getBlock(px, py + 1, pz) === Block.PORTAL) {
      this.portalTimer += dt;
      if (this.portalTimer > 2.0) {
        this.portalTimer = 0;
        // Interdimensional dimension travel
        const nextDim = this.world.currentDimension === 'overworld' ? 'nether' : 'overworld';
        this.world.switchDimension(nextDim);
        const spawn = this.world.getSafeSpawnLocation(0, 0);
        this.player.setPosition(spawn.x, spawn.y + 0.5, spawn.z);
        this.sounds.playPortalWarp();
      }
    } else {
      this.portalTimer = 0;
    }

    // 7. Update redstone automation & TNT physics
    this.redstoneManager?.update(dt);

    // 8. Update particles
    this.updateParticles(dt);
  }

  // Check if an obsidian portal frame exists around clicked block and fill interior with portal blocks
  private tryIgnitePortal(pos: THREE.Vector3): boolean {
    const x = Math.floor(pos.x);
    const y = Math.floor(pos.y);
    const z = Math.floor(pos.z);

    // Check X-aligned frame: interior at (x, y+1) to (x+1, y+3)
    const checkFrameX = (ox: number, oy: number, oz: number) => {
      // Check 2x3 air interior
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 1; dy <= 3; dy++) {
          const b = this.world.getBlock(ox + dx, oy + dy, oz);
          if (b !== Block.AIR && b !== Block.PORTAL) return false;
        }
      }
      // Check bottom obsidian (2 blocks)
      if (this.world.getBlock(ox, oy, oz) !== Block.OBSIDIAN || this.world.getBlock(ox + 1, oy, oz) !== Block.OBSIDIAN) return false;
      // Check top obsidian (2 blocks)
      if (this.world.getBlock(ox, oy + 4, oz) !== Block.OBSIDIAN || this.world.getBlock(ox + 1, oy + 4, oz) !== Block.OBSIDIAN) return false;
      // Check left/right columns
      for (let dy = 1; dy <= 3; dy++) {
        if (this.world.getBlock(ox - 1, oy + dy, oz) !== Block.OBSIDIAN) return false;
        if (this.world.getBlock(ox + 2, oy + dy, oz) !== Block.OBSIDIAN) return false;
      }
      return true;
    };

    // Check Z-aligned frame
    const checkFrameZ = (ox: number, oy: number, oz: number) => {
      for (let dz = 0; dz < 2; dz++) {
        for (let dy = 1; dy <= 3; dy++) {
          const b = this.world.getBlock(ox, oy + dy, oz + dz);
          if (b !== Block.AIR && b !== Block.PORTAL) return false;
        }
      }
      if (this.world.getBlock(ox, oy, oz) !== Block.OBSIDIAN || this.world.getBlock(ox, oy, oz + 1) !== Block.OBSIDIAN) return false;
      if (this.world.getBlock(ox, oy + 4, oz) !== Block.OBSIDIAN || this.world.getBlock(ox, oy + 4, oz + 1) !== Block.OBSIDIAN) return false;
      for (let dy = 1; dy <= 3; dy++) {
        if (this.world.getBlock(ox, oy + dy, oz - 1) !== Block.OBSIDIAN) return false;
        if (this.world.getBlock(ox, oy + dy, oz + 2) !== Block.OBSIDIAN) return false;
      }
      return true;
    };

    // Try relative offsets where pos could be part of the bottom/sides
    for (let testX = x - 2; testX <= x + 1; testX++) {
      for (let testY = y - 4; testY <= y; testY++) {
        if (checkFrameX(testX, testY, z)) {
          for (let dx = 0; dx < 2; dx++) {
            for (let dy = 1; dy <= 3; dy++) {
              this.world.setBlock(testX + dx, testY + dy, z, Block.PORTAL);
            }
          }
          this.advancements?.award('into_the_nether');
          return true;
        }
      }
    }

    for (let testZ = z - 2; testZ <= z + 1; testZ++) {
      for (let testY = y - 4; testY <= y; testY++) {
        if (checkFrameZ(x, testY, testZ)) {
          for (let dz = 0; dz < 2; dz++) {
            for (let dy = 1; dy <= 3; dy++) {
              this.world.setBlock(x, testY + dy, testZ + dz, Block.PORTAL);
            }
          }
          this.advancements?.award('into_the_nether');
          return true;
        }
      }
    }

    return false;
  }

  private stopMining() {
    this.isMining = false;
    this.miningProgress = 0;
    this.miningTarget = null;
    this.crackMesh.visible = false;
  }

  // Destroy a block at hit position
  public breakBlock(pos: THREE.Vector3, block: Block) {
    const success = this.world.setBlock(pos.x, pos.y, pos.z, Block.AIR);
    if (success) {
      if (block === Block.ENCHANTING_TABLE) {
        this.enchantingManager.unregisterTable(pos.x, pos.y, pos.z);
      }
      if (this.redstoneManager?.isRedstoneComponent(block)) {
        this.redstoneManager.updateNetworkAround(pos.x, pos.y, pos.z);
      }
      const def = BLOCK_DEFS[block];
      this.sounds.playBreak(def?.soundType || 'stone');
      this.spawnBlockParticles(pos, block);

      // Advancement triggers
      if (block === Block.OAK_LOG || block === Block.BIRCH_LOG) {
        this.advancements?.award('getting_wood');
      } else if (block === Block.COAL_ORE || block === Block.IRON_ORE || block === Block.DIAMOND_ORE || block === Block.GOLD_ORE) {
        this.advancements?.award('time_to_mine');
      }

      // Damage held tool durability if survival mode
      if (this.player.gameMode === 'survival') {
        const held = this.inventory.getSelectedItem();
        if (held && ITEM_DEFS[held.id]?.maxDurability) {
          const broke = this.inventory.damageHeldItem(1);
          if (broke) {
            this.sounds.playBreak('glass');
            this.spawnToolBreakParticles();
          }
        }
      }

      // Check tool category and tier requirements
      const held = this.inventory.getSelectedItem();
      const itemDef = held ? ITEM_DEFS[held.id] : undefined;

      const isStoneCategory = [
        Block.STONE, Block.COBBLESTONE, Block.COAL_ORE, Block.IRON_ORE,
        Block.GOLD_ORE, Block.DIAMOND_ORE, Block.REDSTONE_ORE, Block.BRICKS,
        Block.FURNACE, Block.SANDSTONE, Block.OBSIDIAN, Block.NETHERRACK,
        Block.NETHER_BRICKS, Block.NETHER_QUARTZ_ORE, Block.ENCHANTING_TABLE
      ].includes(block);

      let canHarvest = true;
      if (isStoneCategory) {
        if (itemDef?.toolType !== 'pickaxe') {
          canHarvest = false;
        } else {
          const tier = itemDef.toolTier || 1;
          if (block === Block.OBSIDIAN && tier < 4) {
            canHarvest = false;
          } else if ((block === Block.DIAMOND_ORE || block === Block.GOLD_ORE || block === Block.REDSTONE_ORE) && tier < 3) {
            canHarvest = false;
          } else if (block === Block.IRON_ORE && tier < 2) {
            canHarvest = false;
          }
        }
      }

      if (canHarvest) {
        const dropId = def.dropId !== undefined ? def.dropId : block;
        if (dropId !== Block.AIR) {
          const dropPos = new THREE.Vector3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
          const item = new ItemEntity(this.scene, this.world, dropId, 1, dropPos);
          this.itemEntities.push(item);
        }

        // Spawn experience orbs for ores only when correctly harvested
        if (block === Block.COAL_ORE) {
          this.spawnExperienceOrbs(pos, 2, 1);
        } else if (block === Block.DIAMOND_ORE) {
          this.spawnExperienceOrbs(pos, 4, 2);
        } else if (block === Block.REDSTONE_ORE) {
          this.spawnExperienceOrbs(pos, 3, 1);
        } else if (block === Block.NETHER_QUARTZ_ORE) {
          this.spawnExperienceOrbs(pos, 3, 2);
        }

        // Bonus crop & grass seed drops
        if (block === Block.WHEAT_CROP) {
          const seedCount = 1 + Math.floor(Math.random() * 2);
          const dropPos = new THREE.Vector3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
          this.itemEntities.push(new ItemEntity(this.scene, this.world, ItemId.WHEAT_SEEDS, seedCount, dropPos));
        } else if (block === Block.GRASS && Math.random() < 0.25) {
          const dropPos = new THREE.Vector3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
          this.itemEntities.push(new ItemEntity(this.scene, this.world, ItemId.WHEAT_SEEDS, 1, dropPos));
        }

        // Trigger leaf decay when tree trunk logs are chopped
        if (block === Block.OAK_LOG || block === Block.BIRCH_LOG) {
          this.triggerNearbyLeafDecay(pos);
        }
      }
    }
  }

  // Authentic leaf decay mechanics: leaves distant from logs decay and drop saplings or apples
  private triggerNearbyLeafDecay(pos: THREE.Vector3) {
    const r = 4;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -2; dy <= 4; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const lx = pos.x + dx;
          const ly = pos.y + dy;
          const lz = pos.z + dz;
          const b = this.world.getBlock(lx, ly, lz);
          if (b === Block.OAK_LEAVES || b === Block.BIRCH_LEAVES) {
            let hasLog = false;
            for (let ox = -3; ox <= 3 && !hasLog; ox++) {
              for (let oy = -3; oy <= 3 && !hasLog; oy++) {
                for (let oz = -3; oz <= 3 && !hasLog; oz++) {
                  const nb = this.world.getBlock(lx + ox, ly + oy, lz + oz);
                  if (nb === Block.OAK_LOG || nb === Block.BIRCH_LOG) {
                    hasLog = true;
                  }
                }
              }
            }
            if (!hasLog) {
              this.world.setBlock(lx, ly, lz, Block.AIR);
              this.spawnBlockParticles(new THREE.Vector3(lx, ly, lz), b);
              if (Math.random() < 0.15) {
                const dropId = Math.random() < 0.4 ? ItemId.APPLE : ItemId.STICK;
                const dropPos = new THREE.Vector3(lx + 0.5, ly + 0.5, lz + 0.5);
                this.itemEntities.push(new ItemEntity(this.scene, this.world, dropId, 1, dropPos));
              }
            }
          }
        }
      }
    }
  }

  // Spawn experience orbs in the world
  public spawnExperienceOrbs(pos: THREE.Vector3, count: number = 1, valuePerOrb: number = 1) {
    for (let i = 0; i < count; i++) {
      const dropPos = new THREE.Vector3(
        pos.x + 0.5 + (Math.random() - 0.5) * 0.4,
        pos.y + 0.5 + Math.random() * 0.3,
        pos.z + 0.5 + (Math.random() - 0.5) * 0.4
      );
      const orb = new ExperienceOrb(this.scene, dropPos, valuePerOrb);
      this.experienceOrbs.push(orb);
    }
  }

  // Burst particles when a tool breaks in hand
  private spawnToolBreakParticles() {
    const handPos = this.player.camera.position.clone().add(
      new THREE.Vector3(0.25, -0.25, -0.4).applyQuaternion(this.player.camera.quaternion)
    );
    for (let i = 0; i < 16; i++) {
      const pGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
      const pMat = new THREE.MeshBasicMaterial({ color: 0x886644 });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.copy(handPos);
      this.particleGroup.add(pMesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2.5,
        (Math.random() - 0.5) * 3
      );

      const startTime = performance.now();
      const pUpdate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 0.6) {
          this.particleGroup.remove(pMesh);
          pGeo.dispose();
          pMat.dispose();
          return;
        }
        pMesh.position.addScaledVector(vel, 0.016);
        vel.y -= 9.8 * 0.016;
        requestAnimationFrame(pUpdate);
      };
      requestAnimationFrame(pUpdate);
    }
  }

  // Crumb particles when eating food
  private spawnFoodCrumbParticles(itemId: number) {
    let col = 0xc4823f;
    if (itemId === ItemId.APPLE) col = 0xdc143c;
    else if (itemId === ItemId.RAW_BEEF || itemId === ItemId.PORKCHOP) col = 0xb23b3b;
    else if (itemId === ItemId.COOKED_BEEF) col = 0x6e3822;

    const handPos = this.player.camera.position.clone().add(
      new THREE.Vector3(0.18, -0.22, -0.45).applyQuaternion(this.player.camera.quaternion)
    );

    for (let i = 0; i < 4; i++) {
      const pGeo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
      const pMat = new THREE.MeshBasicMaterial({ color: col });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.copy(handPos);
      this.particleGroup.add(pMesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        -Math.random() * 1.8,
        (Math.random() - 0.5) * 1.5
      );

      const startTime = performance.now();
      const pUpdate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 0.4) {
          this.particleGroup.remove(pMesh);
          pGeo.dispose();
          pMat.dispose();
          return;
        }
        pMesh.position.addScaledVector(vel, 0.016);
        vel.y -= 9.8 * 0.016;
        requestAnimationFrame(pUpdate);
      };
      requestAnimationFrame(pUpdate);
    }
  }

  // Helper to get authentic colors for block break particles
  private getBlockParticleColors(block: Block): number[] {
    switch (block) {
      case Block.GRASS: return [0x5c8e32, 0x866043, 0x4c7828, 0x71ab3e];
      case Block.DIRT: return [0x866043, 0x6b4d36, 0x9c724f];
      case Block.STONE: return [0x757575, 0x8a8a8a, 0x616161];
      case Block.COBBLESTONE: return [0x666666, 0x888888, 0x4f4f4f];
      case Block.OAK_LOG: return [0x6b5335, 0x4d3b25, 0xb89758];
      case Block.OAK_PLANKS: return [0xbc9862, 0x9e7c47, 0xcaa670];
      case Block.OAK_LEAVES: return [0x3c7324, 0x4a8c2c, 0x2e591b];
      case Block.SAND: return [0xdcd39e, 0xc8be88, 0xe8dfaf];
      case Block.GRAVEL: return [0x888082, 0x746d6f, 0x9c9496];
      case Block.GLASS: return [0xd6eaff, 0xffffff, 0xb8dcff];
      case Block.COAL_ORE: return [0x757575, 0x222222, 0x111111];
      case Block.IRON_ORE: return [0x757575, 0xd8af93, 0xbf957a];
      case Block.GOLD_ORE: return [0x757575, 0xfcee4b, 0xd6c72b];
      case Block.DIAMOND_ORE: return [0x757575, 0x4dedf4, 0x2bc4cb];
      case Block.REDSTONE_ORE: return [0x757575, 0xee2222, 0xaa1111];
      case Block.TNT: return [0xdb2c16, 0xffffff, 0x222222];
      case Block.BRICKS: return [0x9b3b2b, 0xd0d0d0, 0x802b1c];
      case Block.BOOKSHELF: return [0x9e7c47, 0xa64b2a, 0x3d6b8c];
      case Block.TORCH: return [0x866043, 0xffaa00, 0xff5500];
      case Block.SNOW: return [0xffffff, 0xe8f0f8, 0xd0e0f0];
      case Block.CACTUS: return [0x4d7a27, 0x395b1c, 0x5e9430];
      case Block.OBSIDIAN: return [0x140f1d, 0x392150, 0x643888];
      case Block.NETHERRACK: return [0x651c1c, 0x852222, 0x420f0f];
      case Block.SOUL_SAND: return [0x4a382e, 0x5c463a, 0x35271f];
      case Block.GLOWSTONE: return [0xcb982e, 0xfce475, 0xe8ba46];
      case Block.NETHER_BRICKS: return [0x2b141a, 0x3c1d25, 0x17090d];
      case Block.NETHER_QUARTZ_ORE: return [0x651c1c, 0xedeae0, 0xffffff];
      case Block.ENCHANTING_TABLE: return [0x140f1d, 0x941818, 0x4dedf4];
      default: return [0x777777, 0x888888, 0x666666];
    }
  }

  public spawnBlockParticles(pos: THREE.Vector3, block: Block) {
    const colors = this.getBlockParticleColors(block);
    const count = 20;

    for (let i = 0; i < count; i++) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const size = 0.055 + Math.random() * 0.035;
      const pGeo = new THREE.BoxGeometry(size, size, size);
      const pMat = new THREE.MeshBasicMaterial({ color: col });
      const pMesh = new THREE.Mesh(pGeo, pMat);

      pMesh.position.set(
        pos.x + 0.15 + Math.random() * 0.7,
        pos.y + 0.15 + Math.random() * 0.7,
        pos.z + 0.15 + Math.random() * 0.7
      );

      // Random 3D initial orientation
      pMesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // 3D outward scattering velocity with vertical burst
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.2,
        1.8 + Math.random() * 2.8,
        (Math.random() - 0.5) * 4.2
      );

      // 3D random angular velocity for tumbling debris
      const rotVel = new THREE.Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16
      );

      this.particleGroup.add(pMesh);
      pMesh.userData = { vel, rotVel, age: 0, maxAge: 0.60 + Math.random() * 0.35 };
    }
  }

  // Critical hit sparkle particles (Golden Stars)
  public spawnCritParticles(targetPos: THREE.Vector3) {
    const count = 14;
    const critColors = [0xffdd33, 0xffbb00, 0xffffff, 0xff9900];

    for (let i = 0; i < count; i++) {
      const col = critColors[Math.floor(Math.random() * critColors.length)];
      const pGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
      const pMat = new THREE.MeshBasicMaterial({ color: col });
      const pMesh = new THREE.Mesh(pGeo, pMat);

      pMesh.position.set(
        targetPos.x + (Math.random() - 0.5) * 0.6,
        targetPos.y + 0.8 + Math.random() * 0.6,
        targetPos.z + (Math.random() - 0.5) * 0.6
      );

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.2,
        2.0 + Math.random() * 3.0,
        (Math.random() - 0.5) * 4.2
      );

      this.particleGroup.add(pMesh);
      pMesh.userData = { vel, age: 0, maxAge: 0.45 };
    }
  }

  // Water splash droplet and bubble particles
  public spawnWaterSplashParticles(pos: THREE.Vector3, count: number = 10) {
    this.splashSystem?.spawnSplash(pos, count);
    const splashColors = [0x99ccff, 0xcce6ff, 0x73b2ff, 0xffffff];
    for (let i = 0; i < count; i++) {
      const col = splashColors[Math.floor(Math.random() * splashColors.length)];
      const pGeo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
      const pMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 });
      const pMesh = new THREE.Mesh(pGeo, pMat);

      pMesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.55,
        pos.y + 0.05 + Math.random() * 0.2,
        pos.z + (Math.random() - 0.5) * 0.55
      );

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.4,
        1.6 + Math.random() * 2.2,
        (Math.random() - 0.5) * 2.4
      );

      this.particleGroup.add(pMesh);
      pMesh.userData = { vel, age: 0, maxAge: 0.42 + Math.random() * 0.2 };
    }
  }

  // Steam billowing particles when water and lava collide
  public spawnSteamParticles(pos: THREE.Vector3, count: number = 8) {
    const steamColors = [0xeeeeee, 0xdddddd, 0xcccccc, 0xffffff];
    for (let i = 0; i < count; i++) {
      const col = steamColors[Math.floor(Math.random() * steamColors.length)];
      const pGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
      const pMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.65 });
      const pMesh = new THREE.Mesh(pGeo, pMat);

      pMesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.6,
        pos.y + Math.random() * 0.3,
        pos.z + (Math.random() - 0.5) * 0.6
      );

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        1.2 + Math.random() * 1.0,
        (Math.random() - 0.5) * 0.8
      );

      this.particleGroup.add(pMesh);
      pMesh.userData = { vel, age: 0, maxAge: 0.6 + Math.random() * 0.3, isSteam: true };
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particleGroup.children.length - 1; i >= 0; i--) {
      const p = this.particleGroup.children[i] as THREE.Mesh;
      const data = p.userData;
      data.age += dt;

      if (data.isSteam) {
        data.vel.y += 0.5 * dt; // steam rises
        data.vel.x *= 0.95;
        data.vel.z *= 0.95;
      } else {
        data.vel.y -= 15.0 * dt; // normal particle gravity
      }
      p.position.addScaledVector(data.vel, dt);

      // 3D angular tumbling rotation
      if (data.rotVel) {
        p.rotation.x += data.rotVel.x * dt;
        p.rotation.y += data.rotVel.y * dt;
        p.rotation.z += data.rotVel.z * dt;
      }

      // Smooth shrinking as particles age
      const scale = Math.max(0.05, 1.0 - (data.age / data.maxAge));
      p.scale.set(scale, scale, scale);

      if (data.age >= data.maxAge) {
        this.particleGroup.remove(p);
        p.geometry.dispose();
        if (Array.isArray(p.material)) {
          p.material.forEach(m => m.dispose());
        } else if (p.material) {
          (p.material as THREE.Material).dispose();
        }
      }
    }
  }
}
