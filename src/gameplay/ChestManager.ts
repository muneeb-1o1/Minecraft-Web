import { ItemStack } from './Inventory';
import { ItemId, Block } from '../world/BlockTypes';

export class ChestManager {
  // Key: 'x,y,z' -> Array of 27 slots (ItemStack | null)
  private chests: Map<string, (ItemStack | null)[]> = new Map();

  public getKey(x: number, y: number, z: number): string {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  public getChest(x: number, y: number, z: number): (ItemStack | null)[] {
    const key = this.getKey(x, y, z);
    let slots = this.chests.get(key);
    if (!slots) {
      slots = this.generateLootTable(x, y, z);
      this.chests.set(key, slots);
    }
    return slots;
  }

  private generateLootTable(x: number, y: number, z: number): (ItemStack | null)[] {
    const slots: (ItemStack | null)[] = new Array(27).fill(null);
    const pseudoRand = (seed: number) => {
      const s = Math.sin(seed * 997 + x * 31.7 + y * 73.1 + z * 109.3) * 10000;
      return s - Math.floor(s);
    };

    // Authentic Minecraft village & dungeon loot pool
    const lootPool = [
      { id: ItemId.BREAD, min: 2, max: 6 },
      { id: ItemId.APPLE, min: 1, max: 4 },
      { id: ItemId.IRON_INGOT, min: 2, max: 5 },
      { id: ItemId.GOLD_INGOT, min: 1, max: 3 },
      { id: ItemId.EMERALD, min: 1, max: 4 },
      { id: ItemId.DIAMOND, min: 1, max: 2 },
      { id: ItemId.IRON_PICKAXE, min: 1, max: 1 },
      { id: ItemId.IRON_SWORD, min: 1, max: 1 },
      { id: ItemId.BOW, min: 1, max: 1 },
      { id: ItemId.ARROW, min: 4, max: 12 },
      { id: ItemId.WHEAT, min: 3, max: 7 },
      { id: Block.TORCH, min: 4, max: 8 },
      { id: ItemId.COAL, min: 3, max: 8 },
      { id: ItemId.RAW_FISH, min: 1, max: 3 }
    ];

    // Populate 5 to 8 randomized distinct slots
    const numItems = 5 + Math.floor(pseudoRand(1) * 4);
    const chosenSlots = new Set<number>();
    let attempts = 0;
    while (chosenSlots.size < numItems && attempts < 40) {
      attempts++;
      chosenSlots.add(Math.floor(pseudoRand(attempts * 17) * 27));
    }

    let i = 0;
    for (const slot of chosenSlots) {
      if (slot === 0) continue; // Keep slot 0 available for player operations
      const entry = lootPool[(i + Math.floor(pseudoRand(slot + 23) * lootPool.length)) % lootPool.length];
      const count = entry.min + Math.floor(pseudoRand(slot + 57) * (entry.max - entry.min + 1));
      slots[slot] = { id: entry.id, count };
      i++;
    }

    // Guarantee authentic dungeon staples (iron ingots, bread, and coal)
    slots[1] = { id: ItemId.IRON_INGOT, count: 2 + Math.floor(pseudoRand(11) * 3) };
    slots[3] = { id: ItemId.BREAD, count: 2 + Math.floor(pseudoRand(22) * 4) };
    slots[5] = { id: ItemId.COAL, count: 3 + Math.floor(pseudoRand(33) * 5) };

    return slots;
  }

  public setSlot(x: number, y: number, z: number, slotIndex: number, stack: ItemStack | null) {
    const chest = this.getChest(x, y, z);
    if (slotIndex >= 0 && slotIndex < 27) {
      chest[slotIndex] = stack;
    }
  }
}
