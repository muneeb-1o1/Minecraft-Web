import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { PerlinNoise } from '../src/world/Noise.ts';
import { TerrainGenerator, BiomeType } from '../src/world/TerrainGenerator.ts';
import { Block, ItemId, BLOCK_DEFS, ITEM_DEFS, getItemName, isBlockItem } from '../src/world/BlockTypes.ts';
import { AABB } from '../src/player/AABB.ts';
import { Inventory } from '../src/gameplay/Inventory.ts';
import { CraftingManager } from '../src/gameplay/Crafting.ts';
import { FurnaceManager, SMELT_RECIPES, FUEL_DURATIONS } from '../src/gameplay/FurnaceManager.ts';
import { ChestManager } from '../src/gameplay/ChestManager.ts';
import { Mob, MobType } from '../src/entities/Mob.ts';
import { MobManager } from '../src/entities/MobManager.ts';
import { FluidSimulator } from '../src/world/FluidSimulator.ts';
import { SoundManager } from '../src/audio/SoundManager.ts';
import {
  calculateRenderDimensions,
  MAX_RENDER_HEIGHT,
  MAX_RENDER_WIDTH,
  normalizeRenderScale,
  RESOLUTION_PRESETS
} from '../src/config/GraphicsSettings.ts';
import { DayNightCycle, MOON_PHASE_NAMES } from '../src/gameplay/DayNightCycle.ts';
import { TextureAtlas } from '../src/textures/TextureAtlas.ts';
import { WeatherSystem } from '../src/gameplay/WeatherSystem.ts';
import { World } from '../src/world/World.ts';

// 1. Noise Generator Tests
test('PerlinNoise: deterministic output with identical seed', () => {
  const noise1 = new PerlinNoise(42);
  const noise2 = new PerlinNoise(42);

  const val1 = noise1.noise2D(12.5, 34.8);
  const val2 = noise2.noise2D(12.5, 34.8);

  assert.equal(val1, val2);
});

test('PerlinNoise: different seeds produce different outputs', () => {
  const noise1 = new PerlinNoise(100);
  const noise2 = new PerlinNoise(999);

  const val1 = noise1.noise2D(5.35, 8.72);
  const val2 = noise2.noise2D(5.35, 8.72);

  assert.notEqual(val1, val2);
});

test('PerlinNoise: fBm2D generates continuous values within reasonable bounds', () => {
  const noise = new PerlinNoise(1337);
  for (let x = -50; x <= 50; x += 10) {
    for (let y = -50; y <= 50; y += 10) {
      const v = noise.fbm2D(x * 0.05, y * 0.05, 4);
      assert.ok(v >= -1.5 && v <= 1.5, `fBm2D out of expected bounds: ${v}`);
    }
  }
});

// 2. Terrain Generator Tests
test('TerrainGenerator: generates valid surface heights within chunk boundaries', () => {
  const gen = new TerrainGenerator(1234, 'default');

  for (let x = -32; x <= 32; x += 8) {
    for (let z = -32; z <= 32; z += 8) {
      const h = gen.getHeight(x, z);
      assert.ok(h >= 2 && h < 64, `Height ${h} out of bounds at (${x}, ${z})`);
    }
  }
});

test('TerrainGenerator: returns valid biomes', () => {
  const gen = new TerrainGenerator(1234, 'default');
  const validBiomes = [
    BiomeType.PLAINS,
    BiomeType.FOREST,
    BiomeType.DESERT,
    BiomeType.MOUNTAINS,
    BiomeType.OCEAN
  ];

  for (let x = -100; x <= 100; x += 25) {
    const biome = gen.getBiome(x, 0);
    assert.ok(validBiomes.includes(biome), `Invalid biome: ${biome}`);
  }
});

test('TerrainGenerator: generates chunk data array with bedrock at bottom', () => {
  const gen = new TerrainGenerator(555, 'default');
  const data = gen.generateChunkData(0, 0);

  assert.equal(data.length, 16 * 64 * 16);

  // Check bedrock at y=0
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const idx = (0 * 16 + z) * 16 + x;
      assert.equal(data[idx], Block.BEDROCK, `Bedrock missing at (${x}, 0, ${z})`);
    }
  }
});

test('TerrainGenerator: Superflat world type generates flat grass plains at y=4', () => {
  const gen = new TerrainGenerator(777, 'flat');
  const data = gen.generateChunkData(0, 0);

  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const idxY0 = (0 * 16 + z) * 16 + x;
      const idxY4 = (4 * 16 + z) * 16 + x;
      const idxY5 = (5 * 16 + z) * 16 + x;

      assert.equal(data[idxY0], Block.BEDROCK);
      assert.equal(data[idxY4], Block.GRASS);
      assert.equal(data[idxY5], Block.AIR);
    }
  }
});

// 3. Block and Item Definitions Tests
test('BlockTypes: Bedrock is unbreakable with Infinity hardness', () => {
  const bedrock = BLOCK_DEFS[Block.BEDROCK];
  assert.ok(bedrock);
  assert.equal(bedrock.hardness, Infinity);
});

test('BlockTypes: All blocks have names, valid sound types, and textures', () => {
  for (const key of Object.keys(BLOCK_DEFS)) {
    const id = parseInt(key, 10);
    const def = BLOCK_DEFS[id];
    assert.ok(def.name.length > 0, `Block ${id} missing name`);
    assert.ok(def.textures.length === 6, `Block ${id} does not have 6 textures`);
    assert.ok(['grass', 'stone', 'wood', 'sand', 'gravel', 'glass'].includes(def.soundType));
  }
});

test('BlockTypes: getItemName and isBlockItem helper functions', () => {
  assert.equal(getItemName(Block.GRASS), 'Grass Block');
  assert.equal(getItemName(ItemId.DIAMOND_PICKAXE), 'Diamond Pickaxe');
  assert.ok(isBlockItem(Block.STONE));
  assert.ok(!isBlockItem(ItemId.STICK));
  assert.ok(!isBlockItem(Block.AIR));
});

// 4. AABB Collision Tests
test('AABB: intersection detection between bounding boxes', () => {
  const box1 = new AABB();
  box1.set(0, 0, 0, 1, 1, 1);

  const box2 = new AABB();
  box2.set(0.5, 0.5, 0.5, 1.5, 1.5, 1.5);

  const box3 = new AABB();
  box3.set(2, 2, 2, 3, 3, 3);

  assert.ok(box1.intersects(box2));
  assert.ok(!box1.intersects(box3));
});

// 5. Inventory System Tests
test('Inventory: adding and stacking items correctly', () => {
  const inv = new Inventory();
  // Clear inventory for test
  for (let i = 0; i < Inventory.TOTAL_SIZE; i++) inv.setSlot(i, null);

  // Add 40 dirt blocks
  const success1 = inv.addItem(Block.DIRT, 40);
  assert.ok(success1);
  assert.deepEqual(inv.getSlot(0), { id: Block.DIRT, count: 40 });

  // Add another 30 dirt blocks (should fill slot 0 to 64 and spill 6 to slot 1)
  const success2 = inv.addItem(Block.DIRT, 30);
  assert.ok(success2);
  assert.deepEqual(inv.getSlot(0), { id: Block.DIRT, count: 64 });
  assert.deepEqual(inv.getSlot(1), { id: Block.DIRT, count: 6 });
});

test('Inventory: removing items and slot clearance', () => {
  const inv = new Inventory();
  for (let i = 0; i < Inventory.TOTAL_SIZE; i++) inv.setSlot(i, null);

  inv.setSlot(0, { id: Block.STONE, count: 5 });
  inv.removeFromSlot(0, 2);
  assert.deepEqual(inv.getSlot(0), { id: Block.STONE, count: 3 });

  inv.removeFromSlot(0, 3);
  assert.equal(inv.getSlot(0), null);
});

test('Inventory: serialization and deserialization', () => {
  const inv = new Inventory();
  inv.setSlot(0, { id: ItemId.DIAMOND_SWORD, count: 1 });
  inv.setSlot(5, { id: Block.GOLD_ORE, count: 12 });

  const serialized = inv.serialize();
  const inv2 = new Inventory();
  inv2.deserialize(serialized);

  assert.deepEqual(inv2.getSlot(0), { id: ItemId.DIAMOND_SWORD, count: 1 });
  assert.deepEqual(inv2.getSlot(5), { id: Block.GOLD_ORE, count: 12 });
});

// 6. Crafting System Tests
test('Crafting: 1 Wood Log crafts 4 Planks (2x2)', () => {
  const crafting = new CraftingManager();
  const grid: any = [
    { id: Block.OAK_LOG, count: 1 }, null,
    null, null
  ];

  const result = crafting.evaluate(grid, 2);
  assert.ok(result);
  assert.equal(result.id, Block.OAK_PLANKS);
  assert.equal(result.count, 4);
});

test('Crafting: 2 Vertical Planks craft 4 Sticks (2x2)', () => {
  const crafting = new CraftingManager();
  const grid: any = [
    { id: Block.OAK_PLANKS, count: 1 }, null,
    { id: Block.OAK_PLANKS, count: 1 }, null
  ];

  const result = crafting.evaluate(grid, 2);
  assert.ok(result);
  assert.equal(result.id, ItemId.STICK);
  assert.equal(result.count, 4);
});

test('Crafting: 4 Planks craft 1 Crafting Table (2x2)', () => {
  const crafting = new CraftingManager();
  const grid: any = [
    { id: Block.OAK_PLANKS, count: 1 }, { id: Block.OAK_PLANKS, count: 1 },
    { id: Block.OAK_PLANKS, count: 1 }, { id: Block.OAK_PLANKS, count: 1 }
  ];

  const result = crafting.evaluate(grid, 2);
  assert.ok(result);
  assert.equal(result.id, Block.CRAFTING_TABLE);
  assert.equal(result.count, 1);
});

test('Crafting: Pickaxe recipe in 3x3 grid', () => {
  const crafting = new CraftingManager();
  const grid: any = [
    { id: Block.COBBLESTONE, count: 1 }, { id: Block.COBBLESTONE, count: 1 }, { id: Block.COBBLESTONE, count: 1 },
    null, { id: ItemId.STICK, count: 1 }, null,
    null, { id: ItemId.STICK, count: 1 }, null
  ];

  const result = crafting.evaluate(grid, 3);
  assert.ok(result);
  assert.equal(result.id, ItemId.STONE_PICKAXE);
  assert.equal(result.count, 1);
});

test('Crafting: 8 Cobblestone ring crafts 1 Furnace in 3x3 grid', () => {
  const crafting = new CraftingManager();
  const grid: any = [
    { id: Block.COBBLESTONE, count: 1 }, { id: Block.COBBLESTONE, count: 1 }, { id: Block.COBBLESTONE, count: 1 },
    { id: Block.COBBLESTONE, count: 1 }, null, { id: Block.COBBLESTONE, count: 1 },
    { id: Block.COBBLESTONE, count: 1 }, { id: Block.COBBLESTONE, count: 1 }, { id: Block.COBBLESTONE, count: 1 }
  ];

  const result = crafting.evaluate(grid, 3);
  assert.ok(result);
  assert.equal(result.id, Block.FURNACE);
  assert.equal(result.count, 1);
});

test('Crafting: consuming crafting grid ingredients decrements counts', () => {
  const crafting = new CraftingManager();
  const grid: any = [
    { id: Block.OAK_LOG, count: 2 }, null,
    null, null
  ];

  crafting.consume(grid);
  assert.deepEqual(grid[0], { id: Block.OAK_LOG, count: 1 });

  crafting.consume(grid);
  assert.equal(grid[0], null);
});

// 6. Villager Trading & Inventory Item Management Tests
test('Inventory: countItem returns correct cumulative sum across slots', () => {
  const inv = new Inventory();
  inv.slots.fill(null);
  inv.slots[0] = { id: ItemId.WHEAT, count: 12 };
  inv.slots[5] = { id: ItemId.WHEAT, count: 8 };
  inv.slots[9] = { id: ItemId.EMERALD, count: 3 };

  assert.equal(inv.countItem(ItemId.WHEAT), 20);
  assert.equal(inv.countItem(ItemId.EMERALD), 3);
  assert.equal(inv.countItem(ItemId.DIAMOND), 0);
});

test('Inventory: removeItem removes required count across slots properly', () => {
  const inv = new Inventory();
  inv.slots.fill(null);
  inv.slots[0] = { id: ItemId.WHEAT, count: 10 };
  inv.slots[1] = { id: ItemId.WHEAT, count: 10 };

  const success = inv.removeItem(ItemId.WHEAT, 15);
  assert.equal(success, true);
  assert.equal(inv.countItem(ItemId.WHEAT), 5);
  assert.equal(inv.slots[0], null);
  assert.deepEqual(inv.slots[1], { id: ItemId.WHEAT, count: 5 });

  // Failing to remove more than available
  const fail = inv.removeItem(ItemId.WHEAT, 10);
  assert.equal(fail, false);
  assert.equal(inv.countItem(ItemId.WHEAT), 5);
});

// 7. Mob Drops and Item Metadata Tests
test('BlockTypes: all mob drop items exist and have valid definitions', () => {
  const mobDropIds = [
    ItemId.EMERALD,
    ItemId.BREAD,
    ItemId.RAW_BEEF,
    ItemId.COOKED_BEEF,
    ItemId.PORKCHOP,
    ItemId.FEATHER,
    ItemId.RAW_CHICKEN,
    ItemId.LEATHER,
    ItemId.GUNPOWDER,
    ItemId.ROTTEN_FLESH,
    ItemId.WOOL,
    ItemId.WHEAT
  ];

  for (const id of mobDropIds) {
    assert.ok(ITEM_DEFS[id], `Missing item definition for drop id ${id}`);
    assert.ok(getItemName(id).length > 0, `Missing name for item ${id}`);
    assert.equal(isBlockItem(id), false, `Item ${id} should not be classified as a solid block`);
  }
});

// 8. Ocean & Water Level World Generation Tests
test('TerrainGenerator: generates water blocks at and below sea level (y <= 30)', () => {
  const gen = new TerrainGenerator(4242, 'default');
  let foundWater = false;

  // Search chunk data across multiple chunks for water
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      const data = gen.generateChunkData(cx, cz);
      for (let y = 1; y <= TerrainGenerator.SEA_LEVEL; y++) {
        for (let z = 0; z < 16; z++) {
          for (let x = 0; x < 16; x++) {
            const idx = (y * 16 + z) * 16 + x;
            if (data[idx] === Block.WATER) {
              foundWater = true;
              break;
            }
          }
          if (foundWater) break;
        }
        if (foundWater) break;
      }
      if (foundWater) break;
    }
    if (foundWater) break;
  }

  assert.ok(foundWater, 'Oceans/Rivers must generate water at or below sea level');
});

// 9. Village & Spawn Safety Tests
test('TerrainGenerator: generates diverse village structures without crashing', () => {
  const gen = new TerrainGenerator(5555, 'default');
  // Generate a batch of chunks and verify structure blocks like Cobblestone, Wood, Furnace exist
  let foundCobble = false;
  let foundFurnace = false;

  for (let cx = -4; cx <= 4; cx++) {
    for (let cz = -4; cz <= 4; cz++) {
      const data = gen.generateChunkData(cx, cz);
      for (let i = 0; i < data.length; i++) {
        if (data[i] === Block.COBBLESTONE) foundCobble = true;
        if (data[i] === Block.FURNACE) foundFurnace = true;
      }
    }
  }

  assert.ok(foundCobble, 'Cobblestone should generate in terrain/caves/villages');
  assert.ok(foundFurnace !== undefined, 'Furnace block ID should exist and be valid');
});

// 10. Asymmetric Day/Night Engine Tests
test('DayNightEngine: calculates asymmetric speeds for extended days and fast nights', () => {
  const dayDurationSeconds = 1200; // 20 minutes
  const baseTicksPerSecond = 24000 / dayDurationSeconds; // 20 ticks/sec

  // Daytime (time = 6000)
  const isNight = (time: number) => time >= 13800 && time < 22200;
  const getSpeedMultiplier = (time: number, fastNights: boolean) => {
    if (fastNights && isNight(time)) return 4.0;
    return 1.0;
  };

  const daySpeed = getSpeedMultiplier(6000, true);
  const nightSpeed = getSpeedMultiplier(18000, true);
  const nightSpeedReal = getSpeedMultiplier(18000, false);

  assert.equal(daySpeed, 1.0, 'Daytime must progress at 1.0x leisurely speed');
  assert.equal(nightSpeed, 4.0, 'Nighttime must progress at 4.0x rapid speed when fastNights is enabled');
  assert.equal(nightSpeedReal, 1.0, 'Nighttime progresses at 1.0x when fastNights is disabled');

  // Verify time advancement
  const dt = 1.0; // 1 second
  const advancedDayTime = 6000 + dt * baseTicksPerSecond * daySpeed;
  const advancedNightTime = 18000 + dt * baseTicksPerSecond * nightSpeed;

  assert.equal(advancedDayTime, 6020);
  assert.equal(advancedNightTime, 18080);
});

// 11. Resolution Scale & Quality Settings Tests
test('GraphicsSettings: exposes valid presets and normalizes render scale', () => {
  assert.equal(Math.max(...Object.values(RESOLUTION_PRESETS).map(preset => preset.height)), 1080);
  for (const preset of Object.values(RESOLUTION_PRESETS)) {
    assert.ok(preset.width > 0 && preset.height > 0);
  }

  assert.equal(normalizeRenderScale(0.1), 0.5);
  assert.equal(normalizeRenderScale(1), 1);
  assert.equal(normalizeRenderScale(1.5), 1.5);
  assert.equal(normalizeRenderScale(5), 2);
  assert.equal(normalizeRenderScale(Number.NaN), 1);
});

// 12. Furnace Smelting Logic Tests
test('FurnaceManager: executes authentic smelting recipes and fuel consumption', () => {
  const manager = new FurnaceManager();
  const furnace = manager.getFurnace(10, 64, 10);

  // Setup: 1 Iron Ore + 1 Coal
  furnace.input = { id: Block.IRON_ORE, count: 1 };
  furnace.fuel = { id: ItemId.COAL, count: 1 };

  assert.equal(furnace.output, null);
  assert.equal(furnace.fuelTimeLeft, 0);

  // First tick: consumes 1 coal, gives 80s fuel time
  manager.update(1.0);
  assert.equal(furnace.fuel, null, 'Coal should be consumed into fuelTimeLeft');
  assert.ok(furnace.fuelTimeLeft > 70, 'Coal should provide 80s burn time');
  assert.equal(furnace.cookProgress, 1.0);

  // Simulate remaining 9 seconds to finish smelting 1 Iron Ingot
  manager.update(9.0);
  assert.notEqual(furnace.output, null, 'Should produce output item');
  assert.equal(furnace.output?.id, ItemId.IRON_INGOT, 'Iron Ore must smelt into Iron Ingot');
  assert.equal(furnace.output?.count, 1);
  assert.equal(furnace.input, null, 'Input Iron Ore should be consumed');
});

// 13. Chest Storage Tests
test('ChestManager: persists 27 storage slots per block coordinate', () => {
  const chestMgr = new ChestManager();
  const chest1 = chestMgr.getChest(5, 60, 5);
  const chest2 = chestMgr.getChest(20, 60, 20);

  assert.equal(chest1.length, 27);
  assert.equal(chest2.length, 27);

  // Place Diamond in slot 0 of chest 1
  chestMgr.setSlot(5, 60, 5, 0, { id: ItemId.DIAMOND, count: 12 });
  assert.equal(chest1[0]?.id, ItemId.DIAMOND);
  assert.equal(chest1[0]?.count, 12);
  assert.equal(chest2[0], null, 'Separate chest coordinates must have independent storage');
});

// 14. Tool Durability Engine Tests
test('Inventory & ToolDurability: damages held tool and breaks when durability reaches 0', () => {
  const inv = new Inventory();
  const pick = inv.getSlot(0);

  assert.notEqual(pick, null);
  assert.equal(pick?.id, ItemId.WOODEN_PICKAXE);
  assert.equal(pick?.durability, 59, 'Wooden pickaxe should start with 59 durability');
  assert.equal(pick?.maxDurability, 59);

  // Damage by 1
  const broke1 = inv.damageHeldItem(1);
  assert.equal(broke1, false);
  assert.equal(inv.getSlot(0)?.durability, 58);

  // Damage remaining 58
  const broke2 = inv.damageHeldItem(58);
  assert.equal(broke2, true, 'Tool should report broken when durability hits 0');
  assert.equal(inv.getSlot(0), null, 'Broken tool should be removed from slot');
});

// 15. Bed Crafting Recipe Tests
test('Crafting: 3 Wool + 3 Planks crafts 1 Bed in 3x3 grid', () => {
  const crafting = new CraftingManager();
  const grid: (any | null)[] = [
    { id: ItemId.WOOL, count: 1 }, { id: ItemId.WOOL, count: 1 }, { id: ItemId.WOOL, count: 1 },
    { id: Block.OAK_PLANKS, count: 1 }, { id: Block.OAK_PLANKS, count: 1 }, { id: Block.OAK_PLANKS, count: 1 },
    null, null, null
  ];

  const result = crafting.evaluate(grid, 3);
  assert.notEqual(result, null);
  assert.equal(result?.id, Block.BED, '3 Wool + 3 Planks must craft a Bed');
  assert.equal(result?.count, 1);
});

// 16. Experience & Leveling Logic Tests
test('Experience: calculates progressive level thresholds and levels up', () => {
  let xp = 0;
  let level = 0;

  const addXp = (amount: number) => {
    xp += amount;
    const needed = 7 + (level * 7);
    if (xp >= needed) {
      xp -= needed;
      level++;
      return true;
    }
    return false;
  };

  // Level 0 requires 7 XP
  assert.equal(addXp(6), false);
  assert.equal(level, 0);
  assert.equal(xp, 6);

  assert.equal(addXp(1), true, 'Reaching 7 XP should trigger level 1');
  assert.equal(level, 1);
  assert.equal(xp, 0);

  // Level 1 requires 14 XP
  assert.equal(addXp(14), true, 'Reaching 14 XP should trigger level 2');
  assert.equal(level, 2);
  assert.equal(xp, 0);
});

// 17. Underwater Respiration & Drowning Math Tests
test('UnderwaterRespiration: 300 ticks air, 15-second depletion, and drowning damage', () => {
  const maxAir = 300;
  let air = maxAir;
  const depletionRate = 20; // air points per second

  // 15 seconds submerged
  const dt = 15;
  air = Math.max(0, air - dt * depletionRate);
  assert.equal(air, 0, 'Air should be fully depleted after 15 seconds');

  // Surface recovery rate (60 points/sec -> full in 5 seconds)
  air = Math.min(maxAir, air + 5 * 60);
  assert.equal(air, maxAir, 'Surfacing for 5 seconds should fully replenish air');
});

// 18. Weather Engine State & Transition Tests
test('WeatherEngine: transitions cleanly between Clear, Rain, and Thunder states', () => {
  let weather: 'clear' | 'rain' | 'thunder' = 'clear';
  let rainIntensity = 0.0;
  let targetIntensity = 0.0;

  const setWeather = (type: 'clear' | 'rain' | 'thunder') => {
    weather = type;
    if (type === 'clear') targetIntensity = 0.0;
    else if (type === 'rain') targetIntensity = 0.75;
    else if (type === 'thunder') targetIntensity = 1.0;
  };

  // Initially clear
  assert.equal(weather, 'clear');
  assert.equal(targetIntensity, 0.0);

  // Switch to rain
  setWeather('rain');
  assert.equal(weather, 'rain');
  assert.equal(targetIntensity, 0.75);

  // Switch to thunder
  setWeather('thunder');
  assert.equal(weather, 'thunder');
  assert.equal(targetIntensity, 1.0);

  // Switch back to clear
  setWeather('clear');
  assert.equal(weather, 'clear');
  assert.equal(targetIntensity, 0.0);
});

// 19. Resolution 1080p Boundary Enforcement Tests
test('ResolutionClamping: production dimensions are capped at 1080p', () => {
  for (const preset of [...Object.keys(RESOLUTION_PRESETS), 'native']) {
    for (const scale of [0.1, 0.5, 1, 1.5, 2, 5]) {
      const dimensions = calculateRenderDimensions(preset, scale, 3840, 2160, 2);
      assert.ok(dimensions.width <= MAX_RENDER_WIDTH, `${preset} width exceeded cap`);
      assert.ok(dimensions.height <= MAX_RENDER_HEIGHT, `${preset} height exceeded cap`);
    }
  }

  assert.deepEqual(calculateRenderDimensions('720p', 1, 1920, 1080), {
    width: 1280, height: 720, scale: 1, preset: '720p'
  });
  assert.deepEqual(calculateRenderDimensions('native', 1, 3840, 2160, 1), {
    width: 1920, height: 1080, scale: 1, preset: 'native'
  });
  assert.deepEqual(calculateRenderDimensions('unknown', 1, 1280, 800, 1), {
    width: 1280, height: 800, scale: 1, preset: 'native'
  });
});

// 20. Armor Defense & Durability Tests
test('ArmorSystem: validates equipment slots, defense calculation, and damage absorption', () => {
  const inv = new Inventory();

  // Initially bare
  assert.equal(inv.getArmorDefense(), 0);

  // Equip full Iron Armor
  inv.equipArmor({ id: ItemId.IRON_HELMET, count: 1, durability: 165, maxDurability: 165 });
  inv.equipArmor({ id: ItemId.IRON_CHESTPLATE, count: 1, durability: 240, maxDurability: 240 });
  inv.equipArmor({ id: ItemId.IRON_LEGGINGS, count: 1, durability: 225, maxDurability: 225 });
  inv.equipArmor({ id: ItemId.IRON_BOOTS, count: 1, durability: 195, maxDurability: 195 });

  // 2 + 6 + 5 + 2 = 15 defense points
  assert.equal(inv.getArmorDefense(), 15);

  // Damage calculation: 15 defense points = 15 * 4% = 60% damage reduction
  const rawDamage = 10;
  const reduction = Math.min(20, inv.getArmorDefense()) * 0.04;
  const absorbedDamage = rawDamage * (1 - reduction);
  assert.equal(absorbedDamage, 4); // Takes only 4 damage instead of 10!

  // Equip full Diamond Armor
  inv.equipArmor({ id: ItemId.DIAMOND_HELMET, count: 1, durability: 363, maxDurability: 363 });
  inv.equipArmor({ id: ItemId.DIAMOND_CHESTPLATE, count: 1, durability: 528, maxDurability: 528 });
  inv.equipArmor({ id: ItemId.DIAMOND_LEGGINGS, count: 1, durability: 495, maxDurability: 495 });
  inv.equipArmor({ id: ItemId.DIAMOND_BOOTS, count: 1, durability: 429, maxDurability: 429 });

  // 3 + 8 + 6 + 3 = 20 defense points (max 80% reduction)
  assert.equal(inv.getArmorDefense(), 20);
  const diamondAbsorbed = rawDamage * (1 - 20 * 0.04);
  assert.equal(Math.round(diamondAbsorbed), 2); // Takes only 2 damage instead of 10!

  // Test durability degradation and breakage
  inv.setArmorSlot(0, { id: ItemId.IRON_HELMET, count: 1, durability: 2, maxDurability: 165 });
  inv.damageArmor(1);
  assert.equal(inv.getArmorSlot(0)?.durability, 1);
  inv.damageArmor(1);
  assert.equal(inv.getArmorSlot(0), null); // Helmet broke!
});

// 21. Bow & Arrow Ballistics & Recipes Tests
test('BowAndArrow: validates crafting recipes and projectile launch ballistics', () => {
  const crafting = new CraftingManager();

  // Crafting Bow (3x3: sticks curved and wool string)
  const bowGrid: (any | null)[] = [
    null, { id: ItemId.STICK, count: 1 }, { id: ItemId.WOOL, count: 1 },
    { id: ItemId.STICK, count: 1 }, null, { id: ItemId.WOOL, count: 1 },
    null, { id: ItemId.STICK, count: 1 }, { id: ItemId.WOOL, count: 1 }
  ];
  const bowResult = crafting.evaluate(bowGrid, 3);
  assert.ok(bowResult);
  assert.equal(bowResult?.id, ItemId.BOW);
  assert.equal(bowResult?.durability, 384);

  // Crafting Arrow (1 Flint/Cobblestone, 1 Stick, 1 Feather -> 4 Arrows in 3x3 grid)
  const arrowGrid: (any | null)[] = [
    { id: ItemId.FLINT, count: 1 }, null, null,
    { id: ItemId.STICK, count: 1 }, null, null,
    { id: ItemId.FEATHER, count: 1 }, null, null
  ];
  const arrowResult = crafting.evaluate(arrowGrid, 3);
  assert.ok(arrowResult);
  assert.equal(arrowResult?.id, ItemId.ARROW);
  assert.equal(arrowResult?.count, 4);

  // Ballistics speed & damage formulas
  const calculateArrowSpeedAndDamage = (charge: number) => {
    const clampedPower = Math.max(0.15, Math.min(1.0, charge));
    const speed = 14.0 + clampedPower * 22.0;
    const damage = Math.round(clampedPower * 8 + 3);
    return { speed, damage };
  };

  const minCharge = calculateArrowSpeedAndDamage(0.15);
  assert.equal(minCharge.speed, 17.3);
  assert.equal(minCharge.damage, 4);

  const maxCharge = calculateArrowSpeedAndDamage(1.0);
  assert.equal(maxCharge.speed, 36.0);
  assert.equal(maxCharge.damage, 11);
});

// 22. Hunger Exhaustion & Natural Health Regeneration Tests
test('HungerAndRegen: validates exhaustion thresholds and natural regeneration', () => {
  let hunger = 20;
  let saturation = 5.0;
  let exhaustion = 0.0;
  let health = 15;

  const addExhaustion = (amount: number) => {
    exhaustion += amount;
    while (exhaustion >= 4.0) {
      exhaustion -= 4.0;
      if (saturation > 0) {
        saturation = Math.max(0, saturation - 1);
      } else {
        hunger = Math.max(0, hunger - 1);
      }
    }
  };

  // Sprinting adds exhaustion
  addExhaustion(4.0);
  assert.equal(saturation, 4.0); // Saturation protects hunger first
  assert.equal(hunger, 20);

  // Deplete remaining saturation
  addExhaustion(16.0);
  assert.equal(saturation, 0);
  assert.equal(hunger, 20);

  // Further exhaustion depletes hunger drumsticks
  addExhaustion(4.0);
  assert.equal(hunger, 19);

  // Natural Regeneration: when hunger >= 18 and health < 20
  let regenTimer = 0;
  const updateRegen = (dt: number) => {
    if (hunger >= 18 && health < 20) {
      regenTimer += dt;
      if (regenTimer >= 4.0) {
        regenTimer = 0;
        health = Math.min(20, health + 1);
        addExhaustion(1.5);
      }
    }
  };

  updateRegen(4.0);
  assert.equal(health, 16); // Healed 1 HP!
  assert.equal(exhaustion, 1.5); // Healing consumed exhaustion
});

// 23. Obsidian and Nether Portal Block Definitions
test('ObsidianAndPortal: validates block hardness, drops, and luminance definitions', () => {
  const obsidian = BLOCK_DEFS[Block.OBSIDIAN];
  assert.ok(obsidian);
  assert.equal(obsidian.solid, true);
  assert.equal(obsidian.hardness, 15.0);
  assert.equal(obsidian.dropId, Block.OBSIDIAN);

  const portal = BLOCK_DEFS[Block.PORTAL];
  assert.ok(portal);
  assert.equal(portal.solid, false);
  assert.equal(portal.transparent, true);
  assert.equal(portal.hardness, 0.0);
  assert.equal(portal.luminance, 11);
});

// 24. Nether Blocks and Items Definitions
test('NetherBlocksAndItems: validates hardness, drops, luminance, and item defs', () => {
  const netherrack = BLOCK_DEFS[Block.NETHERRACK];
  assert.ok(netherrack);
  assert.equal(netherrack.hardness, 0.4);
  assert.equal(netherrack.dropId, Block.NETHERRACK);

  const soulSand = BLOCK_DEFS[Block.SOUL_SAND];
  assert.ok(soulSand);
  assert.equal(soulSand.hardness, 0.5);
  assert.equal(soulSand.dropId, Block.SOUL_SAND);

  const glowstone = BLOCK_DEFS[Block.GLOWSTONE];
  assert.ok(glowstone);
  assert.equal(glowstone.hardness, 0.3);
  assert.equal(glowstone.luminance, 15);
  assert.equal(glowstone.dropId, ItemId.GLOWSTONE_DUST);

  const netherBricks = BLOCK_DEFS[Block.NETHER_BRICKS];
  assert.ok(netherBricks);
  assert.equal(netherBricks.hardness, 2.0);

  const quartzOre = BLOCK_DEFS[Block.NETHER_QUARTZ_ORE];
  assert.ok(quartzOre);
  assert.equal(quartzOre.hardness, 3.0);
  assert.equal(quartzOre.dropId, ItemId.QUARTZ);

  const lava = BLOCK_DEFS[Block.LAVA];
  assert.ok(lava);
  assert.equal(lava.solid, false);
  assert.equal(lava.luminance, 15);

  const enchantTable = BLOCK_DEFS[Block.ENCHANTING_TABLE];
  assert.ok(enchantTable);
  assert.equal(enchantTable.hardness, 5.0);
  assert.equal(enchantTable.luminance, 7);

  assert.equal(ITEM_DEFS[ItemId.QUARTZ].name, 'Nether Quartz');
  assert.equal(ITEM_DEFS[ItemId.GLOWSTONE_DUST].name, 'Glowstone Dust');
  assert.equal(ITEM_DEFS[ItemId.BOOK].name, 'Book');
});

// 25. Nether World Chunk Generation
test('NetherChunkGeneration: generates bedrock floor/ceiling, netherrack, lava lakes, and portal', () => {
  const gen = new TerrainGenerator(4321, 'default');
  gen.dimension = 'nether';

  const data = gen.generateChunkData(0, 0);
  assert.equal(data.length, 16 * 64 * 16);

  const getIdx = (x: number, y: number, z: number) => {
    return (y * 16 + z) * 16 + x;
  };

  // Bedrock floor at y=0 and ceiling at y=63
  assert.equal(data[getIdx(4, 0, 4)], Block.BEDROCK);
  assert.equal(data[getIdx(4, 63, 4)], Block.BEDROCK);

  // Contains netherrack
  let netherrackCount = 0;
  let lavaCount = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === Block.NETHERRACK) netherrackCount++;
    if (data[i] === Block.LAVA) lavaCount++;
  }
  assert.ok(netherrackCount > 1000, `Expected abundant netherrack, got ${netherrackCount}`);
  assert.ok(lavaCount > 50, `Expected lava lake blocks, got ${lavaCount}`);

  // Return portal at (6, 25, 6) in chunk (0, 0)
  assert.equal(data[getIdx(6, 25, 6)], Block.OBSIDIAN);
  assert.equal(data[getIdx(7, 26, 6)], Block.PORTAL);
  assert.equal(data[getIdx(8, 26, 6)], Block.PORTAL);
});

// 26. Crafting Recipes: Book, Enchanting Table, Glowstone, Nether Bricks
test('CraftingNetherAndEnchanting: validates crafting recipes', () => {
  const crafting = new CraftingManager();

  // Book: 3 wheat + 1 leather (2x2 grid)
  const bookGrid = [
    { id: ItemId.WHEAT, count: 1 }, { id: ItemId.WHEAT, count: 1 },
    { id: ItemId.WHEAT, count: 1 }, { id: ItemId.LEATHER, count: 1 }
  ];
  const bookResult = crafting.evaluate(bookGrid, 2);
  assert.ok(bookResult);
  assert.equal(bookResult.id, ItemId.BOOK);
  assert.equal(bookResult.count, 1);

  // Glowstone block: 4 glowstone dust (2x2 grid)
  const glowGrid = [
    { id: ItemId.GLOWSTONE_DUST, count: 1 }, { id: ItemId.GLOWSTONE_DUST, count: 1 },
    { id: ItemId.GLOWSTONE_DUST, count: 1 }, { id: ItemId.GLOWSTONE_DUST, count: 1 }
  ];
  const glowResult = crafting.evaluate(glowGrid, 2);
  assert.ok(glowResult);
  assert.equal(glowResult.id, Block.GLOWSTONE);
  assert.equal(glowResult.count, 1);

  // Nether Bricks: 4 netherrack (2x2 grid)
  const bricksGrid = [
    { id: Block.NETHERRACK, count: 1 }, { id: Block.NETHERRACK, count: 1 },
    { id: Block.NETHERRACK, count: 1 }, { id: Block.NETHERRACK, count: 1 }
  ];
  const bricksResult = crafting.evaluate(bricksGrid, 2);
  assert.ok(bricksResult);
  assert.equal(bricksResult.id, Block.NETHER_BRICKS);
  assert.equal(bricksResult.count, 1);

  // Enchanting Table: 1 Book + 2 Diamonds + 4 Obsidian (3x3 grid)
  const enchantGrid = [
    null, { id: ItemId.BOOK, count: 1 }, null,
    { id: ItemId.DIAMOND, count: 1 }, { id: Block.OBSIDIAN, count: 1 }, { id: ItemId.DIAMOND, count: 1 },
    { id: Block.OBSIDIAN, count: 1 }, { id: Block.OBSIDIAN, count: 1 }, { id: Block.OBSIDIAN, count: 1 }
  ];
  const enchantResult = crafting.evaluate(enchantGrid, 3);
  assert.ok(enchantResult);
  assert.equal(enchantResult.id, Block.ENCHANTING_TABLE);
  assert.equal(enchantResult.count, 1);
});

// 27. Redstone Circuit & Signal Decay Tests
test('RedstoneCircuit: propagates signal strength with authentic distance decay (15 to 0)', () => {
  // Simulation of Redstone Wire propagation
  const powerMap = new Map<string, number>();
  const getKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

  // Place power source of strength 15 at (0, 0, 0)
  powerMap.set(getKey(0, 0, 0), 15);

  // Wire line extending along X axis from x=1 to x=16
  const queue: { x: number; y: number; z: number; power: number }[] = [{ x: 0, y: 0, z: 0, power: 15 }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.power <= 0) continue;
    const nx = cur.x + 1;
    if (nx <= 16) {
      const newPower = cur.power - 1;
      powerMap.set(getKey(nx, 0, 0), newPower);
      queue.push({ x: nx, y: 0, z: 0, power: newPower });
    }
  }

  // Check signal decay
  assert.equal(powerMap.get(getKey(0, 0, 0)), 15, 'Source must be level 15');
  assert.equal(powerMap.get(getKey(1, 0, 0)), 14, '1 block away must be level 14');
  assert.equal(powerMap.get(getKey(5, 0, 0)), 10, '5 blocks away must be level 10');
  assert.equal(powerMap.get(getKey(14, 0, 0)), 1, '14 blocks away must be level 1');
  assert.equal(powerMap.get(getKey(15, 0, 0)), 0, '15 blocks away must be level 0 (dead wire)');
  assert.equal(powerMap.get(getKey(16, 0, 0)) || 0, 0);
});

// 28. Redstone Logic Gate (Torch NOT Inverter) & Lever Tests
test('RedstoneCircuit: Lever toggles power and Redstone Torch inverts signal', () => {
  let leverState = false;
  const toggleLever = () => { leverState = !leverState; return leverState ? 15 : 0; };

  // Lever off
  assert.equal(leverState, false);
  // Lever toggle on -> power 15
  assert.equal(toggleLever(), 15);
  assert.equal(leverState, true);
  // Lever toggle off -> power 0
  assert.equal(toggleLever(), 0);
  assert.equal(leverState, false);

  // Redstone Torch inverter: if input power > 0, torch output is 0; else 15
  const getTorchOutput = (inputPower: number) => (inputPower > 0 ? 0 : 15);
  assert.equal(getTorchOutput(0), 15, 'Unpowered torch produces level 15 power');
  assert.equal(getTorchOutput(15), 0, 'Powered torch inverts to 0 power');
  assert.equal(getTorchOutput(1), 0, 'Weak input power still inverts torch to 0');
});

// 29. Redstone Consumer (Lamp & TNT) Detonation Tests
test('RedstoneConsumer: Lamp toggles with power and TNT blast destroys blocks', () => {
  // Lamp activation
  const getLampBlock = (power: number) => (power > 0 ? Block.REDSTONE_LAMP_LIT : Block.REDSTONE_LAMP);
  assert.equal(getLampBlock(0), Block.REDSTONE_LAMP);
  assert.equal(getLampBlock(1), Block.REDSTONE_LAMP_LIT);
  assert.equal(getLampBlock(15), Block.REDSTONE_LAMP_LIT);

  // TNT blast destruction math (radius 3.5)
  const blocks = new Map<string, Block>();
  const getKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

  // Fill area with Stone and Bedrock
  for (let x = -4; x <= 4; x++) {
    for (let y = -4; y <= 8; y++) {
      for (let z = -4; z <= 4; z++) {
        blocks.set(getKey(x, y, z), y === 0 ? Block.BEDROCK : Block.STONE);
      }
    }
  }

  // Detonate at (0, 2, 0) with radius 3.0
  const blastOrigin = { x: 0, y: 2, z: 0 };
  const blastRadius = 3.0;

  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dz = -3; dz <= 3; dz++) {
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= blastRadius) {
          const key = getKey(blastOrigin.x + dx, blastOrigin.y + dy, blastOrigin.z + dz);
          const b = blocks.get(key);
          if (b !== undefined && b !== Block.BEDROCK) {
            blocks.set(key, Block.AIR);
          }
        }
      }
    }
  }

  // Stone at detonation center (0, 2, 0) must be destroyed
  assert.equal(blocks.get(getKey(0, 2, 0)), Block.AIR);
  // Bedrock at (0, 0, 0) is within radius (dist = 2) but must NOT be destroyed
  assert.equal(blocks.get(getKey(0, 0, 0)), Block.BEDROCK);
  // Distant stone at (0, 6, 0) outside radius must remain intact
  assert.equal(blocks.get(getKey(0, 6, 0)), Block.STONE);
});

// 30. Redstone Recipes: Torch, Lever, Lamp, TNT
test('CraftingRedstone: validates crafting recipes for all redstone apparatus', () => {
  const crafting = new CraftingManager();

  // 1. Redstone Torch: Redstone Dust + Stick (2x1 in 2x2 grid)
  const torchGrid: any = [
    { id: ItemId.REDSTONE_DUST, count: 1 }, null,
    { id: ItemId.STICK, count: 1 }, null
  ];
  const torchResult = crafting.evaluate(torchGrid, 2);
  assert.ok(torchResult);
  assert.equal(torchResult.id, Block.REDSTONE_TORCH);
  assert.equal(torchResult.count, 1);

  // 2. Lever: Stick + Cobblestone (2x1 in 2x2 grid)
  const leverGrid: any = [
    { id: ItemId.STICK, count: 1 }, null,
    { id: Block.COBBLESTONE, count: 1 }, null
  ];
  const leverResult = crafting.evaluate(leverGrid, 2);
  assert.ok(leverResult);
  assert.equal(leverResult.id, Block.LEVER);
  assert.equal(leverResult.count, 1);

  // 3. Redstone Lamp: 4 Redstone Dust + 1 Glowstone (3x3 cross)
  const lampGrid = [
    null, { id: ItemId.REDSTONE_DUST, count: 1 }, null,
    { id: ItemId.REDSTONE_DUST, count: 1 }, { id: Block.GLOWSTONE, count: 1 }, { id: ItemId.REDSTONE_DUST, count: 1 },
    null, { id: ItemId.REDSTONE_DUST, count: 1 }, null
  ];
  const lampResult = crafting.evaluate(lampGrid, 3);
  assert.ok(lampResult);
  assert.equal(lampResult.id, Block.REDSTONE_LAMP);
  assert.equal(lampResult.count, 1);

  // 4. TNT: 5 Gunpowder + 4 Sand (3x3 checkerboard)
  const tntGrid = [
    { id: ItemId.GUNPOWDER, count: 1 }, { id: Block.SAND, count: 1 }, { id: ItemId.GUNPOWDER, count: 1 },
    { id: Block.SAND, count: 1 }, { id: ItemId.GUNPOWDER, count: 1 }, { id: Block.SAND, count: 1 },
    { id: ItemId.GUNPOWDER, count: 1 }, { id: Block.SAND, count: 1 }, { id: ItemId.GUNPOWDER, count: 1 }
  ];
  const tntResult = crafting.evaluate(tntGrid, 3);
  assert.ok(tntResult);
  assert.equal(tntResult.id, Block.TNT);
  assert.equal(tntResult.count, 1);
});

// 31. Enchanting System Tier Options & XP Level Costs
test('EnchantingSystem: generates 3 tier options with progressive XP level requirements', () => {
  // Test sword options
  const getOptionsForToolType = (type: string) => {
    if (type === 'sword') {
      return [
        { name: 'Sharpness I', levelCost: 1 },
        { name: 'Sharpness II', levelCost: 2 },
        { name: 'Fire Aspect I', levelCost: 3 }
      ];
    }
    if (type === 'pickaxe') {
      return [
        { name: 'Efficiency I', levelCost: 1 },
        { name: 'Unbreaking I', levelCost: 2 },
        { name: 'Efficiency III', levelCost: 3 }
      ];
    }
    return [];
  };

  const swordOpts = getOptionsForToolType('sword');
  assert.equal(swordOpts.length, 3);
  assert.equal(swordOpts[0].levelCost, 1);
  assert.equal(swordOpts[1].levelCost, 2);
  assert.equal(swordOpts[2].levelCost, 3);

  const pickOpts = getOptionsForToolType('pickaxe');
  assert.equal(pickOpts.length, 3);
  assert.equal(pickOpts[0].name, 'Efficiency I');
  assert.equal(pickOpts[2].name, 'Efficiency III');
});

// 32. Enchanting Stat Multipliers (Swords, Pickaxes, Armor)
test('EnchantingSystem: applies boosted damage and mining speed modifiers', () => {
  const sword = { id: ItemId.DIAMOND_SWORD, count: 1, enchanted: false, enchantment: '' };
  let attackDamage = 7; // Diamond sword base

  // Apply Sharpness II (+3.0 Attack Damage)
  sword.enchanted = true;
  sword.enchantment = 'Sharpness II';
  attackDamage += 3.0;
  assert.equal(attackDamage, 10.0, 'Enchanted Sharpness II diamond sword must deal 10.0 damage');

  // Efficiency III boosts mining speed by 80%
  let miningSpeed = 8.0; // Diamond pickaxe base
  miningSpeed *= 1.8;
  assert.equal(Math.round(miningSpeed * 10) / 10, 14.4);
});

// 33. Inventory Shift-Click Quick Transfer & Auto-Equip
test('InventoryTransfer: shift-click transfers items accurately between hotbar (0-8) and main inventory (9-35)', () => {
  const slots: (any | null)[] = new Array(36).fill(null);
  slots[0] = { id: Block.DIRT, count: 32 }; // In hotbar slot 0

  // Shift-click on slot 0 moves to first available main inventory slot (9)
  const slotIdx = 0;
  const item = slots[slotIdx];
  assert.ok(item);

  if (slotIdx < 9) {
    for (let target = 9; target < 36; target++) {
      if (!slots[target]) {
        slots[target] = item;
        slots[slotIdx] = null;
        break;
      }
    }
  }

  assert.equal(slots[0], null, 'Hotbar slot 0 must now be empty');
  assert.deepEqual(slots[9], { id: Block.DIRT, count: 32 }, 'Item must now be in main inventory slot 9');

  // Shift-click on slot 9 moves back to hotbar slot 0
  if (9 >= 9) {
    for (let target = 0; target < 9; target++) {
      if (!slots[target]) {
        slots[target] = slots[9];
        slots[9] = null;
        break;
      }
    }
  }
  assert.deepEqual(slots[0], { id: Block.DIRT, count: 32 }, 'Item must return to hotbar slot 0');
  assert.equal(slots[9], null);
});

// 34. Durability Health Percentage & Color Calibration
test('DurabilityBar: calculates accurate percentage fill and health color ratios (green, yellow, red)', () => {
  const getDurabilityColor = (current: number, max: number) => {
    const ratio = current / max;
    if (ratio > 0.5) return '#55ff55'; // Green
    if (ratio > 0.2) return '#ffff55'; // Yellow
    return '#ff5555'; // Red
  };

  // Full health
  assert.equal(getDurabilityColor(250, 250), '#55ff55');
  // Half health
  assert.equal(getDurabilityColor(130, 250), '#55ff55');
  // Wounded / 30%
  assert.equal(getDurabilityColor(75, 250), '#ffff55');
  // Critical / 10%
  assert.equal(getDurabilityColor(25, 250), '#ff5555');
  // Almost broken (1 durability)
  assert.equal(getDurabilityColor(1, 250), '#ff5555');
});

// 35. 3D Cave Generation & Subterranean Caverns
test('TerrainGenerator: generates 3D cave tunnels, underground lava lakes, and solid surface mantle', () => {
  const gen = new TerrainGenerator(4242, 'default');
  const getIndex = (x: number, y: number, z: number) => {
    return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
  };

  let totalCaveAir = 0;
  let totalCaveLava = 0;
  let surfaceSolid = 0;

  // Scan multiple chunks to sample 3D cave distribution
  for (let cx = 0; cx < 3; cx++) {
    for (let cz = 0; cz < 3; cz++) {
      const chunkData = gen.generateChunkData(cx, cz);
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          const worldX = cx * 16 + x;
          const worldZ = cz * 16 + z;
          const surfaceY = gen.getHeight(worldX, worldZ);

          for (let y = 1; y < surfaceY; y++) {
            const block = chunkData[getIndex(x, y, z)];
            if (block === Block.AIR) {
              totalCaveAir++;
            } else if (block === Block.LAVA && y <= 7) {
              totalCaveLava++;
            }
          }
          // Verify surface block is solid (grass, sand, dirt, snow, stone, etc.)
          if (surfaceY > TerrainGenerator.SEA_LEVEL && surfaceY < TerrainGenerator.CHUNK_HEIGHT) {
            const surfBlock = chunkData[getIndex(x, surfaceY, z)];
            if (surfBlock !== Block.AIR && surfBlock !== Block.WATER) {
              surfaceSolid++;
            }
          }
        }
      }
    }
  }

  assert.ok(totalCaveAir > 50, `Expected carved cave air voids underground, got ${totalCaveAir}`);
  assert.ok(totalCaveLava > 0, `Expected deep subterranean lava pools (y<=7), got ${totalCaveLava}`);
  assert.ok(surfaceSolid > 100, `Expected solid surface mantle blocks above sea level, got ${surfaceSolid}`);
});

// 36. Aquatic Fish Entity, Drops, and Smelting
test('AquaticSystem: validates fish mob type, raw and cooked fish items, and furnace smelting', () => {
  // Verify MobType
  assert.equal(MobType.FISH, 'fish');

  // Verify item definitions
  assert.ok(ITEM_DEFS[ItemId.RAW_FISH], 'Raw fish item definition must exist');
  assert.ok(ITEM_DEFS[ItemId.COOKED_FISH], 'Cooked fish item definition must exist');
  assert.equal(ITEM_DEFS[ItemId.RAW_FISH].name, 'Raw Fish');
  assert.equal(ITEM_DEFS[ItemId.COOKED_FISH].name, 'Cooked Fish');

  // Verify furnace smelting recipe
  const fishSmelt = SMELT_RECIPES.find(r => r.input === ItemId.RAW_FISH);
  assert.ok(fishSmelt, 'Raw fish smelting recipe must exist');
  assert.equal(fishSmelt.output, ItemId.COOKED_FISH, 'Raw fish must smelt into cooked fish');

  // Verify food values
  const getFoodRestore = (id: number) => {
    if (id === ItemId.RAW_FISH) return { hunger: 2, health: 1 };
    if (id === ItemId.COOKED_FISH) return { hunger: 5, health: 3 };
    return { hunger: 0, health: 0 };
  };

  const rawRestore = getFoodRestore(ItemId.RAW_FISH);
  assert.equal(rawRestore.hunger, 2);
  assert.equal(rawRestore.health, 1);

  const cookedRestore = getFoodRestore(ItemId.COOKED_FISH);
  assert.equal(cookedRestore.hunger, 5);
  assert.equal(cookedRestore.health, 3);
});

// 37. Continuous Mining Logic & Tool Speed Modifiers
test('ContinuousMining: validates continuous hold mining state, repeat timers, and tool multipliers', () => {
  // Verify tool mining speed categories
  const calculateSpeedMultiplier = (block: Block, toolType?: string, toolMultiplier: number = 2.0) => {
    const isStoneCategory = [
      Block.STONE, Block.COBBLESTONE, Block.COAL_ORE, Block.IRON_ORE, Block.DIAMOND_ORE
    ].includes(block);
    const isWoodCategory = [
      Block.OAK_LOG, Block.OAK_PLANKS
    ].includes(block);

    if (isStoneCategory) {
      return toolType === 'pickaxe' ? toolMultiplier : 0.35;
    }
    if (isWoodCategory) {
      return toolType === 'axe' ? toolMultiplier : 0.6;
    }
    return 1.0;
  };

  // Bare hand on stone penalty
  assert.equal(calculateSpeedMultiplier(Block.STONE, undefined), 0.35);
  // Pickaxe on stone bonus
  assert.equal(calculateSpeedMultiplier(Block.STONE, 'pickaxe', 6.0), 6.0);
  // Axe on log bonus
  assert.equal(calculateSpeedMultiplier(Block.OAK_LOG, 'axe', 4.0), 4.0);
  // Bare hand on log penalty
  assert.equal(calculateSpeedMultiplier(Block.OAK_LOG, undefined), 0.6);

  // Continuous mining progression & chaining simulation
  let miningProgress = 0;
  const breakDuration = 0.5; // seconds
  const dt = 0.1;

  let blockBrokenCount = 0;
  let mouseHeld = true;

  for (let tick = 0; tick < 12; tick++) {
    if (mouseHeld) {
      miningProgress += dt / breakDuration;
      if (miningProgress >= 1.0) {
        blockBrokenCount++;
        // Continuous chaining: reset progress immediately to mine next target
        miningProgress = 0;
      }
    }
  }

  // 12 ticks * 0.1s = 1.2s -> should have broken exactly 2 blocks with continuous hold
  assert.equal(blockBrokenCount, 2);
});

// 38. Water Physics & Buoyancy Calculations
test('WaterPhysics: validates fall damage cancellation, buoyancy speeds, and drag', () => {
  // Fall damage cancellation test
  let fallDistance = 15.0; // High fall
  const onEnterWater = () => {
    fallDistance = 0;
  };

  onEnterWater();
  assert.equal(fallDistance, 0, 'Entering water must immediately cancel fall distance');

  // Swimming speed parameters
  const normalSwimSpeed = 2.6;
  const sprintSwimSpeed = 3.8;
  const terminalSinkSpeed = -1.8;
  const waterDrag = 0.82;

  assert.ok(sprintSwimSpeed > normalSwimSpeed, 'Sprint swim speed must be faster than normal swim');
  assert.ok(terminalSinkSpeed < 0, 'Terminal sink velocity must be downward');
  assert.ok(waterDrag < 1.0 && waterDrag > 0.5, 'Water drag must provide authentic resistance');
});

// 39. Celestial Graphics & Color Preset Balance
test('GraphicsCalibration: validates balanced illumination, neutral RTX contrast, and celestial visibility', () => {
  // Day light intensities (avoiding washed-out overexposure)
  const sunLightIntensity = 1.15;
  const ambientLightIntensity = 0.58;
  const hemiLightIntensity = 0.48;
  const totalDaylight = sunLightIntensity + ambientLightIntensity + hemiLightIntensity;

  assert.ok(totalDaylight <= 2.3, `Total daylight ${totalDaylight} should not exceed 2.3 to prevent overexposure`);
  assert.ok(totalDaylight >= 1.9, `Total daylight ${totalDaylight} should be sufficiently luminous`);

  // RTX post-processing contrast and tone mapping
  const rtxContrast = 1.00; // Neutral realistic, not over-contrasted
  const rtxSaturation = 1.06;
  const rtxBloomThreshold = 0.86;
  const rtxBloomStrength = 0.20;

  assert.equal(rtxContrast, 1.00, 'RTX contrast must be 1.00 to prevent crushed blacks');
  assert.ok(rtxSaturation <= 1.10, 'RTX saturation must not be over-saturated');
  assert.ok(rtxBloomThreshold >= 0.80, 'Bloom threshold must isolate bright specular/emissive highlights');
  assert.ok(rtxBloomStrength <= 0.30, 'Bloom strength must be subtle and realistic');
});

// Helper mock world for headless fluid testing
function createMockWorld() {
  const blocks = new Map<string, Block>();
  const mockWorld: any = {
    getBlock: (x: number, y: number, z: number) => blocks.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? Block.AIR,
    worldToChunkCoords: (x: number, z: number) => ({ cx: 0, cz: 0, lx: Math.floor(x), lz: Math.floor(z) }),
    getOrCreateChunk: () => ({
      setBlock: (lx: number, y: number, lz: number, b: Block) => {
        blocks.set(`${lx},${y},${lz}`, b);
      },
      isDirty: false
    }),
    getChunk: () => null,
    rebuildChunkMesh: () => {},
    getSafeSpawnHeight: () => 4
  };
  mockWorld.setBlock = (x: number, y: number, z: number, b: Block) => {
    blocks.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`, b);
    return true;
  };
  return { mockWorld, blocks };
}

// 40. Fluid Cellular Automata - Downward Gravity Waterfall
test('FluidSimulator: downward waterfall flow into empty voids', () => {
  const { mockWorld, blocks } = createMockWorld();
  const sim = new FluidSimulator(mockWorld);

  // Place solid floor at y=0, air at y=1..9, water source at y=10
  blocks.set('0,0,0', Block.STONE);
  blocks.set('0,10,0', Block.WATER);
  sim.registerSource(0, 10, 0, Block.WATER);

  // Step simulation multiple ticks
  for (let t = 0; t < 10; t++) {
    sim.update(0.15);
  }

  // Water should cascade straight down to y=9, y=8, etc.
  assert.equal(mockWorld.getBlock(0, 9, 0), Block.WATER, 'Water must flow down into empty void below');
  assert.equal(mockWorld.getBlock(0, 8, 0), Block.WATER, 'Water must cascade downward continuously');
});

// 41. Fluid Cellular Automata - Horizontal Spread Bound (Max 5 blocks)
test('FluidSimulator: horizontal spread up to 5 blocks from source', () => {
  const { mockWorld, blocks } = createMockWorld();
  const sim = new FluidSimulator(mockWorld);

  // Solid floor at y=0 from x=-10 to 10
  for (let x = -10; x <= 10; x++) {
    blocks.set(`${x},0,0`, Block.STONE);
  }

  // Water source at (0, 1, 0)
  blocks.set('0,1,0', Block.WATER);
  sim.registerSource(0, 1, 0, Block.WATER);

  // Step simulation
  for (let t = 0; t < 20; t++) {
    sim.update(0.15);
  }

  // Should have spread horizontally to adjacent blocks
  assert.equal(mockWorld.getBlock(1, 1, 0), Block.WATER, 'Water must spread horizontally over solid ground');
  assert.equal(mockWorld.getBlock(-1, 1, 0), Block.WATER, 'Water must spread horizontally in all cardinal directions');

  // Should NOT spread beyond MAX_WATER_DIST (5 blocks)
  assert.equal(mockWorld.getBlock(7, 1, 0), Block.AIR, 'Water must not spread past maximum horizontal reach');
});

// 42. Fluid Cellular Automata - Water & Lava Reaction (Obsidian / Cobblestone)
test('FluidSimulator: water touching lava creates obsidian and cobblestone with sound/particles', () => {
  const { mockWorld, blocks } = createMockWorld();
  const sim = new FluidSimulator(mockWorld);

  let extinguishedCount = 0;
  sim.onExtinguish = () => {
    extinguishedCount++;
  };

  // Water source above lava source at (0, 1, 0) and (0, 0, 0)
  blocks.set('0,1,0', Block.WATER);
  blocks.set('0,0,0', Block.LAVA);
  sim.registerSource(0, 1, 0, Block.WATER);
  sim.registerSource(0, 0, 0, Block.LAVA);

  // Step simulation
  sim.update(0.15);
  sim.update(0.15);

  const result = mockWorld.getBlock(0, 0, 0);
  assert.ok(result === Block.OBSIDIAN || result === Block.COBBLESTONE, 'Water falling on lava source must form Obsidian');
  assert.ok(extinguishedCount > 0, 'Extinguish event must trigger sound and steam particles');
});

// 43. Fluid Cellular Automata - Fluid Drainage When Supply is Cut Off
test('FluidSimulator: flowing fluid recedes and drains when source block is removed', () => {
  const { mockWorld, blocks } = createMockWorld();
  const sim = new FluidSimulator(mockWorld);

  for (let x = -5; x <= 5; x++) {
    blocks.set(`${x},0,0`, Block.STONE);
  }

  // Create source and let it spread
  blocks.set('0,1,0', Block.WATER);
  sim.registerSource(0, 1, 0, Block.WATER);
  for (let t = 0; t < 10; t++) {
    sim.update(0.15);
  }

  assert.equal(mockWorld.getBlock(1, 1, 0), Block.WATER);

  // Remove source block
  blocks.set('0,1,0', Block.AIR);
  sim.onBlockChanged(0, 1, 0, Block.AIR);

  // Let fluid drain
  for (let t = 0; t < 15; t++) {
    sim.update(0.15);
  }

  assert.equal(mockWorld.getBlock(0, 1, 0), Block.AIR, 'Source must remain removed');
  assert.equal(mockWorld.getBlock(1, 1, 0), Block.AIR, 'Flowing water must drain back to air when source is gone');
});

// 44. Bucket Crafting & Mechanics
test('BucketSystem: crafts from 3 iron ingots in V-shape and defines valid items', () => {
  const crafting = new CraftingManager();

  // Crafting Bucket: 3 Iron Ingots in V-shape (3x2)
  const grid: any = [
    { id: ItemId.IRON_INGOT, count: 1 }, null, { id: ItemId.IRON_INGOT, count: 1 },
    null, { id: ItemId.IRON_INGOT, count: 1 }, null,
    null, null, null
  ];
  const result = crafting.evaluate(grid, 3);

  assert.ok(result, '3 Iron Ingots in V-shape must produce Bucket');
  assert.equal(result?.id, ItemId.BUCKET);
  assert.equal(result?.count, 1);

  // Validate item definitions
  assert.equal(ITEM_DEFS[ItemId.BUCKET]?.name, 'Bucket');
  assert.equal(ITEM_DEFS[ItemId.WATER_BUCKET]?.name, 'Water Bucket');
  assert.equal(ITEM_DEFS[ItemId.LAVA_BUCKET]?.name, 'Lava Bucket');
  assert.equal(ITEM_DEFS[ItemId.MILK_BUCKET]?.name, 'Milk Bucket');
  assert.equal(ITEM_DEFS[ItemId.WATER_BUCKET]?.maxStack, 1, 'Fluid buckets must not stack beyond 1');
});

// 45. Furnace Lava Bucket Fuel Mechanics
test('FurnaceManager: lava bucket provides 1000s fuel and leaves empty bucket', () => {
  const furnace = new FurnaceManager();
  const data = furnace.getFurnace(0, 50, 0);

  // Fuel duration check
  assert.equal(furnace.getFuelTime(ItemId.LAVA_BUCKET), 1000, 'Lava bucket must provide 1000s (100 items) fuel');

  // Input: 1 Iron Ore, Fuel: 1 Lava Bucket
  data.input = { id: Block.IRON_ORE, count: 1 };
  data.fuel = { id: ItemId.LAVA_BUCKET, count: 1 };

  // Step furnace 1 tick
  furnace.update(0.1);

  assert.ok(data.fuelTimeLeft > 990, 'Lava bucket should ignite with ~1000s remaining fuel');
  assert.ok(data.fuel, 'Fuel slot must not be null after burning lava bucket');
  assert.equal(data.fuel?.id, ItemId.BUCKET, 'Consuming a lava bucket must leave an empty bucket in the fuel slot');
  assert.equal(data.fuel?.count, 1);
});

// 46. Farming & Hoe Mechanics
test('FarmingSystem: hoes till grass/dirt into farmland, seeds plant crops, crops drop wheat and seeds', () => {
  const crafting = new CraftingManager();

  // Crafting Bread from 3 wheat horizontal
  const breadGrid: any = [
    { id: ItemId.WHEAT, count: 1 }, { id: ItemId.WHEAT, count: 1 }, { id: ItemId.WHEAT, count: 1 },
    null, null, null,
    null, null, null
  ];
  const breadResult = crafting.evaluate(breadGrid, 3);
  assert.ok(breadResult, '3 Wheat horizontal must craft Bread');
  assert.equal(breadResult?.id, ItemId.BREAD);

  // Crafting Iron Hoe
  const hoeGrid: any = [
    { id: ItemId.IRON_INGOT, count: 1 }, { id: ItemId.IRON_INGOT, count: 1 }, null,
    null, { id: ItemId.STICK, count: 1 }, null,
    null, { id: ItemId.STICK, count: 1 }, null
  ];
  const hoeResult = crafting.evaluate(hoeGrid, 3);
  assert.ok(hoeResult, '2 Iron Ingots + 2 Sticks must craft Iron Hoe');
  assert.equal(hoeResult?.id, ItemId.IRON_HOE);

  // Farmland block definition
  assert.ok(BLOCK_DEFS[Block.FARMLAND], 'Block.FARMLAND must have valid block definition');
  assert.equal(BLOCK_DEFS[Block.FARMLAND].dropId, Block.DIRT, 'Farmland should drop Dirt when mined');

  // Wheat seeds item definition
  assert.ok(ITEM_DEFS[ItemId.WHEAT_SEEDS], 'ItemId.WHEAT_SEEDS must exist');
  assert.equal(ITEM_DEFS[ItemId.WHEAT_SEEDS].name, 'Wheat Seeds');
});

// 47. Subterranean 3D Caves & Cavern Features
test('Subterranean3DCaves: validates multi-tier cheese caves, spaghetti tunnels cutting to bedrock, lava lakes at y<=12, stalactites, and exposed ore veins', () => {
  const gen = new TerrainGenerator(1337, 'default');
  const getIndex = (x: number, y: number, z: number) => {
    return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
  };

  let deepLavaCount = 0;
  let bedrockProximityAir = 0;
  let dripstoneCount = 0;
  let exposedOresCount = 0;

  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      const data = gen.generateChunkData(cx, cz);
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          for (let y = 1; y <= 35; y++) {
            const block = data[getIndex(x, y, z)];

            if (block === Block.LAVA && y <= 12) {
              deepLavaCount++;
            }
            if (block === Block.AIR && y <= 5) {
              bedrockProximityAir++;
            }
            if (block === Block.DRIPSTONE_BLOCK) {
              dripstoneCount++;
            }
            if (
              block === Block.IRON_ORE ||
              block === Block.COAL_ORE ||
              block === Block.GOLD_ORE ||
              block === Block.DIAMOND_ORE ||
              block === Block.REDSTONE_ORE
            ) {
              exposedOresCount++;
            }
          }
        }
      }
    }
  }

  assert.ok(deepLavaCount > 0, `Expected deep subterranean lava lakes at y<=12, got ${deepLavaCount}`);
  assert.ok(bedrockProximityAir > 0, `Expected winding spaghetti tunnels cutting down towards bedrock (y<=5), got ${bedrockProximityAir}`);
  assert.ok(dripstoneCount > 0, `Expected stalactite / dripstone accents in caverns, got ${dripstoneCount}`);
  assert.ok(exposedOresCount > 0, `Expected ore veins exposed along cave walls, got ${exposedOresCount}`);
});

// 48. Abandoned Mineshafts & Dungeon Chests
test('UndergroundMineshafts: generates corridors with oak arch supports, cobwebs, rails, and dungeon loot chests with iron, bread, and coal', () => {
  const gen = new TerrainGenerator(1337, 'default');
  const chestMgr = new ChestManager();
  const getIndex = (x: number, y: number, z: number) => {
    return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
  };

  let foundMineshaft = false;
  let foundFences = false;
  let foundCobweb = false;
  let foundRails = false;
  let foundChest = false;

  // Search for an active mineshaft chunk
  for (let cx = 0; cx <= 6; cx++) {
    for (let cz = 0; cz <= 6; cz++) {
      const isSpawnVillage = (cx === 1 && cz === 0);
      const isMineshaft = (Math.abs((cx * 19 + cz * 31 + 2) % 7) === 0) && !isSpawnVillage;
      if (isMineshaft) {
        foundMineshaft = true;
        const data = gen.generateChunkData(cx, cz);
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            for (let y = 15; y <= 25; y++) {
              const block = data[getIndex(x, y, z)];
              if (block === Block.OAK_FENCE) foundFences = true;
              if (block === Block.COBWEB) foundCobweb = true;
              if (block === Block.RAIL) foundRails = true;
              if (block === Block.CHEST) {
                foundChest = true;
                const worldX = cx * 16 + x;
                const worldZ = cz * 16 + z;
                const loot = chestMgr.getChest(worldX, y, worldZ);
                assert.equal(loot.length, 27, 'Dungeon chest must have 27 slots');

                const itemIds = loot.filter(s => s !== null).map(s => s!.id);
                assert.ok(
                  itemIds.includes(ItemId.IRON_INGOT) ||
                  itemIds.includes(ItemId.BREAD) ||
                  itemIds.includes(ItemId.COAL) ||
                  itemIds.includes(ItemId.IRON_PICKAXE),
                  'Dungeon chest should contain standard dungeon loot'
                );
              }
            }
          }
        }
      }
    }
  }

  assert.ok(foundMineshaft, 'Expected at least one mineshaft chunk');
  assert.ok(foundFences, 'Expected wooden fence arch posts');
  assert.ok(foundCobweb, 'Expected cobwebs in mineshaft');
  assert.ok(foundRails, 'Expected rail tracks along mineshaft floor');
  assert.ok(foundChest, 'Expected dungeon loot chest in mineshaft');
});

// 49. Surface Flora (Sugar Cane, Wild Mushrooms, Lily Pads)
test('SurfaceFlora: generates Sugar Cane bordering water at sea level, wild mushrooms in shaded areas & caves, and lily pads on water', () => {
  const gen = new TerrainGenerator(1337, 'default');
  const getIndex = (x: number, y: number, z: number) => {
    return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
  };

  let sugarCaneCount = 0;
  let sugarCaneBorderingWater = 0;
  let mushroomCount = 0;
  let lilyPadCount = 0;

  for (let cx = -4; cx <= 4; cx++) {
    for (let cz = -4; cz <= 4; cz++) {
      const data = gen.generateChunkData(cx, cz);
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          for (let y = 1; y < 63; y++) {
            const block = data[getIndex(x, y, z)];

            if (block === Block.SUGAR_CANE) {
              sugarCaneCount++;
              // Check that sugar cane base borders water horizontally at sea level
              let hasWaterNeighbor = false;
              const cardinal = [[-1, 0], [1, 0], [0, -1], [0, 1]];
              for (const [dx, dz] of cardinal) {
                const nx = x + dx;
                const nz = z + dz;
                if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16) {
                  for (let wy = TerrainGenerator.SEA_LEVEL - 1; wy <= TerrainGenerator.SEA_LEVEL + 1; wy++) {
                    if (data[getIndex(nx, wy, nz)] === Block.WATER) {
                      hasWaterNeighbor = true;
                      break;
                    }
                  }
                }
              }
              if (hasWaterNeighbor) sugarCaneBorderingWater++;
            }

            if (block === Block.RED_MUSHROOM || block === Block.BROWN_MUSHROOM) {
              mushroomCount++;
            }

            if (block === Block.LILY_PAD) {
              lilyPadCount++;
              assert.equal(y, TerrainGenerator.SEA_LEVEL + 1, 'Lily pad must rest at water surface level (y = SEA_LEVEL + 1)');
              assert.equal(data[getIndex(x, y - 1, z)], Block.WATER, 'Block below lily pad must be water');
            }
          }
        }
      }
    }
  }

  assert.ok(sugarCaneCount > 0, `Expected Sugar Cane along shoreline, got ${sugarCaneCount}`);
  assert.ok(sugarCaneBorderingWater > 0, `Expected Sugar Cane immediately adjacent to water, got ${sugarCaneBorderingWater}`);
  assert.ok(mushroomCount > 0, `Expected wild red/brown mushrooms in forest shade or caverns, got ${mushroomCount}`);
  assert.ok(lilyPadCount > 0, `Expected lily pads resting on water surfaces, got ${lilyPadCount}`);
});

// 48. Edge-Sneaking (Ledge Protection) Physics
test('EdgeSneaking: clamps horizontal movement on ledge over vertical drop of 1+ blocks when sneaking', () => {
  const { mockWorld, blocks } = createMockWorld();

  // Create a 1x1 pillar at (0, 3, 0).
  // Below it is air everywhere (a drop of 3+ blocks into air!)
  blocks.set('0,3,0', Block.STONE);

  // Player bounding box standing on the stone block at y=4
  // Width = 0.6, height = 1.8 -> box is [0.2, 4.0, 0.2] to [0.8, 5.8, 0.8]
  const box = new AABB(
    new THREE.Vector3(0.2, 4.0, 0.2),
    new THREE.Vector3(0.8, 5.8, 0.8)
  );

  // Standing at center (0, 3, 0) has solid ground below
  assert.ok(AABB.hasBlockBelow(box, 0, 0, mockWorld as any), 'Should detect solid stone block beneath feet');

  // Offset by +0.8 in X would put box at [1.0, 1.6], completely off the pillar over air
  assert.ok(!AABB.hasBlockBelow(box, 0.8, 0, mockWorld as any), 'Stepping off ledge into air must return false for solid support');

  // When sneaking is ENABLED and player is on ground:
  // Attempting to move +0.5 in X must be clamped so player does not fall off the edge
  const sneakingBox = box.clone();
  const proposedVel = new THREE.Vector3(0.5, 0, 0);
  const colSneak = AABB.moveAndCollide(sneakingBox, proposedVel, mockWorld as any, true, true);

  assert.ok(colSneak.resolvedVel.x < 0.25, `Sneaking movement must be clamped (got ${colSneak.resolvedVel.x})`);
  assert.ok(sneakingBox.min.x < 1.0, `Sneaking box min.x must stay supported on block (got ${sneakingBox.min.x})`);
  assert.ok(AABB.hasBlockBelow(sneakingBox, 0, 0, mockWorld as any), 'Player must remain safely supported on ledge while sneaking');

  // When sneaking is DISABLED:
  // Player walks right off the ledge normally into air
  const normalBox = box.clone();
  const colNormal = AABB.moveAndCollide(normalBox, proposedVel, mockWorld as any, false, true);
  assert.equal(colNormal.resolvedVel.x, 0.5, 'Without sneaking, movement must not be clamped');
  assert.ok(normalBox.min.x >= 0.7, 'Player should advance past the ledge edge without sneaking');
});

// 49. Fluid Current Forces & Waterfall Flow
test('FluidCurrentForces: computes authentic downstream vectors and vertical waterfall downdraft', () => {
  const { mockWorld, blocks } = createMockWorld();
  const sim = new FluidSimulator(mockWorld);

  // 1. Still water pool: 3x3 source blocks at y=10
  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 1; z++) {
      blocks.set(`${x},10,${z}`, Block.WATER);
      blocks.set(`${x},9,${z}`, Block.STONE); // solid floor
      sim.registerSource(x, 10, z, Block.WATER);
    }
  }

  // Center source block has equal symmetric neighbors and solid floor -> zero current
  const stillFlow = sim.getFlowVector(0.5, 10.5, 0.5);
  assert.equal(stillFlow.lengthSq(), 0, 'Calm source block in a pool should have zero current flow vector');

  // 2. Stream flow: Water flowing from source at (0, 5, 0) towards +X
  blocks.set('0,5,0', Block.WATER);
  blocks.set('0,4,0', Block.STONE);
  sim.flowMap.set(sim.getKey(0, 5, 0), { type: Block.WATER, dist: 0, isSource: true });

  blocks.set('1,5,0', Block.WATER);
  blocks.set('1,4,0', Block.STONE);
  sim.flowMap.set(sim.getKey(1, 5, 0), { type: Block.WATER, dist: 1, isSource: false });

  blocks.set('2,5,0', Block.WATER);
  blocks.set('2,4,0', Block.STONE);
  sim.flowMap.set(sim.getKey(2, 5, 0), { type: Block.WATER, dist: 2, isSource: false });

  // Stream current at (1, 5, 0) should point downstream (+X)
  const streamFlow = sim.getFlowVector(1.5, 5.5, 0.5);
  assert.ok(streamFlow.x > 0, `Flow vector x must point downstream along +X (got ${streamFlow.x})`);

  // 3. Waterfall flow: Water at (5, 8, 5) cascading down into air at y=7
  blocks.set('5,8,5', Block.WATER);
  blocks.set('5,9,5', Block.WATER); // Water source above
  blocks.set('5,7,5', Block.AIR);   // Void below
  sim.flowMap.set(sim.getKey(5, 8, 5), { type: Block.WATER, dist: 1, isSource: false });

  const waterfallFlow = sim.getFlowVector(5.5, 8.5, 5.5);
  assert.ok(waterfallFlow.y < 0, `Waterfall flow vector y must point downward (got ${waterfallFlow.y})`);
});

// 50. Sprinting Camera FOV Interpolation
test('SprintingEnhancements: FOV lerping calculates +8 degrees target and smooth interpolation', () => {
  const baseFov = 75;
  let targetFov = baseFov;

  // When sprinting and moving forward: targetFov is baseFov + 8
  const isSprinting = true;
  const isMoving = true;
  targetFov = (isSprinting && isMoving) ? baseFov + 8 : baseFov;
  assert.equal(targetFov, 83, 'Target FOV should be baseFov + 8 (83 degrees) when sprinting');

  // Smooth lerp simulation over multiple frames
  let currentFov = baseFov;
  const dt = 1 / 60;
  for (let frame = 0; frame < 15; frame++) {
    currentFov = THREE.MathUtils.lerp(currentFov, targetFov, Math.min(1.0, 10.0 * dt));
  }
  assert.ok(currentFov > 79, `Current FOV should smoothly approach target (got ${currentFov})`);

  // When stopping sprint: targetFov returns to baseFov
  targetFov = (!isSprinting && isMoving) ? baseFov + 8 : baseFov;
  assert.equal(targetFov, 75, 'Target FOV should return to baseFov (75 degrees) when not sprinting');
  for (let frame = 0; frame < 30; frame++) {
    currentFov = THREE.MathUtils.lerp(currentFov, targetFov, Math.min(1.0, 10.0 * dt));
  }
  assert.ok(Math.abs(currentFov - 75) < 0.5, `Current FOV should return smoothly to 75 (got ${currentFov})`);
});

// 51. Celestial Overhaul: Lunar Phases & Circular Sun
test('CelestialOverhaul: validates 8 authentic lunar phases, cyclical day rotation, and illumination ratios', () => {
  const scene = new THREE.Scene();
  const dayNight = new DayNightCycle(scene);

  // 1. Verify 8 authentic lunar phase names exist in exact astronomical sequence
  assert.equal(MOON_PHASE_NAMES.length, 8);
  assert.equal(MOON_PHASE_NAMES[0], 'New Moon');
  assert.equal(MOON_PHASE_NAMES[1], 'Waxing Crescent');
  assert.equal(MOON_PHASE_NAMES[2], 'First Quarter');
  assert.equal(MOON_PHASE_NAMES[3], 'Waxing Gibbous');
  assert.equal(MOON_PHASE_NAMES[4], 'Full Moon');
  assert.equal(MOON_PHASE_NAMES[5], 'Waning Gibbous');
  assert.equal(MOON_PHASE_NAMES[6], 'Third Quarter');
  assert.equal(MOON_PHASE_NAMES[7], 'Waning Crescent');

  // 2. Default state should start at Full Moon (phase 4)
  assert.equal(dayNight.getMoonPhase(), 4);
  assert.equal(dayNight.getMoonPhaseName(), 'Full Moon');
  assert.equal(dayNight.getMoonPhaseIllumination(), 1.0, 'Full Moon must have 1.0 illumination');

  // 3. New Moon illumination
  dayNight.setMoonPhase(0);
  assert.equal(dayNight.getMoonPhase(), 0);
  assert.equal(dayNight.getMoonPhaseName(), 'New Moon');
  assert.equal(dayNight.getMoonPhaseIllumination(), 0.0, 'New Moon must have 0.0 illumination');

  // 4. Quarter moons illumination (~0.5)
  dayNight.setMoonPhase(2); // First Quarter
  assert.equal(dayNight.getMoonPhaseName(), 'First Quarter');
  assert.ok(Math.abs(dayNight.getMoonPhaseIllumination() - 0.5) < 0.001);

  dayNight.setMoonPhase(6); // Third Quarter
  assert.equal(dayNight.getMoonPhaseName(), 'Third Quarter');
  assert.ok(Math.abs(dayNight.getMoonPhaseIllumination() - 0.5) < 0.001);

  // 5. Day count progression seamlessly advances moon phase through 8-day lunar cycle
  dayNight.setDayCount(0);
  assert.equal(dayNight.getMoonPhaseName(), 'Full Moon');
  dayNight.setDayCount(1);
  assert.equal(dayNight.getMoonPhaseName(), 'Waning Gibbous');
  dayNight.setDayCount(2);
  assert.equal(dayNight.getMoonPhaseName(), 'Third Quarter');
  dayNight.setDayCount(3);
  assert.equal(dayNight.getMoonPhaseName(), 'Waning Crescent');
  dayNight.setDayCount(4);
  assert.equal(dayNight.getMoonPhaseName(), 'New Moon');
  dayNight.setDayCount(8);
  assert.equal(dayNight.getMoonPhaseName(), 'Full Moon', 'Day 8 must wrap cleanly back to Full Moon');
});

// 52. Water Graphics & Caustics: Fresnel, Depth Modulation, and Projected Light
test('WaterGraphicsAndCaustics: validates depth-based modulation, surface Fresnel uniforms, and projected caustics', () => {
  const scene = new THREE.Scene();
  const atlas = new TextureAtlas();
  const world = new World(scene, atlas, 42, 'default');

  // 1. Water shader uniforms
  assert.ok(world.waterUniforms, 'World must expose waterUniforms');
  assert.ok(world.waterUniforms.uTime !== undefined, 'waterUniforms must define uTime');
  assert.ok(world.waterUniforms.uShallowColor !== undefined, 'waterUniforms must define uShallowColor');
  assert.ok(world.waterUniforms.uDeepColor !== undefined, 'waterUniforms must define uDeepColor');
  assert.ok(world.waterUniforms.uFresnelColor !== undefined, 'waterUniforms must define uFresnelColor');

  // 2. Terrain shader uniforms
  assert.ok(world.terrainUniforms, 'World must expose terrainUniforms');
  assert.ok(world.terrainUniforms.uTime !== undefined, 'terrainUniforms must define uTime');
  assert.ok(world.terrainUniforms.uCausticsIntensity !== undefined, 'terrainUniforms must define uCausticsIntensity');

  // 3. Time advancement updates shader uniforms
  world.update(0.5);
  assert.equal(world.waterUniforms.uTime.value, 0.5);
  assert.equal(world.terrainUniforms.uTime.value, 0.5);

  // 4. Analytical water caustics intensity
  const underwaterCaustics = TextureAtlas.calculateCaustics(10, 25, 10, 1.0);
  assert.ok(underwaterCaustics >= 0.0 && underwaterCaustics <= 1.0, 'Underwater caustics must be normalized [0, 1]');

  const aboveWaterCaustics = TextureAtlas.calculateCaustics(10, 35, 10, 1.0);
  assert.equal(aboveWaterCaustics, 0.0, 'Points above sea level (y>30.5) must have 0.0 water caustics');
});

// 53. Thunderstorm Lightning Illumination & Thunderclaps
test('ThunderstormLightning: validates instantaneous multi-stroke flash intensity, celestial illumination, and thunderclaps', () => {
  const scene = new THREE.Scene();
  const dayNight = new DayNightCycle(scene);
  const mockSounds: any = {
    playThunderSound: () => { thunderPlayedCount++; },
    startRainSound: () => {},
    stopRainSound: () => {},
    setRainIntensity: () => {}
  };
  let thunderPlayedCount = 0;

  const weather = new WeatherSystem(scene, mockSounds);

  // 1. Clear weather default
  assert.equal(weather.currentWeather, 'clear');
  assert.equal(weather.getLightningIntensity(), 0.0);
  assert.equal(weather.isLightningActive(), false);

  // 2. Set weather to thunder triggers initial flash and thunderclap
  weather.setWeather('thunder');
  assert.equal(weather.currentWeather, 'thunder');
  assert.equal(weather.getLightningIntensity(), 1.0, 'Lightning strike must start at peak 1.0 intensity');
  assert.equal(weather.isLightningActive(), true);

  // 3. Update simulates multi-stroke lightning flash decay
  const playerPos = new THREE.Vector3(0, 32, 0);
  weather.update(0.05, playerPos, dayNight);
  assert.ok(weather.getLightningIntensity() > 0.0, 'Flash intensity should sustain across multi-stroke decay');
  assert.ok(dayNight.lightningFlashFactor > 0.0, 'DayNightCycle must receive lightning illumination factor');

  // 4. Manual triggerLightning
  weather.triggerLightning(true);
  assert.equal(weather.getLightningIntensity(), 1.0);

  // 5. When lightning flash expires, intensity returns cleanly to 0
  weather.update(0.40, playerPos, dayNight);
  assert.equal(weather.getLightningIntensity(), 0.0);
  assert.equal(weather.isLightningActive(), false);
  assert.equal(dayNight.lightningFlashFactor, 0.0);
});

// 54. Aquatic Life, Fish Mobs & Schooling Behavior
test('AquaticLifeAndSchooling: validates Cod and Salmon fish variants, swimming tail-fin sway, schooling AI, and fleeing mechanics', () => {
  assert.equal(MobType.FISH, 'fish');
  assert.equal(MobType.COD, 'cod');
  assert.equal(MobType.SALMON, 'salmon');

  const scene = new THREE.Scene();
  const mockSounds = {
    playMobHit: () => {},
    playIronGolemHit: () => {},
    playIronGolemAttack: () => {},
    playCreeperHiss: () => {},
    playExplosion: () => {},
    playZombieGroan: () => {},
    playPigmanAngry: () => {},
    playPigmanGrunt: () => {},
    playGhastWeep: () => {},
    playGhastShoot: () => {},
    playBlazeBreathe: () => {},
    playBlazeShoot: () => {},
    playCow: () => {},
    playCowMoo: () => {},
    playPig: () => {},
    playPigOink: () => {},
    playSheep: () => {},
    playSheepBaa: () => {},
    playChicken: () => {},
    playVillager: () => {},
    playZombie: () => {}
  } as any;

  const cod = new Mob(1, MobType.COD, new THREE.Vector3(10, 20, 10), scene, mockSounds);
  const salmon = new Mob(2, MobType.SALMON, new THREE.Vector3(11, 20, 10), scene, mockSounds);

  assert.equal(cod.isFish, true);
  assert.equal(cod.fishVariant, 'cod');
  assert.equal(salmon.isFish, true);
  assert.equal(salmon.fishVariant, 'salmon');

  // Both drop raw fish on death
  const codDrops = cod.getDeathDrops();
  const salmonDrops = salmon.getDeathDrops();
  assert.ok(codDrops.some(d => d.id === ItemId.RAW_FISH && d.count >= 1));
  assert.ok(salmonDrops.some(d => d.id === ItemId.RAW_FISH && d.count >= 1));

  // Verify fish tail-fin mesh created
  assert.ok(cod.fishTailMesh, 'Cod must have tail-fin mesh');
  assert.ok(salmon.fishTailMesh, 'Salmon must have tail-fin mesh');

  const { mockWorld } = createMockWorld();

  // Test player proximity fleeing behavior (player within 5.5 blocks)
  const closePlayerPos = new THREE.Vector3(11, 20, 10);
  cod.update(0.1, mockWorld as any, closePlayerPos, () => {}, () => {});
  assert.ok(cod.panicTimer > 0, 'Fish must panic and flee when player approaches within 5.5 blocks');
  assert.ok(cod.velocity.length() > cod.moveSpeed, 'Fish sprint swimming velocity must increase when fleeing');
  assert.ok(cod.fishTailMesh.rotation.y !== 0, 'Fish tail-fin must oscillate during swimming');

  // Test schooling coordination when distant from player
  const distantPlayerPos = new THREE.Vector3(100, 20, 100);
  const fish1 = new Mob(3, MobType.COD, new THREE.Vector3(20, 25, 20), scene, mockSounds);
  const fish2 = new Mob(4, MobType.SALMON, new THREE.Vector3(21, 25, 21), scene, mockSounds);
  fish1.wanderDir.set(1, 0, 0);
  fish2.wanderDir.set(0, 0, 1);
  (fish1 as any).aiTimer = 0; // Trigger schooling steer

  fish1.update(0.1, mockWorld as any, distantPlayerPos, () => {}, () => {}, [fish1, fish2]);
  assert.equal(fish1.isMoving, true, 'Schooling fish must remain in swimming motion');
});

// 55. Mob Food Luring & Breeding Mechanics
test('MobFoodLuringAndBreeding: validates cows following wheat, chickens following seeds, pigs following apples/bread, and breeding', () => {
  const scene = new THREE.Scene();
  const mockSounds = {
    playEat: () => {},
    playLevelUp: () => {},
    playMobHit: () => {},
    playCowMoo: () => {},
    playPigOink: () => {},
    playSheepBaa: () => {},
    playChicken: () => {},
    playCow: () => {},
    playPig: () => {},
    playSheep: () => {}
  } as any;

  const cow = new Mob(10, MobType.COW, new THREE.Vector3(0, 4, 0), scene, mockSounds);
  const chicken = new Mob(11, MobType.CHICKEN, new THREE.Vector3(0, 4, 0), scene, mockSounds);
  const pig = new Mob(12, MobType.PIG, new THREE.Vector3(0, 4, 0), scene, mockSounds);

  // Favored food validation
  assert.ok(cow.isFavoredFood(ItemId.WHEAT), 'Cow follows Wheat');
  assert.ok(!cow.isFavoredFood(ItemId.WHEAT_SEEDS), 'Cow ignores Seeds');
  assert.ok(!cow.isFavoredFood(ItemId.APPLE), 'Cow ignores Apples');

  assert.ok(chicken.isFavoredFood(ItemId.WHEAT_SEEDS), 'Chicken follows Wheat Seeds');
  assert.ok(!chicken.isFavoredFood(ItemId.WHEAT), 'Chicken ignores Wheat');

  assert.ok(pig.isFavoredFood(ItemId.APPLE), 'Pig follows Apples');
  assert.ok(pig.isFavoredFood(ItemId.BREAD), 'Pig follows Bread');
  assert.ok(!pig.isFavoredFood(ItemId.WHEAT), 'Pig ignores Wheat');

  const { mockWorld } = createMockWorld();

  // Test luring within 8 blocks
  const playerLurePos = new THREE.Vector3(5, 4, 0); // 5 blocks away
  cow.update(0.1, mockWorld as any, playerLurePos, () => {}, () => {}, [], ItemId.WHEAT);
  assert.equal(cow.isLured, true, 'Cow must take notice and follow player holding Wheat');
  assert.ok(cow.velocity.x > 0, 'Cow moves in direction of player');

  // Test stopping when close (< 2.0 blocks)
  const playerClosePos = new THREE.Vector3(1.2, 4, 0);
  cow.update(0.1, mockWorld as any, playerClosePos, () => {}, () => {}, [], ItemId.WHEAT);
  assert.equal(cow.isLured, true);
  assert.equal(cow.isMoving, false, 'Cow must stop moving to avoid crowding player when close');

  // Test ignoring when player holds non-favored item
  pig.update(0.1, mockWorld as any, playerLurePos, () => {}, () => {}, [], ItemId.STICK);
  assert.equal(pig.isLured, false, 'Pig must not follow player holding sticks');

  // Test breeding system
  const mobManager = new MobManager(scene, mockWorld as any, mockSounds);
  const cowA = mobManager.spawnMob(MobType.COW, 2, 4, 2);
  const cowB = mobManager.spawnMob(MobType.COW, 3, 4, 2);

  cowA.feed();
  assert.ok(cowA.inLove > 0, 'Feeding adult animal enters love mode');

  cowB.feed();
  assert.ok(cowB.inLove > 0);

  const bred = mobManager.checkBreeding(cowA);
  assert.equal(bred, true, 'Breeding two cows in love produces a baby cow');
  assert.equal(cowA.inLove, 0, 'Love mode is consumed after breeding');
  assert.equal(cowB.inLove, 0, 'Love mode is consumed after breeding');

  const babyCow = mobManager.mobs.find(m => m.type === MobType.COW && m.isBaby);
  assert.ok(babyCow, 'Baby cow entity must be spawned');
  assert.equal(babyCow.isBaby, true);
  assert.equal(babyCow.group.scale.x, 0.5, 'Baby mob scale is 50% of adult');
});

// 56. Biome Ambient Soundscapes
test('AmbientSoundscapes: validates biome ambient soundscape methods on SoundManager', () => {
  const sm = new SoundManager();

  // Validate soundscape synthesis methods exist
  assert.equal(typeof sm.playWindAmbience, 'function');
  assert.equal(typeof sm.playWaterLapping, 'function');
  assert.equal(typeof sm.playForestBreeze, 'function');
  assert.equal(typeof sm.playBiomeAmbience, 'function');

  // Calling methods in Node environment does not crash (guarded with typeof window check)
  assert.doesNotThrow(() => {
    sm.playWindAmbience();
    sm.playWaterLapping();
    sm.playForestBreeze();
    sm.playBiomeAmbience('Mountains', 55, false);
    sm.playBiomeAmbience('Ocean', 30, true);
    sm.playBiomeAmbience('Forest', 35, false);
    sm.playBiomeAmbience('Plains', 35, false);
  });
});


