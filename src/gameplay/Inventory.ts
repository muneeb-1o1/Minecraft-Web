import { Block, ItemId, ITEM_DEFS, BLOCK_DEFS } from '../world/BlockTypes';

export interface ItemStack {
  id: number;
  count: number;
  durability?: number;
  maxDurability?: number;
}

export class Inventory {
  public static readonly HOTBAR_SIZE = 9;
  public static readonly MAIN_SIZE = 27;
  public static readonly TOTAL_SIZE = 36;

  // Slots 0-8: Hotbar, Slots 9-35: Main Inventory
  public slots: (ItemStack | null)[] = new Array(Inventory.TOTAL_SIZE).fill(null);
  // Armor Slots: 0: Helmet, 1: Chestplate, 2: Leggings, 3: Boots
  public armorSlots: (ItemStack | null)[] = new Array(4).fill(null);
  public selectedHotbarIndex: number = 0;

  // Callback when inventory state changes
  public onChange?: () => void;

  constructor() {
    this.initDefaultStartingItems();
  }

  // Starter survival items: wooden pickaxe, oak planks, torches, apple
  public initDefaultStartingItems() {
    const pickDef = ITEM_DEFS[ItemId.WOODEN_PICKAXE];
    this.slots[0] = {
      id: ItemId.WOODEN_PICKAXE,
      count: 1,
      durability: pickDef?.maxDurability || 59,
      maxDurability: pickDef?.maxDurability || 59
    };
    this.slots[1] = { id: Block.OAK_LOG, count: 16 };
    this.slots[2] = { id: Block.TORCH, count: 16 };
    this.slots[3] = { id: ItemId.APPLE, count: 8 };
    this.slots[4] = { id: Block.DIRT, count: 32 };
    this.onChange?.();
  }

  public getSelectedSlot(): number {
    return this.selectedHotbarIndex;
  }

  public setSelectedSlot(index: number) {
    this.selectedHotbarIndex = ((index % Inventory.HOTBAR_SIZE) + Inventory.HOTBAR_SIZE) % Inventory.HOTBAR_SIZE;
    this.onChange?.();
  }

  public getSelectedItem(): ItemStack | null {
    return this.slots[this.selectedHotbarIndex];
  }

  public getSlot(index: number): ItemStack | null {
    if (index < 0 || index >= Inventory.TOTAL_SIZE) return null;
    return this.slots[index];
  }

  public setSlot(index: number, stack: ItemStack | null) {
    if (index < 0 || index >= Inventory.TOTAL_SIZE) return;
    this.slots[index] = stack ? { ...stack } : null;
    this.onChange?.();
  }

  public getItemCount(id: number): number {
    let total = 0;
    for (let i = 0; i < Inventory.TOTAL_SIZE; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        total += s.count;
      }
    }
    return total;
  }

  // Add item stack to inventory
  public addItem(id: number, count: number, durability?: number, maxDurability?: number): boolean {
    const itemDef = ITEM_DEFS[id];
    const maxStack = itemDef?.maxStack || 64;
    const isTool = maxStack === 1 || (itemDef && itemDef.maxDurability !== undefined);

    // 1. If not a tool and no custom durability, try to merge into existing non-full stacks
    if (!isTool && durability === undefined) {
      for (let i = 0; i < Inventory.TOTAL_SIZE; i++) {
        const slot = this.slots[i];
        if (slot && slot.id === id && slot.count < maxStack) {
          const canAdd = Math.min(count, maxStack - slot.count);
          slot.count += canAdd;
          count -= canAdd;
          if (count <= 0) {
            this.onChange?.();
            return true;
          }
        }
      }
    }

    // 2. Try to put into empty slots
    for (let i = 0; i < Inventory.TOTAL_SIZE; i++) {
      if (!this.slots[i]) {
        const canAdd = Math.min(count, maxStack);
        const newStack: ItemStack = { id, count: canAdd };
        const toolMaxDur = maxDurability !== undefined ? maxDurability : itemDef?.maxDurability;
        if (toolMaxDur !== undefined) {
          newStack.durability = durability !== undefined ? durability : toolMaxDur;
          newStack.maxDurability = toolMaxDur;
        }
        this.slots[i] = newStack;
        count -= canAdd;
        if (count <= 0) {
          this.onChange?.();
          return true;
        }
      }
    }

    this.onChange?.();
    return count <= 0;
  }

  // Damages the currently held item by amount. Returns true if the tool broke.
  public damageHeldItem(amount: number = 1): boolean {
    const slot = this.slots[this.selectedHotbarIndex];
    if (!slot || slot.durability === undefined) return false;

    slot.durability -= amount;
    if (slot.durability <= 0) {
      this.slots[this.selectedHotbarIndex] = null;
      this.onChange?.();
      return true; // Broke!
    }

    this.onChange?.();
    return false;
  }

  // Remove count of item from a specific slot
  public removeFromSlot(index: number, count: number = 1): boolean {
    const slot = this.slots[index];
    if (!slot || slot.count < count) return false;

    slot.count -= count;
    if (slot.count <= 0) {
      this.slots[index] = null;
    }
    this.onChange?.();
    return true;
  }

  // Calculate cumulative defense points (0 - 20) from equipped armor
  public getArmorDefense(): number {
    let total = 0;
    for (const stack of this.armorSlots) {
      if (stack) {
        const def = ITEM_DEFS[stack.id]?.defensePoints || 0;
        total += def;
      }
    }
    return Math.min(20, total);
  }

  // Get specific armor slot (0: Helmet, 1: Chestplate, 2: Leggings, 3: Boots)
  public getArmorSlot(index: number): ItemStack | null {
    if (index < 0 || index >= 4) return null;
    return this.armorSlots[index];
  }

  // Set armor slot directly
  public setArmorSlot(index: number, stack: ItemStack | null) {
    if (index < 0 || index >= 4) return;
    this.armorSlots[index] = stack ? { ...stack } : null;
    this.onChange?.();
  }

  // Equip armor piece into appropriate slot, returning previously worn item (if any)
  public equipArmor(stack: ItemStack): ItemStack | null {
    const itemDef = ITEM_DEFS[stack.id];
    if (!itemDef?.armorSlot) return stack;

    let slotIdx = 0;
    if (itemDef.armorSlot === 'chestplate') slotIdx = 1;
    else if (itemDef.armorSlot === 'leggings') slotIdx = 2;
    else if (itemDef.armorSlot === 'boots') slotIdx = 3;

    const previous = this.armorSlots[slotIdx];
    this.armorSlots[slotIdx] = { ...stack, count: 1 };
    this.onChange?.();
    return previous;
  }

  // Damage all equipped armor pieces
  public damageArmor(amount: number = 1) {
    let changed = false;
    for (let i = 0; i < 4; i++) {
      const piece = this.armorSlots[i];
      if (piece && piece.durability !== undefined) {
        piece.durability -= amount;
        changed = true;
        if (piece.durability <= 0) {
          this.armorSlots[i] = null;
        }
      }
    }
    if (changed) this.onChange?.();
  }

  // Swap or combine two slots
  public handleSlotClick(fromSlot: number, toSlot: number): boolean {
    const from = this.slots[fromSlot];
    const to = this.slots[toSlot];

    if (!from) return false;

    const maxStack = ITEM_DEFS[from.id]?.maxStack || 64;

    // Combine same items
    if (to && to.id === from.id && to.count < maxStack) {
      const transfer = Math.min(from.count, maxStack - to.count);
      to.count += transfer;
      from.count -= transfer;
      if (from.count <= 0) {
        this.slots[fromSlot] = null;
      }
      this.onChange?.();
      return true;
    }

    // Swap slots
    this.slots[toSlot] = from;
    this.slots[fromSlot] = to;
    this.onChange?.();
    return true;
  }

  // Count total amount of an item ID in inventory
  public countItem(id: number): number {
    let total = 0;
    for (let i = 0; i < Inventory.TOTAL_SIZE; i++) {
      const slot = this.slots[i];
      if (slot && slot.id === id) {
        total += slot.count;
      }
    }
    return total;
  }

  // Remove total count of an item ID across slots
  public removeItem(id: number, count: number): boolean {
    if (this.countItem(id) < count) return false;
    let remaining = count;
    for (let i = 0; i < Inventory.TOTAL_SIZE && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.id === id) {
        const take = Math.min(slot.count, remaining);
        slot.count -= take;
        remaining -= take;
        if (slot.count <= 0) {
          this.slots[i] = null;
        }
      }
    }
    this.onChange?.();
    return true;
  }

  public serialize(): string {
    return JSON.stringify({
      slots: this.slots,
      armor: this.armorSlots
    });
  }

  public deserialize(json: string) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.length === Inventory.TOTAL_SIZE) {
        this.slots = parsed;
        this.onChange?.();
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.slots)) {
          this.slots = parsed.slots;
        }
        if (Array.isArray(parsed.armor) && parsed.armor.length === 4) {
          this.armorSlots = parsed.armor;
        }
        this.onChange?.();
      }
    } catch {
      // ignore
    }
  }
}
