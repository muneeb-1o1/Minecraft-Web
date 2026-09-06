import { Player } from '../player/Player';
import { Inventory, ItemStack } from '../gameplay/Inventory';
import { FurnaceManager, FurnaceData, FUEL_DURATIONS } from '../gameplay/FurnaceManager';
import { TextureAtlas } from '../textures/TextureAtlas';
import { getItemName, ITEM_DEFS, ItemId } from '../world/BlockTypes';
import { SoundManager } from '../audio/SoundManager';
import { AdvancementManager } from '../gameplay/Advancements';

export class FurnaceGUI {
  public player: Player;
  public inventory: Inventory;
  public furnaceManager: FurnaceManager;
  public atlas: TextureAtlas;
  public sounds: SoundManager;
  public advancements?: AdvancementManager;

  public isOpen: boolean = false;
  public activePos: { x: number; y: number; z: number } | null = null;

  private screenModal: HTMLElement;
  private inputSlotEl: HTMLElement;
  private fuelSlotEl: HTMLElement;
  private outputSlotEl: HTMLElement;
  private flameIconEl: HTMLElement;
  private cookProgressFillEl: HTMLElement;
  private playerSlotsEl: HTMLElement;
  private hotbarSlotsEl: HTMLElement;

  // Floating mouse dragged item stack
  public draggedStack: ItemStack | null = null;
  private draggedItemEl: HTMLElement;

  constructor(
    player: Player,
    inventory: Inventory,
    furnaceManager: FurnaceManager,
    atlas: TextureAtlas,
    sounds: SoundManager
  ) {
    this.player = player;
    this.inventory = inventory;
    this.furnaceManager = furnaceManager;
    this.atlas = atlas;
    this.sounds = sounds;

    this.screenModal = document.getElementById('furnace-screen')!;
    this.inputSlotEl = document.getElementById('furnace-input-slot')!;
    this.fuelSlotEl = document.getElementById('furnace-fuel-slot')!;
    this.outputSlotEl = document.getElementById('furnace-output-slot')!;
    this.flameIconEl = document.getElementById('furnace-flame-icon')!;
    this.cookProgressFillEl = document.getElementById('furnace-cook-progress')!;
    this.playerSlotsEl = document.getElementById('furnace-player-slots')!;
    this.hotbarSlotsEl = document.getElementById('furnace-hotbar-slots')!;
    this.draggedItemEl = document.getElementById('dragged-item')!;

    this.initElements();
  }

  private initElements() {
    document.getElementById('furnace-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // Input slot
    this.inputSlotEl.addEventListener('mousedown', (e) => this.handleSlotMouseDown('input', e));
    // Fuel slot
    this.fuelSlotEl.addEventListener('mousedown', (e) => this.handleSlotMouseDown('fuel', e));
    // Output slot (take only)
    this.outputSlotEl.addEventListener('mousedown', (e) => this.handleOutputSlotClick(e));

    // Generate player slots in furnace window
    this.playerSlotsEl.innerHTML = '';
    for (let i = 9; i < 36; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.slotIndex = i.toString();
      slot.addEventListener('mousedown', (e) => this.handlePlayerSlotClick(i, e));
      this.playerSlotsEl.appendChild(slot);
    }

    this.hotbarSlotsEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.slotIndex = i.toString();
      slot.addEventListener('mousedown', (e) => this.handlePlayerSlotClick(i, e));
      this.hotbarSlotsEl.appendChild(slot);
    }
  }

  public open(pos: { x: number; y: number; z: number }) {
    this.activePos = pos;
    this.isOpen = true;
    this.screenModal.classList.remove('hidden');
    document.exitPointerLock?.();
    this.advancements?.award('hot_topic');
    this.render();
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.screenModal.classList.add('hidden');
    this.activePos = null;

    // Return any dragged item to inventory
    if (this.draggedStack) {
      this.inventory.addItem(this.draggedStack.id, this.draggedStack.count);
      this.draggedStack = null;
      this.updateDraggedPreview();
    }
  }

  private getActiveFurnace(): FurnaceData | null {
    if (!this.activePos) return null;
    return this.furnaceManager.getFurnace(this.activePos.x, this.activePos.y, this.activePos.z);
  }

  private handleSlotMouseDown(slotType: 'input' | 'fuel', e: MouseEvent) {
    const furnace = this.getActiveFurnace();
    if (!furnace) return;

    const current = slotType === 'input' ? furnace.input : furnace.fuel;
    this.sounds.playClick();

    if (e.button === 0) {
      // Left click
      if (!this.draggedStack) {
        if (current) {
          this.draggedStack = current;
          if (slotType === 'input') furnace.input = null;
          else furnace.fuel = null;
        }
      } else {
        if (!current) {
          if (slotType === 'input') {
            furnace.input = this.draggedStack;
            this.draggedStack = null;
          } else {
            // Check fuel validity
            if (FUEL_DURATIONS[this.draggedStack.id]) {
              furnace.fuel = this.draggedStack;
              this.draggedStack = null;
            }
          }
        } else if (current.id === this.draggedStack.id) {
          const max = ITEM_DEFS[current.id]?.maxStack || 64;
          const transfer = Math.min(this.draggedStack.count, max - current.count);
          current.count += transfer;
          this.draggedStack.count -= transfer;
          if (this.draggedStack.count <= 0) this.draggedStack = null;
        } else {
          // Swap
          if (slotType === 'fuel' && !FUEL_DURATIONS[this.draggedStack.id]) {
            // Cannot put non-fuel in fuel slot
          } else {
            const temp = current;
            if (slotType === 'input') furnace.input = this.draggedStack;
            else furnace.fuel = this.draggedStack;
            this.draggedStack = temp;
          }
        }
      }
    } else if (e.button === 2) {
      // Right click: place one
      if (this.draggedStack) {
        if (!current) {
          if (slotType === 'input' || FUEL_DURATIONS[this.draggedStack.id]) {
            const one = { ...this.draggedStack, count: 1 };
            this.draggedStack.count--;
            if (this.draggedStack.count <= 0) this.draggedStack = null;
            if (slotType === 'input') furnace.input = one;
            else furnace.fuel = one;
          }
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
        if (current.count <= 0) {
          if (slotType === 'input') furnace.input = null;
          else furnace.fuel = null;
        }
      }
    }

    this.render();
  }

  private handleOutputSlotClick(e: MouseEvent) {
    const furnace = this.getActiveFurnace();
    if (!furnace || !furnace.output) return;

    this.sounds.playClick();
    if (!this.draggedStack) {
      this.draggedStack = furnace.output;
      furnace.output = null;
      this.player.addXp(1);
    } else if (this.draggedStack.id === furnace.output.id) {
      const max = ITEM_DEFS[this.draggedStack.id]?.maxStack || 64;
      const transfer = Math.min(furnace.output.count, max - this.draggedStack.count);
      this.draggedStack.count += transfer;
      furnace.output.count -= transfer;
      if (furnace.output.count <= 0) furnace.output = null;
      this.player.addXp(1);
    }

    if (this.draggedStack?.id === ItemId.IRON_INGOT) {
      this.advancements?.award('acquire_hardware');
    }

    this.render();
  }

  private handlePlayerSlotClick(slotIndex: number, e: MouseEvent) {
    const current = this.inventory.getSlot(slotIndex);
    this.sounds.playClick();

    if (e.button === 0) {
      // Left click
      if (!this.draggedStack) {
        if (current) {
          this.draggedStack = current;
          this.inventory.setSlot(slotIndex, null);
        }
      } else {
        if (!current) {
          this.inventory.setSlot(slotIndex, this.draggedStack);
          this.draggedStack = null;
        } else if (current.id === this.draggedStack.id) {
          const max = ITEM_DEFS[current.id]?.maxStack || 64;
          const transfer = Math.min(this.draggedStack.count, max - current.count);
          current.count += transfer;
          this.draggedStack.count -= transfer;
          if (this.draggedStack.count <= 0) this.draggedStack = null;
        } else {
          const tmp = { ...current };
          this.inventory.setSlot(slotIndex, this.draggedStack);
          this.draggedStack = tmp;
        }
      }
    } else if (e.button === 2) {
      // Right click
      if (this.draggedStack) {
        if (!current) {
          this.inventory.setSlot(slotIndex, { id: this.draggedStack.id, count: 1 });
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
        if (current.count <= 0) this.inventory.setSlot(slotIndex, null);
      }
    }

    this.render();
  }

  public render() {
    if (!this.isOpen) return;
    const furnace = this.getActiveFurnace();
    if (!furnace) return;

    // 1. Furnace slots
    this.renderSlotElement(this.inputSlotEl, furnace.input);
    this.renderSlotElement(this.fuelSlotEl, furnace.fuel);
    this.renderSlotElement(this.outputSlotEl, furnace.output);

    // 2. Burning fire indicator
    const isBurning = furnace.fuelTimeLeft > 0;
    this.flameIconEl.style.opacity = isBurning ? '1' : '0.2';
    this.flameIconEl.style.transform = isBurning ? 'scale(1.15)' : 'scale(1)';

    // 3. Cook progress arrow
    const cookPercent = Math.min(100, (furnace.cookProgress / 10) * 100);
    this.cookProgressFillEl.style.width = `${cookPercent}%`;

    // 4. Player slots
    const mainSlotEls = this.playerSlotsEl.querySelectorAll('.slot');
    mainSlotEls.forEach((el, idx) => {
      this.renderSlotElement(el as HTMLElement, this.inventory.getSlot(idx + 9));
    });

    const hotbarSlotEls = this.hotbarSlotsEl.querySelectorAll('.slot');
    hotbarSlotEls.forEach((el, idx) => {
      this.renderSlotElement(el as HTMLElement, this.inventory.getSlot(idx));
    });

    // 5. Dragged item
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
    }
  }

  private updateDraggedPreview() {
    if (this.draggedStack) {
      this.draggedItemEl.classList.remove('hidden');
      this.draggedItemEl.innerHTML = '';

      const img = document.createElement('img');
      img.className = 'slot-icon';
      img.src = this.atlas.getItemIconDataUrl(this.draggedStack.id);
      this.draggedItemEl.appendChild(img);

      if (this.draggedStack.count > 1) {
        const count = document.createElement('span');
        count.className = 'slot-count';
        count.textContent = this.draggedStack.count.toString();
        this.draggedItemEl.appendChild(count);
      }
    } else {
      this.draggedItemEl.classList.add('hidden');
    }
  }
}
