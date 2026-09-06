import { Player } from '../player/Player';
import { Inventory, ItemStack } from '../gameplay/Inventory';
import { CraftingManager } from '../gameplay/Crafting';
import { TextureAtlas } from '../textures/TextureAtlas';
import { getItemName, ITEM_DEFS, Block, ItemId } from '../world/BlockTypes';
import { AdvancementManager } from '../gameplay/Advancements';

export class InventoryGUI {
  public player: Player;
  public inventory: Inventory;
  public crafting: CraftingManager;
  public atlas: TextureAtlas;
  public advancements?: AdvancementManager;

  public isOpen: boolean = false;
  public isTableMode: boolean = false; // true if 3x3, false if 2x2 player inventory

  private screenModal: HTMLElement;
  private inventoryWindow: HTMLElement;
  private draggedItemEl: HTMLElement;

  private craftGrid2x2El: HTMLElement;
  private craftOutput2x2El: HTMLElement;
  private craftGrid3x3El: HTMLElement;
  private craftOutput3x3El: HTMLElement;

  private section2x2: HTMLElement;
  private section3x3: HTMLElement;

  private mainInventorySlotsEl: HTMLElement;
  private hotbarInventorySlotsEl: HTMLElement;

  // Internal state for crafting grid slots
  private craftGrid2x2: (ItemStack | null)[] = new Array(4).fill(null);
  private craftGrid3x3: (ItemStack | null)[] = new Array(9).fill(null);
  private craftOutput: ItemStack | null = null;

  // Floating held item by mouse
  public draggedStack: ItemStack | null = null;

  constructor(player: Player, inventory: Inventory, crafting: CraftingManager, atlas: TextureAtlas) {
    this.player = player;
    this.inventory = inventory;
    this.crafting = crafting;
    this.atlas = atlas;

    this.screenModal = document.getElementById('inventory-screen')!;
    this.inventoryWindow = document.getElementById('inventory-window')!;
    this.draggedItemEl = document.getElementById('dragged-item')!;

    this.section2x2 = document.getElementById('crafting-2x2-section')!;
    this.section3x3 = document.getElementById('crafting-3x3-section')!;

    this.craftGrid2x2El = document.getElementById('craft-grid-2x2')!;
    this.craftOutput2x2El = document.getElementById('craft-output-2x2')!;
    this.craftGrid3x3El = document.getElementById('craft-grid-3x3')!;
    this.craftOutput3x3El = document.getElementById('craft-output-3x3')!;

    this.mainInventorySlotsEl = document.getElementById('main-inventory-slots')!;
    this.hotbarInventorySlotsEl = document.getElementById('hotbar-inventory-slots')!;

    this.initElements();
    this.initMouseFollower();
  }

  private initElements() {
    // Close button
    document.getElementById('inventory-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // Generate 27 main inventory slot elements
    this.mainInventorySlotsEl.innerHTML = '';
    for (let i = 9; i < 36; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.slotIndex = i.toString();
      slot.addEventListener('mousedown', (e) => this.handleSlotMouseDown(i, e));
      this.mainInventorySlotsEl.appendChild(slot);
    }

    // Generate 9 hotbar slot elements
    this.hotbarInventorySlotsEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.slotIndex = i.toString();
      slot.addEventListener('mousedown', (e) => this.handleSlotMouseDown(i, e));
      this.hotbarInventorySlotsEl.appendChild(slot);
    }

    // 2x2 Crafting slots
    const slots2x2 = this.craftGrid2x2El.querySelectorAll('.craft-slot');
    slots2x2.forEach((el, idx) => {
      el.addEventListener('mousedown', (e) => this.handleCraftSlotMouseDown(idx, 2, e as MouseEvent));
    });

    this.craftOutput2x2El.addEventListener('mousedown', (e) => this.handleCraftOutputMouseDown(2, e));

    // 3x3 Crafting slots
    const slots3x3 = this.craftGrid3x3El.querySelectorAll('.craft-slot');
    slots3x3.forEach((el, idx) => {
      el.addEventListener('mousedown', (e) => this.handleCraftSlotMouseDown(idx, 3, e as MouseEvent));
    });

    this.craftOutput3x3El.addEventListener('mousedown', (e) => this.handleCraftOutputMouseDown(3, e));

    // Armor slots in player view
    const armorEls = document.querySelectorAll('.armor-slot');
    armorEls.forEach((el, idx) => {
      el.addEventListener('mousedown', (e) => this.handleArmorSlotMouseDown(idx, e as MouseEvent));
    });
  }

  private initMouseFollower() {
    window.addEventListener('mousemove', (e) => {
      if (this.isOpen && this.draggedStack) {
        this.draggedItemEl.style.left = `${e.clientX}px`;
        this.draggedItemEl.style.top = `${e.clientY}px`;
      }
    });
  }

  public open(isTable: boolean = false) {
    this.isOpen = true;
    this.isTableMode = isTable;
    this.player.controls.unlockPointer();
    this.screenModal.classList.remove('hidden');

    this.advancements?.award('taking_inventory');

    if (this.isTableMode) {
      this.section2x2.classList.add('hidden');
      this.section3x3.classList.remove('hidden');
    } else {
      this.section2x2.classList.remove('hidden');
      this.section3x3.classList.add('hidden');
    }

    this.render();
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.screenModal.classList.add('hidden');

    // Return any items in crafting grid to inventory
    const activeGrid = this.isTableMode ? this.craftGrid3x3 : this.craftGrid2x2;
    for (let i = 0; i < activeGrid.length; i++) {
      const item = activeGrid[i];
      if (item) {
        this.inventory.addItem(item.id, item.count);
        activeGrid[i] = null;
      }
    }

    // Return dragged stack
    if (this.draggedStack) {
      this.inventory.addItem(this.draggedStack.id, this.draggedStack.count);
      this.draggedStack = null;
      this.updateDraggedPreview();
    }

    this.hideTooltip();
    this.player.controls.lockPointer();
  }

  public toggle(isTable: boolean = false) {
    if (this.isOpen) this.close();
    else this.open(isTable);
  }

  private handleSlotMouseDown(slotIndex: number, e: MouseEvent) {
    e.preventDefault();
    this.player.sounds.playClick();
    const currentSlot = this.inventory.getSlot(slotIndex);

    // Shift-click quick inventory move & auto-equip
    if (e.shiftKey && currentSlot) {
      if (slotIndex < 9) {
        // Hotbar -> Main inventory (9 to 35)
        for (let target = 9; target < 36; target++) {
          if (!this.inventory.getSlot(target)) {
            this.inventory.setSlot(target, currentSlot);
            this.inventory.setSlot(slotIndex, null);
            this.render();
            return;
          }
        }
      } else {
        // Main inventory -> Check if armor piece first
        const def = ITEM_DEFS[currentSlot.id];
        if (def?.armorSlot) {
          const replaced = this.inventory.equipArmor(currentSlot);
          this.inventory.setSlot(slotIndex, replaced);
          this.player.sounds.playArmorEquip();
          this.render();
          return;
        }
        // Main inventory -> Hotbar (0 to 8)
        for (let target = 0; target < 9; target++) {
          if (!this.inventory.getSlot(target)) {
            this.inventory.setSlot(target, currentSlot);
            this.inventory.setSlot(slotIndex, null);
            this.render();
            return;
          }
        }
      }
      return;
    }

    if (e.button === 0) {
      // Left click
      if (!this.draggedStack) {
        // Pick up stack
        if (currentSlot) {
          this.draggedStack = { ...currentSlot };
          this.inventory.setSlot(slotIndex, null);
        }
      } else {
        // Place stack
        if (!currentSlot) {
          this.inventory.setSlot(slotIndex, this.draggedStack);
          this.draggedStack = null;
        } else if (currentSlot.id === this.draggedStack.id) {
          const max = ITEM_DEFS[currentSlot.id]?.maxStack || 64;
          const transfer = Math.min(this.draggedStack.count, max - currentSlot.count);
          currentSlot.count += transfer;
          this.draggedStack.count -= transfer;
          if (this.draggedStack.count <= 0) {
            this.draggedStack = null;
          }
          this.inventory.setSlot(slotIndex, currentSlot);
        } else {
          // Swap
          const tmp = { ...currentSlot };
          this.inventory.setSlot(slotIndex, this.draggedStack);
          this.draggedStack = tmp;
        }
      }
    } else if (e.button === 2) {
      // Right click
      if (!this.draggedStack) {
        // Split stack in half
        if (currentSlot) {
          const half = Math.ceil(currentSlot.count / 2);
          const remainder = currentSlot.count - half;
          this.draggedStack = { id: currentSlot.id, count: half };
          this.inventory.setSlot(slotIndex, remainder > 0 ? { id: currentSlot.id, count: remainder } : null);
        }
      } else {
        // Drop 1 item into slot
        if (!currentSlot) {
          this.inventory.setSlot(slotIndex, { id: this.draggedStack.id, count: 1 });
          this.draggedStack.count--;
          if (this.draggedStack.count <= 0) this.draggedStack = null;
        } else if (currentSlot.id === this.draggedStack.id) {
          const max = ITEM_DEFS[currentSlot.id]?.maxStack || 64;
          if (currentSlot.count < max) {
            currentSlot.count++;
            this.draggedStack.count--;
            if (this.draggedStack.count <= 0) this.draggedStack = null;
            this.inventory.setSlot(slotIndex, currentSlot);
          }
        }
      }
    }

    this.render();
  }

  private handleCraftSlotMouseDown(idx: number, size: 2 | 3, e: MouseEvent) {
    e.preventDefault();
    this.player.sounds.playClick();
    const grid = size === 2 ? this.craftGrid2x2 : this.craftGrid3x3;
    const current = grid[idx];

    if (e.button === 0) {
      if (!this.draggedStack) {
        if (current) {
          this.draggedStack = { ...current };
          grid[idx] = null;
        }
      } else {
        if (!current) {
          grid[idx] = this.draggedStack;
          this.draggedStack = null;
        } else if (current.id === this.draggedStack.id) {
          const max = ITEM_DEFS[current.id]?.maxStack || 64;
          const transfer = Math.min(this.draggedStack.count, max - current.count);
          current.count += transfer;
          this.draggedStack.count -= transfer;
          if (this.draggedStack.count <= 0) this.draggedStack = null;
        } else {
          const tmp = { ...current };
          grid[idx] = this.draggedStack;
          this.draggedStack = tmp;
        }
      }
    } else if (e.button === 2) {
      // Right click place 1
      if (this.draggedStack) {
        if (!current) {
          grid[idx] = { id: this.draggedStack.id, count: 1 };
          this.draggedStack.count--;
          if (this.draggedStack.count <= 0) this.draggedStack = null;
        } else if (current.id === this.draggedStack.id) {
          const max = ITEM_DEFS[current.id]?.maxStack || 64;
          if (current.count < max) {
            current.count++;
            this.draggedStack.count--;
            if (this.draggedStack.count <= 0) this.draggedStack = null;
          }
        }
      } else if (current) {
        const half = Math.ceil(current.count / 2);
        this.draggedStack = { id: current.id, count: half };
        current.count -= half;
        if (current.count <= 0) grid[idx] = null;
      }
    }

    this.updateCraftingOutput(size);
    this.render();
  }

  private handleCraftOutputMouseDown(size: 2 | 3, e: MouseEvent) {
    if (!this.craftOutput) return;
    e.preventDefault();

    const output = this.craftOutput;
    const max = ITEM_DEFS[output.id]?.maxStack || 64;

    if (!this.draggedStack) {
      this.draggedStack = { ...output };
      const grid = size === 2 ? this.craftGrid2x2 : this.craftGrid3x3;
      this.crafting.consume(grid);
      this.player.sounds.playPop();
    } else if (this.draggedStack.id === output.id && this.draggedStack.count + output.count <= max) {
      this.draggedStack.count += output.count;
      const grid = size === 2 ? this.craftGrid2x2 : this.craftGrid3x3;
      this.crafting.consume(grid);
      this.player.sounds.playPop();
    }

    // Advancements triggers on crafting
    if (output.id === Block.CRAFTING_TABLE) {
      this.advancements?.award('benchmarking');
    } else if (
      output.id === ItemId.WOODEN_PICKAXE ||
      output.id === ItemId.STONE_PICKAXE ||
      output.id === ItemId.IRON_PICKAXE ||
      output.id === ItemId.DIAMOND_PICKAXE
    ) {
      this.advancements?.award('time_to_mine');
    } else if (
      output.id === ItemId.WOODEN_SWORD ||
      output.id === ItemId.STONE_SWORD ||
      output.id === ItemId.IRON_SWORD ||
      output.id === ItemId.DIAMOND_SWORD
    ) {
      this.advancements?.award('time_to_strike');
    }

    this.updateCraftingOutput(size);
    this.render();
  }

  private handleArmorSlotMouseDown(slotIdx: number, e: MouseEvent) {
    e.preventDefault();
    const slotTypes: ('helmet' | 'chestplate' | 'leggings' | 'boots')[] = ['helmet', 'chestplate', 'leggings', 'boots'];
    const requiredType = slotTypes[slotIdx];
    const current = this.inventory.getArmorSlot(slotIdx);

    if (this.draggedStack) {
      const itemDef = ITEM_DEFS[this.draggedStack.id];
      if (itemDef?.armorSlot === requiredType) {
        // Equip dragged armor
        const toEquip = { ...this.draggedStack, count: 1 };
        if (this.draggedStack.count > 1) {
          this.draggedStack.count--;
        } else {
          this.draggedStack = current ? { ...current } : null;
        }
        this.inventory.setArmorSlot(slotIdx, toEquip);
        this.player.sounds.playArmorEquip();
      }
    } else if (current) {
      // Pick up equipped armor
      this.draggedStack = { ...current };
      this.inventory.setArmorSlot(slotIdx, null);
      this.player.sounds.playClick();
    }

    this.render();
  }

  private updateCraftingOutput(size: 2 | 3) {
    const grid = size === 2 ? this.craftGrid2x2 : this.craftGrid3x3;
    this.craftOutput = this.crafting.evaluate(grid, size);
  }

  public render() {
    // 1. Render main inventory slots (9-35)
    const mainSlotEls = this.mainInventorySlotsEl.querySelectorAll('.slot');
    mainSlotEls.forEach((el, idx) => {
      const slotIndex = idx + 9;
      this.renderSlotElement(el as HTMLElement, this.inventory.getSlot(slotIndex));
    });

    // 2. Render hotbar inventory slots (0-8)
    const hotbarSlotEls = this.hotbarInventorySlotsEl.querySelectorAll('.slot');
    hotbarSlotEls.forEach((el, idx) => {
      this.renderSlotElement(el as HTMLElement, this.inventory.getSlot(idx));
    });

    // 3. Render 2x2 or 3x3 craft grid
    if (!this.isTableMode) {
      const craftEls = this.craftGrid2x2El.querySelectorAll('.craft-slot');
      craftEls.forEach((el, idx) => {
        this.renderSlotElement(el as HTMLElement, this.craftGrid2x2[idx]);
      });
      this.renderSlotElement(this.craftOutput2x2El, this.craftOutput);
    } else {
      const craftEls = this.craftGrid3x3El.querySelectorAll('.craft-slot');
      craftEls.forEach((el, idx) => {
        this.renderSlotElement(el as HTMLElement, this.craftGrid3x3[idx]);
      });
      this.renderSlotElement(this.craftOutput3x3El, this.craftOutput);
    }

    // 4. Render armor slots (0: Helmet, 1: Chestplate, 2: Leggings, 3: Boots)
    const armorEls = document.querySelectorAll('.armor-slot');
    armorEls.forEach((el, idx) => {
      this.renderSlotElement(el as HTMLElement, this.inventory.getArmorSlot(idx));
    });

    // 5. Update dragged preview
    this.updateDraggedPreview();
  }

  private renderSlotElement(el: HTMLElement, item: ItemStack | null) {
    el.innerHTML = '';
    if (item) {
      const img = document.createElement('img');
      img.className = 'slot-icon';
      img.src = this.atlas.getItemIconDataUrl(item.id);
      img.alt = getItemName(item.id);
      el.appendChild(img);

      if (item.count > 1) {
        const countSpan = document.createElement('span');
        countSpan.className = 'slot-count';
        countSpan.textContent = item.count.toString();
        el.appendChild(countSpan);
      }

      if (item.durability !== undefined && item.maxDurability !== undefined && item.durability < item.maxDurability) {
        const durPercent = Math.max(0, Math.min(1, item.durability / item.maxDurability));
        const durBarContainer = document.createElement('div');
        durBarContainer.className = 'durability-bar-container';
        const durBarFill = document.createElement('div');
        durBarFill.className = 'durability-bar-fill';
        durBarFill.style.width = `${durPercent * 100}%`;
        if (durPercent > 0.5) durBarFill.style.backgroundColor = '#55ff55';
        else if (durPercent > 0.2) durBarFill.style.backgroundColor = '#ffff55';
        else durBarFill.style.backgroundColor = '#ff5555';
        durBarContainer.appendChild(durBarFill);
        el.appendChild(durBarContainer);
      }

      el.onmouseenter = (e) => this.showTooltip(e, item);
      el.onmousemove = (e) => this.showTooltip(e, item);
      el.onmouseleave = () => this.hideTooltip();
    } else {
      el.onmouseenter = null;
      el.onmousemove = null;
      el.onmouseleave = null;
    }
  }

  private showTooltip(e: MouseEvent, item: ItemStack) {
    const tooltipEl = document.getElementById('mc-tooltip');
    if (!tooltipEl) return;
    const titleEl = document.getElementById('tooltip-title');
    const statEl = document.getElementById('tooltip-stat');
    const enchantEl = document.getElementById('tooltip-enchant');
    const durEl = document.getElementById('tooltip-durability');

    const def = ITEM_DEFS[item.id];
    const name = getItemName(item.id);

    if (titleEl) {
      titleEl.textContent = name;
      if (item.id === ItemId.DIAMOND || name.includes('Diamond')) {
        titleEl.style.color = '#55ffff';
      } else if (item.id === ItemId.GOLD_INGOT || name.includes('Gold')) {
        titleEl.style.color = '#ffff55';
      } else if ((item as any).enchanted) {
        titleEl.style.color = '#ff55ff';
      } else {
        titleEl.style.color = '#ffffff';
      }
    }

    if (statEl) {
      if (def?.toolType === 'sword') {
        statEl.textContent = `+${def.toolTier ? def.toolTier * 2 + 1 : 4} Attack Damage`;
        statEl.style.display = 'block';
      } else if (def?.armorSlot && def.defensePoints) {
        statEl.textContent = `+${def.defensePoints} Armor Defense`;
        statEl.style.display = 'block';
      } else {
        statEl.style.display = 'none';
      }
    }

    if (enchantEl) {
      if ((item as any).enchanted && (item as any).enchantment) {
        enchantEl.textContent = (item as any).enchantment;
        enchantEl.style.display = 'block';
      } else {
        enchantEl.style.display = 'none';
      }
    }

    if (durEl) {
      if (item.durability !== undefined && item.maxDurability !== undefined) {
        durEl.textContent = `Durability: ${item.durability} / ${item.maxDurability}`;
        durEl.style.display = 'block';
      } else {
        durEl.style.display = 'none';
      }
    }

    tooltipEl.style.left = `${Math.min(window.innerWidth - 220, e.clientX + 14)}px`;
    tooltipEl.style.top = `${Math.min(window.innerHeight - 100, e.clientY + 14)}px`;
    tooltipEl.classList.remove('hidden');
  }

  private hideTooltip() {
    const tooltipEl = document.getElementById('mc-tooltip');
    tooltipEl?.classList.add('hidden');
  }

  private updateDraggedPreview() {
    if (this.draggedStack) {
      this.draggedItemEl.classList.remove('hidden');
      this.renderSlotElement(this.draggedItemEl, this.draggedStack);
    } else {
      this.draggedItemEl.classList.add('hidden');
      this.draggedItemEl.innerHTML = '';
    }
  }
}
