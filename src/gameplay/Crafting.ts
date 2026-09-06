import { Block, ItemId, ITEM_DEFS } from '../world/BlockTypes';
import { ItemStack } from './Inventory';

export interface Recipe {
  output: ItemStack;
  // Width and height of the recipe pattern
  width: number;
  height: number;
  // Ingredients in row-major order (null for empty slot)
  pattern: (number | null)[];
}

export class CraftingManager {
  private recipes: Recipe[] = [];

  constructor() {
    this.registerDefaultRecipes();
  }

  private registerDefaultRecipes() {
    // 1. Logs -> 4 Planks (Oak)
    this.registerRecipe({
      width: 1, height: 1,
      pattern: [Block.OAK_LOG],
      output: { id: Block.OAK_PLANKS, count: 4 }
    });

    // Logs -> 4 Planks (Birch)
    this.registerRecipe({
      width: 1, height: 1,
      pattern: [Block.BIRCH_LOG],
      output: { id: Block.BIRCH_PLANKS, count: 4 }
    });

    // 2. 2 Vertical Planks -> 4 Sticks
    this.registerRecipe({
      width: 1, height: 2,
      pattern: [
        Block.OAK_PLANKS,
        Block.OAK_PLANKS
      ],
      output: { id: ItemId.STICK, count: 4 }
    });

    // 3. 4 Planks -> 1 Crafting Table (2x2)
    this.registerRecipe({
      width: 2, height: 2,
      pattern: [
        Block.OAK_PLANKS, Block.OAK_PLANKS,
        Block.OAK_PLANKS, Block.OAK_PLANKS
      ],
      output: { id: Block.CRAFTING_TABLE, count: 1 }
    });

    // 4. Coal + Stick -> 4 Torches
    this.registerRecipe({
      width: 1, height: 2,
      pattern: [
        ItemId.COAL,
        ItemId.STICK
      ],
      output: { id: Block.TORCH, count: 4 }
    });

    // 5. 4 Sand -> 1 Sandstone
    this.registerRecipe({
      width: 2, height: 2,
      pattern: [
        Block.SAND, Block.SAND,
        Block.SAND, Block.SAND
      ],
      output: { id: Block.SANDSTONE, count: 1 }
    });

    // 6. Tools: Pickaxes (3 material top, 2 sticks below)
    const registerPickaxe = (mat: number, pickId: number) => {
      this.registerRecipe({
        width: 3, height: 3,
        pattern: [
          mat, mat, mat,
          null, ItemId.STICK, null,
          null, ItemId.STICK, null
        ],
        output: { id: pickId, count: 1 }
      });
    };

    registerPickaxe(Block.OAK_PLANKS, ItemId.WOODEN_PICKAXE);
    registerPickaxe(Block.COBBLESTONE, ItemId.STONE_PICKAXE);
    registerPickaxe(ItemId.IRON_INGOT, ItemId.IRON_PICKAXE);
    registerPickaxe(ItemId.DIAMOND, ItemId.DIAMOND_PICKAXE);

    // 7. Tools: Swords (2 material vertical, 1 stick below)
    const registerSword = (mat: number, swordId: number) => {
      this.registerRecipe({
        width: 1, height: 3,
        pattern: [
          mat,
          mat,
          ItemId.STICK
        ],
        output: { id: swordId, count: 1 }
      });
    };

    registerSword(Block.OAK_PLANKS, ItemId.WOODEN_SWORD);
    registerSword(Block.COBBLESTONE, ItemId.STONE_SWORD);
    registerSword(ItemId.IRON_INGOT, ItemId.IRON_SWORD);
    registerSword(ItemId.DIAMOND, ItemId.DIAMOND_SWORD);

    // 8. Tools: Axes
    const registerAxe = (mat: number, axeId: number) => {
      this.registerRecipe({
        width: 2, height: 3,
        pattern: [
          mat, mat,
          mat, ItemId.STICK,
          null, ItemId.STICK
        ],
        output: { id: axeId, count: 1 }
      });
    };

    registerAxe(Block.OAK_PLANKS, ItemId.WOODEN_AXE);
    registerAxe(Block.COBBLESTONE, ItemId.STONE_AXE);
    registerAxe(ItemId.IRON_INGOT, ItemId.IRON_AXE);
    registerAxe(ItemId.DIAMOND, ItemId.DIAMOND_AXE);

    // 9. Tools: Shovels
    const registerShovel = (mat: number, shovelId: number) => {
      this.registerRecipe({
        width: 1, height: 3,
        pattern: [
          mat,
          ItemId.STICK,
          ItemId.STICK
        ],
        output: { id: shovelId, count: 1 }
      });
    };

    registerShovel(Block.OAK_PLANKS, ItemId.WOODEN_SHOVEL);
    registerShovel(Block.COBBLESTONE, ItemId.STONE_SHOVEL);
    registerShovel(ItemId.IRON_INGOT, ItemId.IRON_SHOVEL);
    registerShovel(ItemId.DIAMOND, ItemId.DIAMOND_SHOVEL);

    // 10. Furnace: 8 Cobblestone ring (3x3)
    this.registerRecipe({
      width: 3, height: 3,
      pattern: [
        Block.COBBLESTONE, Block.COBBLESTONE, Block.COBBLESTONE,
        Block.COBBLESTONE, null,              Block.COBBLESTONE,
        Block.COBBLESTONE, Block.COBBLESTONE, Block.COBBLESTONE
      ],
      output: { id: Block.FURNACE, count: 1 }
    });

    // 11. Chest: 8 Planks ring (3x3)
    this.registerRecipe({
      width: 3, height: 3,
      pattern: [
        Block.OAK_PLANKS, Block.OAK_PLANKS, Block.OAK_PLANKS,
        Block.OAK_PLANKS, null,             Block.OAK_PLANKS,
        Block.OAK_PLANKS, Block.OAK_PLANKS, Block.OAK_PLANKS
      ],
      output: { id: Block.CHEST, count: 1 }
    });

    // 12. Bed: 3 Wool top row, 3 Planks bottom row (3x2)
    this.registerRecipe({
      width: 3, height: 2,
      pattern: [
        ItemId.WOOL, ItemId.WOOL, ItemId.WOOL,
        Block.OAK_PLANKS, Block.OAK_PLANKS, Block.OAK_PLANKS
      ],
      output: { id: Block.BED, count: 1 }
    });

    // 13. Bow: 3 Sticks curved, 3 Wool string (3x3)
    this.registerRecipe({
      width: 3, height: 3,
      pattern: [
        null, ItemId.STICK, ItemId.WOOL,
        ItemId.STICK, null, ItemId.WOOL,
        null, ItemId.STICK, ItemId.WOOL
      ],
      output: { id: ItemId.BOW, count: 1 }
    });

    // 14. Arrow: 1 Flint (or Cobblestone), 1 Stick, 1 Feather (1x3)
    this.registerRecipe({
      width: 1, height: 3,
      pattern: [
        ItemId.FLINT,
        ItemId.STICK,
        ItemId.FEATHER
      ],
      output: { id: ItemId.ARROW, count: 4 }
    });

    this.registerRecipe({
      width: 1, height: 3,
      pattern: [
        Block.COBBLESTONE,
        ItemId.STICK,
        ItemId.FEATHER
      ],
      output: { id: ItemId.ARROW, count: 4 }
    });

    // 15. Armor: Helmets (3 top, 2 side)
    const registerHelmet = (mat: number, outId: number) => {
      this.registerRecipe({
        width: 3, height: 2,
        pattern: [
          mat, mat, mat,
          mat, null, mat
        ],
        output: { id: outId, count: 1 }
      });
    };
    registerHelmet(ItemId.IRON_INGOT, ItemId.IRON_HELMET);
    registerHelmet(ItemId.DIAMOND, ItemId.DIAMOND_HELMET);

    // 16. Armor: Chestplates (8 material)
    const registerChestplate = (mat: number, outId: number) => {
      this.registerRecipe({
        width: 3, height: 3,
        pattern: [
          mat, null, mat,
          mat, mat,  mat,
          mat, mat,  mat
        ],
        output: { id: outId, count: 1 }
      });
    };
    registerChestplate(ItemId.IRON_INGOT, ItemId.IRON_CHESTPLATE);
    registerChestplate(ItemId.DIAMOND, ItemId.DIAMOND_CHESTPLATE);

    // 17. Armor: Leggings (7 material)
    const registerLeggings = (mat: number, outId: number) => {
      this.registerRecipe({
        width: 3, height: 3,
        pattern: [
          mat, mat,  mat,
          mat, null, mat,
          mat, null, mat
        ],
        output: { id: outId, count: 1 }
      });
    };
    registerLeggings(ItemId.IRON_INGOT, ItemId.IRON_LEGGINGS);
    registerLeggings(ItemId.DIAMOND, ItemId.DIAMOND_LEGGINGS);

    // 18. Armor: Boots (4 material)
    const registerBoots = (mat: number, outId: number) => {
      this.registerRecipe({
        width: 3, height: 2,
        pattern: [
          mat, null, mat,
          mat, null, mat
        ],
        output: { id: outId, count: 1 }
      });
    };
    registerBoots(ItemId.IRON_INGOT, ItemId.IRON_BOOTS);
    registerBoots(ItemId.DIAMOND, ItemId.DIAMOND_BOOTS);

    // Bucket: 3 Iron Ingots V-shape (3x2)
    this.registerRecipe({
      width: 3, height: 2,
      pattern: [
        ItemId.IRON_INGOT, null, ItemId.IRON_INGOT,
        null, ItemId.IRON_INGOT, null
      ],
      output: { id: ItemId.BUCKET, count: 1 }
    });

    // Bread: 3 Wheat horizontal (3x1)
    this.registerRecipe({
      width: 3, height: 1,
      pattern: [
        ItemId.WHEAT, ItemId.WHEAT, ItemId.WHEAT
      ],
      output: { id: ItemId.BREAD, count: 1 }
    });

    // Hoes: 2 material top, 2 sticks below (2x3)
    const registerHoe = (mat: number, hoeId: number) => {
      this.registerRecipe({
        width: 2, height: 3,
        pattern: [
          mat, mat,
          null, ItemId.STICK,
          null, ItemId.STICK
        ],
        output: { id: hoeId, count: 1 }
      });
    };
    registerHoe(Block.OAK_PLANKS, ItemId.WOODEN_HOE);
    registerHoe(Block.COBBLESTONE, ItemId.STONE_HOE);
    registerHoe(ItemId.IRON_INGOT, ItemId.IRON_HOE);
    registerHoe(ItemId.DIAMOND, ItemId.DIAMOND_HOE);

    // Book: 3 Wheat + 1 Leather
    this.registerRecipe({
      width: 2, height: 2,
      pattern: [
        ItemId.WHEAT, ItemId.WHEAT,
        ItemId.WHEAT, ItemId.LEATHER
      ],
      output: { id: ItemId.BOOK, count: 1 }
    });

    // 20. Enchanting Table: 1 Book + 2 Diamonds + 4 Obsidian
    this.registerRecipe({
      width: 3, height: 3,
      pattern: [
        null, ItemId.BOOK, null,
        ItemId.DIAMOND, Block.OBSIDIAN, ItemId.DIAMOND,
        Block.OBSIDIAN, Block.OBSIDIAN, Block.OBSIDIAN
      ],
      output: { id: Block.ENCHANTING_TABLE, count: 1 }
    });

    // 21. Glowstone block: 4 Glowstone Dust (2x2)
    this.registerRecipe({
      width: 2, height: 2,
      pattern: [
        ItemId.GLOWSTONE_DUST, ItemId.GLOWSTONE_DUST,
        ItemId.GLOWSTONE_DUST, ItemId.GLOWSTONE_DUST
      ],
      output: { id: Block.GLOWSTONE, count: 1 }
    });

    // 22. Nether Bricks: 4 Netherrack (2x2)
    this.registerRecipe({
      width: 2, height: 2,
      pattern: [
        Block.NETHERRACK, Block.NETHERRACK,
        Block.NETHERRACK, Block.NETHERRACK
      ],
      output: { id: Block.NETHER_BRICKS, count: 1 }
    });

    // 23. Blaze Powder: 1 Blaze Rod
    this.registerRecipe({
      width: 1, height: 1,
      pattern: [ItemId.BLAZE_ROD],
      output: { id: ItemId.BLAZE_POWDER, count: 2 }
    });

    // 24. Gold Nuggets: 1 Gold Ingot -> 9 Gold Nuggets
    this.registerRecipe({
      width: 1, height: 1,
      pattern: [ItemId.GOLD_INGOT],
      output: { id: ItemId.GOLD_NUGGET, count: 9 }
    });

    // 25. Gold Ingot: 9 Gold Nuggets (3x3)
    this.registerRecipe({
      width: 3, height: 3,
      pattern: [
        ItemId.GOLD_NUGGET, ItemId.GOLD_NUGGET, ItemId.GOLD_NUGGET,
        ItemId.GOLD_NUGGET, ItemId.GOLD_NUGGET, ItemId.GOLD_NUGGET,
        ItemId.GOLD_NUGGET, ItemId.GOLD_NUGGET, ItemId.GOLD_NUGGET
      ],
      output: { id: ItemId.GOLD_INGOT, count: 1 }
    });

    // 26. Glass Bottle: 3 Glass blocks (V shape)
    this.registerRecipe({
      width: 3, height: 2,
      pattern: [
        Block.GLASS, null, Block.GLASS,
        null, Block.GLASS, null
      ],
      output: { id: ItemId.GLASS_BOTTLE, count: 3 }
    });

    // 27. Brewing Stand: 1 Blaze Rod + 3 Cobblestone
    this.registerRecipe({
      width: 3, height: 2,
      pattern: [
        null, ItemId.BLAZE_ROD, null,
        Block.COBBLESTONE, Block.COBBLESTONE, Block.COBBLESTONE
      ],
      output: { id: Block.BREWING_STAND, count: 1 }
    });

    // 28. Potion of Healing: Glass Bottle + Nether Wart + Ghast Tear
    this.registerRecipe({
      width: 1, height: 3,
      pattern: [
        ItemId.GHAST_TEAR,
        ItemId.NETHER_WART,
        ItemId.GLASS_BOTTLE
      ],
      output: { id: ItemId.POTION_HEALING, count: 1 }
    });

    // 29. Potion of Strength: Glass Bottle + Nether Wart + Blaze Powder
    this.registerRecipe({
      width: 1, height: 3,
      pattern: [
        ItemId.BLAZE_POWDER,
        ItemId.NETHER_WART,
        ItemId.GLASS_BOTTLE
      ],
      output: { id: ItemId.POTION_STRENGTH, count: 1 }
    });

    // 30. Potion of Speed: Glass Bottle + Nether Wart + Gold Nugget
    this.registerRecipe({
      width: 1, height: 3,
      pattern: [
        ItemId.GOLD_NUGGET,
        ItemId.NETHER_WART,
        ItemId.GLASS_BOTTLE
      ],
      output: { id: ItemId.POTION_SPEED, count: 1 }
    });

    // 31. Potion of Fire Resistance: Glass Bottle + Nether Wart + Netherrack
    this.registerRecipe({
      width: 1, height: 3,
      pattern: [
        Block.NETHERRACK,
        ItemId.NETHER_WART,
        ItemId.GLASS_BOTTLE
      ],
      output: { id: ItemId.POTION_FIRE_RESISTANCE, count: 1 }
    });

    // 32. Potion of Night Vision: Glass Bottle + Nether Wart + Glowstone Dust
    this.registerRecipe({
      width: 1, height: 3,
      pattern: [
        ItemId.GLOWSTONE_DUST,
        ItemId.NETHER_WART,
        ItemId.GLASS_BOTTLE
      ],
      output: { id: ItemId.POTION_NIGHT_VISION, count: 1 }
    });

    // 33. Redstone Torch: Redstone Dust + Stick
    this.registerRecipe({
      width: 1, height: 2,
      pattern: [
        ItemId.REDSTONE_DUST,
        ItemId.STICK
      ],
      output: { id: Block.REDSTONE_TORCH, count: 1 }
    });

    // 34. Lever: Stick + Cobblestone
    this.registerRecipe({
      width: 1, height: 2,
      pattern: [
        ItemId.STICK,
        Block.COBBLESTONE
      ],
      output: { id: Block.LEVER, count: 1 }
    });

    // 35. Redstone Lamp: 4 Redstone Dust + 1 Glowstone (3x3 cross)
    this.registerRecipe({
      width: 3, height: 3,
      pattern: [
        null, ItemId.REDSTONE_DUST, null,
        ItemId.REDSTONE_DUST, Block.GLOWSTONE, ItemId.REDSTONE_DUST,
        null, ItemId.REDSTONE_DUST, null
      ],
      output: { id: Block.REDSTONE_LAMP, count: 1 }
    });

    // 36. TNT: 5 Gunpowder + 4 Sand (3x3 checkerboard)
    this.registerRecipe({
      width: 3, height: 3,
      pattern: [
        ItemId.GUNPOWDER, Block.SAND, ItemId.GUNPOWDER,
        Block.SAND, ItemId.GUNPOWDER, Block.SAND,
        ItemId.GUNPOWDER, Block.SAND, ItemId.GUNPOWDER
      ],
      output: { id: Block.TNT, count: 1 }
    });

    // 37. Eye of Ender: Ender Pearl + Blaze Powder
    this.registerRecipe({
      width: 2, height: 1,
      pattern: [ItemId.ENDER_PEARL, ItemId.BLAZE_POWDER],
      output: { id: ItemId.EYE_OF_ENDER, count: 1 }
    });
    this.registerRecipe({
      width: 1, height: 2,
      pattern: [ItemId.ENDER_PEARL, ItemId.BLAZE_POWDER],
      output: { id: ItemId.EYE_OF_ENDER, count: 1 }
    });

    // 38. Nether Brick Fence: 6 Nether Bricks (3x2)
    this.registerRecipe({
      width: 3, height: 2,
      pattern: [
        Block.NETHER_BRICKS, Block.NETHER_BRICKS, Block.NETHER_BRICKS,
        Block.NETHER_BRICKS, Block.NETHER_BRICKS, Block.NETHER_BRICKS
      ],
      output: { id: Block.NETHER_BRICK_FENCE, count: 6 }
    });
  }

  public registerRecipe(recipe: Recipe) {
    this.recipes.push(recipe);
  }

  // Evaluate recipe in given grid (grid is either 2x2=4 slots or 3x3=9 slots)
  public evaluate(grid: (ItemStack | null)[], gridSize: 2 | 3): ItemStack | null {
    // Find bounding box of items in the grid
    let minX: number = gridSize;
    let maxX = -1;
    let minY: number = gridSize;
    let maxY = -1;

    let itemCount = 0;
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const item = grid[y * gridSize + x];
        if (item) {
          itemCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (itemCount === 0) return null;

    const patternW = maxX - minX + 1;
    const patternH = maxY - minY + 1;

    for (const recipe of this.recipes) {
      if (recipe.width === patternW && recipe.height === patternH) {
        let match = true;
        for (let ry = 0; ry < patternH; ry++) {
          for (let rx = 0; rx < patternW; rx++) {
            const expected = recipe.pattern[ry * patternW + rx];
            const actualItem = grid[(minY + ry) * gridSize + (minX + rx)];
            const actualId = actualItem ? actualItem.id : null;

            if (expected !== actualId) {
              match = false;
              break;
            }
          }
          if (!match) break;
        }

        if (match) {
          const out: ItemStack = { id: recipe.output.id, count: recipe.output.count };
          const maxDur = ITEM_DEFS[recipe.output.id]?.maxDurability;
          if (maxDur !== undefined) {
            out.durability = maxDur;
            out.maxDurability = maxDur;
          }
          return out;
        }
      }
    }

    return null;
  }

  // Consume 1 from each populated crafting slot upon crafting output pickup
  public consume(grid: (ItemStack | null)[]) {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i]) {
        grid[i]!.count--;
        if (grid[i]!.count <= 0) {
          grid[i] = null;
        }
      }
    }
  }
}
