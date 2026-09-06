import { Player } from '../player/Player';
import { Inventory, ItemStack } from '../gameplay/Inventory';
import { ChestManager } from '../gameplay/ChestManager';
import { TextureAtlas } from '../textures/TextureAtlas';
import { getItemName, ITEM_DEFS } from '../world/BlockTypes';
import { SoundManager } from '../audio/SoundManager';

export class ChestGUI {
  public player: Player;
  public inventory: Inventory;
  public chestManager: ChestManager;
  public atlas: TextureAtlas;
  public sounds: SoundManager;

  public isOpen: boolean = false;
  public activePos: { x: number; y: number; z: number } | null = null;

  private screenModal: HTMLElement;
  private chestSlotsEl: HTMLElement;
  private playerSlotsEl: HTMLElement;
  private hotbarSlotsEl: HTMLElement;

  public draggedStack: ItemStack | null = null;
  private draggedItemEl: HTMLElement;

  constructor(
    player: Player,
    inventory: Inventory,
    chestManager: ChestManager,
    atlas: TextureAtlas,
    sounds: SoundManager
  ) {
    this.player = player;
    this.inventory = inventory;
    this.chestManager = chestManager;
    this.atlas = atlas;
    this.sounds = sounds;

    this.screenModal = document.getElementById('chest-screen')!;
    this.chestSlotsEl = document.getElementById('chest-storage-slots')!;
    this.playerSlotsEl = document.getElementById('chest-player-slots')!;
    this.hotbarSlotsEl = document.getElementById('chest-hotbar-slots')!;
    this.draggedItemEl = document.getElementById('dragged-item')!;

    this.initElements();
  }

  private initElements() {
    document.getElementById('chest-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // 27 chest slots
    this.chestSlotsEl.innerHTML = '';
    for (let i = 0; i < 27; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.slotIndex = i.toString();
      slot.addEventListener('mousedown', (e) => this.handleChestSlotClick(i, e));
      this.chestSlotsEl.appendChild(slot);
    }

    // 27 player main inventory slots
    this.playerSlotsEl.innerHTML = '';
    for (let i = 9; i < 36; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.slotIndex = i.toString();
      slot.addEventListener('mousedown', (e) => this.handlePlayerSlotClick(i, e));
      this.playerSlotsEl.appendChild(slot);
    }

    // 9 hotbar slots
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
    this.render();
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.screenModal.classList.add('hidden');
    this.activePos = null;

    if (this.draggedStack) {
      this.inventory.addItem(this.draggedStack.id, this.draggedStack.count);
      this.draggedStack = null;
      this.updateDraggedPreview();
    }
  }

  private getActiveChest(): (ItemStack | null)[] | null {
    if (!this.activePos) return null;
    return this.chestManager.getChest(this.activePos.x, this.activePos.y, this.activePos.z);
  }

  private handleChestSlotClick(slotIndex: number, e: MouseEvent) {
    const chest = this.getActiveChest();
    if (!chest) return;

    this.sounds.playClick();
    const current = chest[slotIndex];

    if (e.button === 0) {
      // Left click
      if (!this.draggedStack) {
        if (current) {
          this.draggedStack = current;
          chest[slotIndex] = null;
        }
      } else {
        if (!current) {
          chest[slotIndex] = this.draggedStack;
          this.draggedStack = null;
        } else if (current.id === this.draggedStack.id) {
          const max = ITEM_DEFS[current.id]?.maxStack || 64;
          const transfer = Math.min(this.draggedStack.count, max - current.count);
          current.count += transfer;
          this.draggedStack.count -= transfer;
          if (this.draggedStack.count <= 0) this.draggedStack = null;
        } else {
          const tmp = { ...current };
          chest[slotIndex] = this.draggedStack;
          this.draggedStack = tmp;
        }
      }
    } else if (e.button === 2) {
      // Right click place 1 / split
      if (this.draggedStack) {
        if (!current) {
          chest[slotIndex] = { id: this.draggedStack.id, count: 1 };
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
        if (current.count <= 0) chest[slotIndex] = null;
      }
    }

    this.render();
  }

  private handlePlayerSlotClick(slotIndex: number, e: MouseEvent) {
    const current = this.inventory.getSlot(slotIndex);
    this.sounds.playClick();

    if (e.button === 0) {
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
    const chest = this.getActiveChest();
    if (!chest) return;

    // 1. Render chest slots
    const chestSlotEls = this.chestSlotsEl.querySelectorAll('.slot');
    chestSlotEls.forEach((el, idx) => {
      this.renderSlotElement(el as HTMLElement, chest[idx]);
    });

    // 2. Render player main inventory
    const playerSlotEls = this.playerSlotsEl.querySelectorAll('.slot');
    playerSlotEls.forEach((el, idx) => {
      this.renderSlotElement(el as HTMLElement, this.inventory.getSlot(idx + 9));
    });

    // 3. Render player hotbar
    const hotbarSlotEls = this.hotbarSlotsEl.querySelectorAll('.slot');
    hotbarSlotEls.forEach((el, idx) => {
      this.renderSlotElement(el as HTMLElement, this.inventory.getSlot(idx));
    });

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
        const count = document.createElement('span');
        count.className = 'slot-count';
        count.textContent = item.count.toString();
        el.appendChild(count);
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
