import { Block, ItemId } from '../world/BlockTypes';
import { ItemStack } from './Inventory';

export interface FurnaceData {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  fuelTimeLeft: number; // Remaining seconds for current fuel item
  maxFuelTime: number; // Total seconds current fuel item lasts
  cookProgress: number; // 0 to 10 seconds
}

export interface SmeltRecipe {
  input: number;
  output: number;
  xp: number;
}

export const SMELT_RECIPES: SmeltRecipe[] = [
  { input: Block.IRON_ORE, output: ItemId.IRON_INGOT, xp: 0.7 },
  { input: Block.GOLD_ORE, output: ItemId.GOLD_INGOT, xp: 1.0 },
  { input: ItemId.RAW_BEEF, output: ItemId.COOKED_BEEF, xp: 0.35 },
  { input: ItemId.PORKCHOP, output: ItemId.COOKED_BEEF, xp: 0.35 },
  { input: ItemId.RAW_CHICKEN, output: ItemId.COOKED_BEEF, xp: 0.35 },
  { input: ItemId.RAW_FISH, output: ItemId.COOKED_FISH, xp: 0.35 },
  { input: Block.SAND, output: Block.GLASS, xp: 0.1 },
  { input: Block.COBBLESTONE, output: Block.STONE, xp: 0.1 },
  { input: Block.OAK_LOG, output: ItemId.COAL, xp: 0.15 },
  { input: Block.BIRCH_LOG, output: ItemId.COAL, xp: 0.15 }
];

export const FUEL_DURATIONS: Record<number, number> = {
  [ItemId.COAL]: 80, // 8 items
  [Block.OAK_PLANKS]: 15, // 1.5 items
  [Block.BIRCH_PLANKS]: 15,
  [Block.OAK_LOG]: 15,
  [Block.BIRCH_LOG]: 15,
  [ItemId.STICK]: 5, // 0.5 items
  [ItemId.LAVA_BUCKET]: 1000 // 100 items (1000s)
};

export class FurnaceManager {
  private furnaces: Map<string, FurnaceData> = new Map();
  public onFurnaceUpdate?: (posKey: string, data: FurnaceData) => void;

  public getKey(x: number, y: number, z: number): string {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  public getFurnace(x: number, y: number, z: number): FurnaceData {
    const key = this.getKey(x, y, z);
    let data = this.furnaces.get(key);
    if (!data) {
      data = {
        input: null,
        fuel: null,
        output: null,
        fuelTimeLeft: 0,
        maxFuelTime: 0,
        cookProgress: 0
      };
      this.furnaces.set(key, data);
    }
    return data;
  }

  public getRecipe(inputId: number): SmeltRecipe | undefined {
    return SMELT_RECIPES.find(r => r.input === inputId);
  }

  public getFuelTime(fuelId: number): number {
    return FUEL_DURATIONS[fuelId] || 0;
  }

  public update(dt: number) {
    const COOK_TIME = 10; // 10 seconds per item

    for (const [key, data] of this.furnaces.entries()) {
      let isBurning = data.fuelTimeLeft > 0;
      let changed = false;

      // Burn remaining fuel
      if (isBurning) {
        data.fuelTimeLeft = Math.max(0, data.fuelTimeLeft - dt);
        changed = true;
      }

      // Check if we can cook
      const recipe = data.input ? this.getRecipe(data.input.id) : undefined;
      const canOutput = recipe && (
        !data.output || (data.output.id === recipe.output && data.output.count < 64)
      );

      if (recipe && canOutput) {
        // If fuel ran out, try consume next fuel item
        if (data.fuelTimeLeft <= 0 && data.fuel && data.fuel.count > 0) {
          const duration = this.getFuelTime(data.fuel.id);
          if (duration > 0) {
            data.maxFuelTime = duration;
            data.fuelTimeLeft = duration;
            const consumedId = data.fuel.id;
            data.fuel.count--;
            if (data.fuel.count <= 0) {
              if (consumedId === ItemId.LAVA_BUCKET) {
                data.fuel = { id: ItemId.BUCKET, count: 1 };
              } else {
                data.fuel = null;
              }
            }
            isBurning = true;
            changed = true;
          }
        }

        // Cook if burning
        if (data.fuelTimeLeft > 0) {
          data.cookProgress += dt;
          changed = true;

          if (data.cookProgress >= COOK_TIME) {
            data.cookProgress = 0;
            // Produce item
            if (!data.output) {
              data.output = { id: recipe.output, count: 1 };
            } else {
              data.output.count++;
            }
            // Consume input
            data.input!.count--;
            if (data.input!.count <= 0) {
              data.input = null;
            }
          }
        } else {
          // Slowly cool down if no fuel
          if (data.cookProgress > 0) {
            data.cookProgress = Math.max(0, data.cookProgress - dt * 2);
            changed = true;
          }
        }
      } else {
        // No valid recipe: reset cook progress
        if (data.cookProgress > 0) {
          data.cookProgress = 0;
          changed = true;
        }
      }

      if (changed && this.onFurnaceUpdate) {
        this.onFurnaceUpdate(key, data);
      }
    }
  }
}
