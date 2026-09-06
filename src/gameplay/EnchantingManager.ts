import * as THREE from 'three';
import { ItemId, ITEM_DEFS, Block } from '../world/BlockTypes';
import { Player } from '../player/Player';
import { SoundManager } from '../audio/SoundManager';
import { Inventory } from './Inventory';
import { World } from '../world/World';

export interface EnchantmentOption {
  name: string;
  levelCost: number;
  description: string;
}

interface TableBook {
  group: THREE.Group;
  leftCover: THREE.Group;
  rightCover: THREE.Group;
  flippingPage: THREE.Mesh;
  tablePos: THREE.Vector3;
  currentYaw: number;
  openAngle: number;
  flipTime: number;
  glyphTimer: number;
}

export class EnchantingManager {
  private player: Player;
  private inventory: Inventory;
  private sounds: SoundManager;
  private scene: THREE.Scene;
  private particleGroup: THREE.Group;

  // Active 3D hovering books on enchanting tables
  private books: Map<string, TableBook> = new Map();
  private scanTimer: number = 0;
  private bookMaterials: THREE.Material[] = [];

  constructor(player: Player, inventory: Inventory, sounds: SoundManager, scene: THREE.Scene) {
    this.player = player;
    this.inventory = inventory;
    this.sounds = sounds;
    this.scene = scene;
    this.particleGroup = new THREE.Group();
    scene.add(this.particleGroup);
  }

  // --- 3D INTERACTIVE ENCHANTING BOOK ON TABLE ---

  public registerTable(x: number, y: number, z: number) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    if (this.books.has(key)) return;

    const book = this.createTableBook(new THREE.Vector3(Math.floor(x), Math.floor(y), Math.floor(z)));
    this.books.set(key, book);
    this.scene.add(book.group);
  }

  public unregisterTable(x: number, y: number, z: number) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    const book = this.books.get(key);
    if (book) {
      this.scene.remove(book.group);
      this.books.delete(key);
    }
  }

  private createTableBook(tablePos: THREE.Vector3): TableBook {
    const group = new THREE.Group();
    group.position.set(tablePos.x + 0.5, tablePos.y + 0.96, tablePos.z + 0.5);

    // Authentic materials
    const coverMat = new THREE.MeshLambertMaterial({ color: 0x8b1e1e }); // Rich crimson/brown leather
    const pageMat = new THREE.MeshLambertMaterial({ color: 0xfbf7ed }); // Antique parchment
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f }); // Gold corner cornerpieces
    const spineMat = new THREE.MeshLambertMaterial({ color: 0x5c1111 });
    this.bookMaterials.push(coverMat, pageMat, goldMat, spineMat);

    // Spine
    const spineGeo = new THREE.BoxGeometry(0.04, 0.04, 0.32);
    const spine = new THREE.Mesh(spineGeo, spineMat);
    group.add(spine);

    // Left Cover & Page wing (hinged at spine)
    const leftCover = new THREE.Group();
    leftCover.position.set(-0.02, 0, 0);
    const lCoverMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.32), coverMat);
    lCoverMesh.position.set(-0.1, 0, 0);
    const lPagesMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.29), pageMat);
    lPagesMesh.position.set(-0.09, 0.025, 0);
    // Gold corner inlay
    const lGold = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, 0.04), goldMat);
    lGold.position.set(-0.18, 0.005, 0.14);
    leftCover.add(lCoverMesh, lPagesMesh, lGold);
    group.add(leftCover);

    // Right Cover & Page wing (hinged at spine)
    const rightCover = new THREE.Group();
    rightCover.position.set(0.02, 0, 0);
    const rCoverMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.32), coverMat);
    rCoverMesh.position.set(0.1, 0, 0);
    const rPagesMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.29), pageMat);
    rPagesMesh.position.set(0.09, 0.025, 0);
    const rGold = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, 0.04), goldMat);
    rGold.position.set(0.18, 0.005, 0.14);
    rightCover.add(rCoverMesh, rPagesMesh, rGold);
    group.add(rightCover);

    // Dynamic fluttering middle page
    const flipGeo = new THREE.BoxGeometry(0.17, 0.008, 0.28);
    const flippingPage = new THREE.Mesh(flipGeo, pageMat);
    flippingPage.position.set(0, 0.03, 0);
    group.add(flippingPage);

    return {
      group,
      leftCover,
      rightCover,
      flippingPage,
      tablePos,
      currentYaw: Math.random() * Math.PI * 2,
      openAngle: 0,
      flipTime: Math.random() * 10,
      glyphTimer: 0
    };
  }

  public update(dt: number, playerPos: THREE.Vector3, world: World) {
    const time = performance.now() * 0.001;

    // 1. Periodic scan for nearby placed Enchanting Tables within 16 blocks
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 2.5;
      this.scanNearbyTables(playerPos, world);
    }

    // 2. Animate all active books
    for (const [key, book] of this.books.entries()) {
      // Validate table block still exists in world
      const currentBlock = world.getBlock(book.tablePos.x, book.tablePos.y, book.tablePos.z);
      if (currentBlock !== Block.ENCHANTING_TABLE) {
        this.scene.remove(book.group);
        this.books.delete(key);
        continue;
      }

      const dist = book.group.position.distanceTo(playerPos);
      const isPlayerNear = dist < 5.2;

      // Gentle vertical sine bobbing
      book.group.position.y = book.tablePos.y + 0.96 + Math.sin(time * 2.2 + book.tablePos.x) * 0.035;

      if (isPlayerNear) {
        // Smoothly open covers to ~42 degrees
        book.openAngle = THREE.MathUtils.lerp(book.openAngle, 0.72, dt * 5.0);

        // Turn to look towards player
        const dx = playerPos.x - book.group.position.x;
        const dz = playerPos.z - book.group.position.z;
        const targetYaw = Math.atan2(dx, dz) + Math.PI / 2;
        book.currentYaw = THREE.MathUtils.lerp(book.currentYaw, targetYaw, dt * 4.0);

        // Flutter flipping page
        book.flipTime += dt * 3.8;
        book.flippingPage.rotation.z = Math.sin(book.flipTime) * 0.45;

        // Emit magical glyphs from table to book
        book.glyphTimer += dt;
        if (book.glyphTimer >= 0.45) {
          book.glyphTimer = 0;
          this.spawnSingleGlyph(book.tablePos);
        }
      } else {
        // Close book smoothly
        book.openAngle = THREE.MathUtils.lerp(book.openAngle, 0.0, dt * 3.0);
        // Gentle peaceful idle yaw spin
        book.currentYaw += dt * 0.45;
        book.flippingPage.rotation.z = 0;
      }

      book.group.rotation.y = book.currentYaw;
      book.leftCover.rotation.z = book.openAngle;
      book.rightCover.rotation.z = -book.openAngle;
    }
  }

  private scanNearbyTables(playerPos: THREE.Vector3, world: World) {
    const px = Math.floor(playerPos.x);
    const py = Math.floor(playerPos.y);
    const pz = Math.floor(playerPos.z);
    const radius = 5;

    for (let x = px - radius; x <= px + radius; x += 2) {
      for (let z = pz - radius; z <= pz + radius; z += 2) {
        for (let y = Math.max(1, py - 2); y <= Math.min(60, py + 2); y++) {
          if (world.getBlock(x, y, z) === Block.ENCHANTING_TABLE) {
            this.registerTable(x, y, z);
          }
        }
      }
    }
  }

  private spawnSingleGlyph(pos: THREE.Vector3) {
    const colors = [0x9b59b6, 0x3498db, 0x1abc9c, 0xe74c3c, 0xf1c40f];
    const col = colors[Math.floor(Math.random() * colors.length)];
    const pGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    const pMat = new THREE.MeshBasicMaterial({ color: col });
    const pMesh = new THREE.Mesh(pGeo, pMat);

    const angle = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * 0.4;
    pMesh.position.set(
      pos.x + 0.5 + Math.sin(angle) * r,
      pos.y + 0.3 + Math.random() * 0.4,
      pos.z + 0.5 + Math.cos(angle) * r
    );

    this.particleGroup.add(pMesh);

    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed > 0.85) {
        this.particleGroup.remove(pMesh);
        pGeo.dispose();
        pMat.dispose();
        return;
      }
      pMesh.position.y += 0.018;
      pMesh.position.x += (pos.x + 0.5 - pMesh.position.x) * 0.04;
      pMesh.position.z += (pos.z + 0.5 - pMesh.position.z) * 0.04;
      pMesh.rotation.x += 0.08;
      pMesh.rotation.y += 0.08;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  // --- ENCHANTING LOGIC & OPTIONS ---

  // Get available enchantment tiers for the held item
  public getOptionsForHeldItem(): EnchantmentOption[] | null {
    const held = this.inventory.getSelectedItem();
    if (!held) return null;

    const def = ITEM_DEFS[held.id];
    if (!def) return null;

    if (def.toolType === 'sword') {
      return [
        { name: 'Sharpness I', levelCost: 1, description: '+1.5 Attack Damage' },
        { name: 'Sharpness II', levelCost: 2, description: '+3.0 Attack Damage & Knockback' },
        { name: 'Fire Aspect I', levelCost: 3, description: '+4.5 Damage & Fiery Strike' }
      ];
    }

    if (def.toolType === 'pickaxe' || def.toolType === 'axe' || def.toolType === 'shovel') {
      return [
        { name: 'Efficiency I', levelCost: 1, description: '+25% Mining Speed' },
        { name: 'Unbreaking I', levelCost: 2, description: '+50% Durability' },
        { name: 'Efficiency III', levelCost: 3, description: '+80% Mining Speed & Fortune' }
      ];
    }

    if (held.id === ItemId.BOW) {
      return [
        { name: 'Power I', levelCost: 1, description: '+25% Arrow Velocity & Damage' },
        { name: 'Punch I', levelCost: 2, description: '+50% Arrow Knockback' },
        { name: 'Power III', levelCost: 3, description: '+75% Critical Arrow Damage' }
      ];
    }

    if (def.armorSlot) {
      return [
        { name: 'Protection I', levelCost: 1, description: '+1 Armor Defense Point' },
        { name: 'Unbreaking I', levelCost: 2, description: '+50% Armor Durability' },
        { name: 'Protection III', levelCost: 3, description: '+3 Armor Defense Points' }
      ];
    }

    return null;
  }

  // Attempt to apply enchantment tier
  public applyEnchantment(tierIndex: number = 0, tablePos?: THREE.Vector3): boolean {
    const options = this.getOptionsForHeldItem();
    if (!options) {
      this.player.showToast('Hold a Tool, Weapon, or Armor to Enchant!');
      return false;
    }

    const tier = options[Math.min(tierIndex, options.length - 1)];
    if (this.player.gameMode === 'survival' && this.player.level < tier.levelCost) {
      this.player.showToast(`Requires Level ${tier.levelCost} XP! (You have Level ${this.player.level})`);
      this.sounds.playClick();
      return false;
    }

    // Deduct level in survival
    if (this.player.gameMode === 'survival') {
      this.player.level -= tier.levelCost;
    }

    const held = this.inventory.getSelectedItem()!;
    (held as any).enchanted = true;
    (held as any).enchantment = tier.name;

    // Apply stat enhancements
    const def = ITEM_DEFS[held.id];
    if (def?.toolType === 'sword') {
      def.toolTier = Math.min(5, (def.toolTier || 1) + 1);
    } else if (def?.toolType) {
      def.miningSpeedMultiplier = (def.miningSpeedMultiplier || 2) * 1.5;
    } else if (def?.armorSlot) {
      def.defensePoints = Math.min(10, (def.defensePoints || 1) + 2);
    }

    this.sounds.playLevelUp();
    this.player.showToast(`Enchanted with ${tier.name}! (${tier.description})`);

    // Spawn arcane magic particles
    if (tablePos) {
      this.spawnEnchantingParticles(tablePos);
    }

    return true;
  }

  // Arcane glowing glyph particles floating around enchanting table on enchant
  public spawnEnchantingParticles(pos: THREE.Vector3) {
    const colors = [0x9b59b6, 0x3498db, 0x1abc9c, 0xe74c3c, 0xf1c40f];
    for (let i = 0; i < 24; i++) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const pGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
      const pMat = new THREE.MeshBasicMaterial({ color: col });
      const pMesh = new THREE.Mesh(pGeo, pMat);

      pMesh.position.set(
        pos.x + 0.5 + (Math.random() - 0.5) * 1.2,
        pos.y + 0.8 + Math.random() * 0.5,
        pos.z + 0.5 + (Math.random() - 0.5) * 1.2
      );

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        1.0 + Math.random() * 1.5,
        (Math.random() - 0.5) * 1.5
      );

      this.particleGroup.add(pMesh);

      const startTime = performance.now();
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 0.8) {
          this.particleGroup.remove(pMesh);
          pGeo.dispose();
          pMat.dispose();
          return;
        }
        pMesh.position.addScaledVector(vel, 0.016);
        pMesh.rotation.x += 0.1;
        pMesh.rotation.y += 0.1;
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }

  public dispose() {
    for (const book of this.books.values()) {
      this.scene.remove(book.group);
    }
    this.books.clear();
    for (const mat of this.bookMaterials) {
      mat.dispose();
    }
    this.bookMaterials = [];
    this.scene.remove(this.particleGroup);
  }
}
