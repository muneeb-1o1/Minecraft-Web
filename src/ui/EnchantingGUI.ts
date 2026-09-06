import { Player } from '../player/Player';
import { Inventory, ItemStack } from '../gameplay/Inventory';
import { TextureAtlas } from '../textures/TextureAtlas';
import { getItemName, ITEM_DEFS } from '../world/BlockTypes';
import { EnchantingManager, EnchantmentOption } from '../gameplay/EnchantingManager';

export class EnchantingGUI {
  public player: Player;
  public inventory: Inventory;
  public atlas: TextureAtlas;
  public enchantingManager: EnchantingManager;

  public isOpen: boolean = false;
  private screenModal: HTMLElement;
  private itemSlotEl: HTMLElement;
  private optionsContainerEl: HTMLElement;
  private playerSlotsEl: HTMLElement;
  private hotbarSlotsEl: HTMLElement;
  private xpBadgeEl: HTMLElement;

  // The item currently placed inside the enchanting table
  public enchantedItem: ItemStack | null = null;
  public tablePos?: THREE.Vector3;

  constructor(
    player: Player,
    inventory: Inventory,
    atlas: TextureAtlas,
    enchantingManager: EnchantingManager
  ) {
    this.player = player;
    this.inventory = inventory;
    this.atlas = atlas;
    this.enchantingManager = enchantingManager;

    this.screenModal = document.getElementById('enchanting-screen')!;
    this.itemSlotEl = document.getElementById('enchant-item-slot')!;
    this.optionsContainerEl = document.getElementById('enchant-options-list')!;
    this.playerSlotsEl = document.getElementById('enchant-player-slots')!;
    this.hotbarSlotsEl = document.getElementById('enchant-hotbar-slots')!;
    this.xpBadgeEl = document.getElementById('enchant-xp-badge')!;

    this.initElements();
  }

  private initElements() {
    // Close button
    document.getElementById('enchanting-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // Item slot click
    this.itemSlotEl?.addEventListener('click', () => {
      this.handleItemSlotClick();
    });

    // Generate 27 main inventory slot elements
    if (this.playerSlotsEl) {
      this.playerSlotsEl.innerHTML = '';
      for (let i = 9; i < 36; i++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.slotIndex = i.toString();
        slot.addEventListener('click', () => this.handlePlayerSlotClick(i));
        this.playerSlotsEl.appendChild(slot);
      }
    }

    // Generate 9 hotbar slot elements
    if (this.hotbarSlotsEl) {
      this.hotbarSlotsEl.innerHTML = '';
      for (let i = 0; i < 9; i++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.slotIndex = i.toString();
        slot.addEventListener('click', () => this.handlePlayerSlotClick(i));
        this.hotbarSlotsEl.appendChild(slot);
      }
    }
  }

  public open(pos?: THREE.Vector3) {
    this.isOpen = true;
    this.tablePos = pos;
    this.screenModal.classList.remove('hidden');
    this.player.controls.unlockPointer();

    // If holding an enchantable item, automatically insert it
    const held = this.inventory.getSelectedItem();
    if (held && this.isEnchantable(held.id) && !this.enchantedItem) {
      this.enchantedItem = { ...held };
      this.inventory.setSlot(this.inventory.getSelectedSlot(), null);
    }

    this.render();
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.screenModal.classList.add('hidden');

    // Return enchanted item if still in slot
    if (this.enchantedItem) {
      this.inventory.addItem(this.enchantedItem.id, this.enchantedItem.count);
      this.enchantedItem = null;
    }

    this.player.controls.lockPointer();
  }

  public isEnchantable(itemId: number): boolean {
    const def = ITEM_DEFS[itemId];
    if (!def) return false;
    return !!(def.toolType || def.armorSlot || itemId === 135); // 135 = BOW
  }

  private handlePlayerSlotClick(slotIndex: number) {
    const slot = this.inventory.getSlot(slotIndex);
    if (!slot) return;

    if (!this.enchantedItem && this.isEnchantable(slot.id)) {
      // Move into enchanting slot
      this.enchantedItem = { ...slot };
      this.inventory.setSlot(slotIndex, null);
      this.player.sounds.playClick();
      this.render();
    } else if (this.enchantedItem) {
      // Swap items
      if (this.isEnchantable(slot.id)) {
        const temp = this.enchantedItem;
        this.enchantedItem = { ...slot };
        this.inventory.setSlot(slotIndex, temp);
        this.player.sounds.playClick();
        this.render();
      }
    }
  }

  private handleItemSlotClick() {
    if (this.enchantedItem) {
      const added = this.inventory.addItem(this.enchantedItem.id, this.enchantedItem.count);
      if (added) {
        this.enchantedItem = null;
        this.player.sounds.playClick();
        this.render();
      }
    }
  }

  public getOptionsForItem(item: ItemStack | null): EnchantmentOption[] | null {
    if (!item) return null;
    const def = ITEM_DEFS[item.id];
    if (!def) return null;

    if (def.toolType === 'sword') {
      return [
        { name: 'Sharpness I', levelCost: 1, description: '+1.5 Attack Damage' },
        { name: 'Sharpness II', levelCost: 2, description: '+3.0 Attack Damage & Knockback' },
        { name: 'Fire Aspect I', levelCost: 3, description: '+4.5 Fiery Strike & Burn' }
      ];
    }

    if (def.toolType === 'pickaxe' || def.toolType === 'axe' || def.toolType === 'shovel') {
      return [
        { name: 'Efficiency I', levelCost: 1, description: '+25% Mining Speed' },
        { name: 'Unbreaking I', levelCost: 2, description: '+50% Durability' },
        { name: 'Efficiency III', levelCost: 3, description: '+80% Mining Speed & Fortune' }
      ];
    }

    if (item.id === 135) { // Bow
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

  public selectEnchantment(tierIndex: number) {
    if (!this.enchantedItem) return;
    const options = this.getOptionsForItem(this.enchantedItem);
    if (!options) return;

    const opt = options[tierIndex];
    if (this.player.gameMode === 'survival' && this.player.level < opt.levelCost) {
      this.player.showToast(`Requires Level ${opt.levelCost} XP!`);
      this.player.sounds.playClick();
      return;
    }

    // Deduct level in survival
    if (this.player.gameMode === 'survival') {
      this.player.level -= opt.levelCost;
    }

    (this.enchantedItem as any).enchanted = true;
    (this.enchantedItem as any).enchantment = opt.name;

    // Apply stat enhancements
    const def = ITEM_DEFS[this.enchantedItem.id];
    if (def?.toolType === 'sword') {
      def.toolTier = Math.min(5, (def.toolTier || 1) + 1);
    } else if (def?.toolType) {
      def.miningSpeedMultiplier = (def.miningSpeedMultiplier || 2) * 1.5;
    } else if (def?.armorSlot) {
      def.defensePoints = Math.min(10, (def.defensePoints || 1) + 2);
    }

    this.player.sounds.playLevelUp();
    this.player.showToast(`Enchanted with ${opt.name}! (${opt.description})`);

    if (this.tablePos) {
      this.enchantingManager.spawnEnchantingParticles(this.tablePos);
    }

    this.render();
  }

  public render() {
    if (!this.isOpen) return;

    // Update XP level badge
    if (this.xpBadgeEl) {
      this.xpBadgeEl.textContent = `Your Level: ${this.player.level}`;
    }

    // Render enchanted item slot
    if (this.itemSlotEl) {
      this.itemSlotEl.innerHTML = '';
      if (this.enchantedItem) {
        const img = document.createElement('img');
        img.className = 'slot-icon';
        img.src = this.atlas.getItemIconDataUrl(this.enchantedItem.id);
        img.alt = getItemName(this.enchantedItem.id);
        this.itemSlotEl.appendChild(img);

        if ((this.enchantedItem as any).enchanted) {
          this.itemSlotEl.classList.add('enchanted-glow');
        } else {
          this.itemSlotEl.classList.remove('enchanted-glow');
        }
      } else {
        this.itemSlotEl.classList.remove('enchanted-glow');
      }
    }

    // Render 3 Enchantment Rows
    if (this.optionsContainerEl) {
      this.optionsContainerEl.innerHTML = '';
      const options = this.getOptionsForItem(this.enchantedItem);

      if (options && !(this.enchantedItem as any)?.enchanted) {
        const runes = [
          'ᔑ ʖ ᓵ ↸ ᒷ ⎓ ⊣',
          'ꖌ 󠁬 ᒲ  𝙹 ᑑ ∷',
          '⚍ ⍊ ᑑ ̇/ || ⨅ ᔑ'
        ];

        options.forEach((opt, idx) => {
          const row = document.createElement('div');
          row.className = 'enchant-row';
          const canAfford = this.player.gameMode === 'creative' || this.player.level >= opt.levelCost;
          if (!canAfford) row.classList.add('disabled');

          const costBadge = document.createElement('div');
          costBadge.className = 'enchant-cost';
          costBadge.textContent = opt.levelCost.toString();

          const infoBox = document.createElement('div');
          infoBox.className = 'enchant-info';

          const runeSpan = document.createElement('div');
          runeSpan.className = 'enchant-runes';
          runeSpan.textContent = runes[idx % runes.length];

          const nameSpan = document.createElement('div');
          nameSpan.className = 'enchant-name';
          nameSpan.textContent = `${opt.name} - ${opt.description}`;

          infoBox.appendChild(runeSpan);
          infoBox.appendChild(nameSpan);

          row.appendChild(costBadge);
          row.appendChild(infoBox);

          row.addEventListener('click', () => {
            if (canAfford) {
              this.selectEnchantment(idx);
            }
          });

          this.optionsContainerEl.appendChild(row);
        });
      } else if ((this.enchantedItem as any)?.enchanted) {
        const msg = document.createElement('div');
        msg.className = 'enchant-empty-msg enchanted-text';
        msg.textContent = `Item is already enchanted with ${(this.enchantedItem as any).enchantment}!`;
        this.optionsContainerEl.appendChild(msg);
      } else {
        const msg = document.createElement('div');
        msg.className = 'enchant-empty-msg';
        msg.textContent = 'Place a Tool, Weapon, or Armor to Enchant';
        this.optionsContainerEl.appendChild(msg);
      }
    }

    // Render player inventory slots
    const renderSlots = (container: HTMLElement | null, start: number, end: number) => {
      if (!container) return;
      for (let i = start; i < end; i++) {
        const slotEl = container.children[i - start] as HTMLElement;
        if (!slotEl) continue;
        slotEl.innerHTML = '';
        const stack = this.inventory.getSlot(i);
        if (stack) {
          const img = document.createElement('img');
          img.className = 'slot-icon';
          img.src = this.atlas.getItemIconDataUrl(stack.id);
          img.alt = getItemName(stack.id);
          slotEl.appendChild(img);

          if (stack.count > 1) {
            const countSpan = document.createElement('span');
            countSpan.className = 'slot-count';
            countSpan.textContent = stack.count.toString();
            slotEl.appendChild(countSpan);
          }
        }
      }
    };

    renderSlots(this.playerSlotsEl, 9, 36);
    renderSlots(this.hotbarSlotsEl, 0, 9);
  }
}
