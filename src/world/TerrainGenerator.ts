import { PerlinNoise } from './Noise';
import { Block } from './BlockTypes';

export enum BiomeType {
  PLAINS = 'Plains',
  FOREST = 'Forest',
  DESERT = 'Desert',
  MOUNTAINS = 'Mountains',
  OCEAN = 'Ocean'
}

export class TerrainGenerator {
  public static readonly CHUNK_WIDTH = 16;
  public static readonly CHUNK_DEPTH = 16;
  public static readonly CHUNK_HEIGHT = 64;
  public static readonly SEA_LEVEL = 30;

  private heightNoise: PerlinNoise;
  private biomeNoise: PerlinNoise;
  private caveNoise: PerlinNoise;
  private caveNoise2: PerlinNoise;
  private detailNoise: PerlinNoise;
  private continentalNoise: PerlinNoise;
  private riverNoise: PerlinNoise;

  public worldType: 'default' | 'flat' | 'amplified' = 'default';
  public dimension: 'overworld' | 'nether' | 'end' = 'overworld';
  public seed: number;

  constructor(seed: number = 1337, worldType: 'default' | 'flat' | 'amplified' = 'default') {
    this.seed = seed;
    this.worldType = worldType;
    this.heightNoise = new PerlinNoise(seed);
    this.biomeNoise = new PerlinNoise(seed + 101);
    this.caveNoise = new PerlinNoise(seed + 202);
    this.caveNoise2 = new PerlinNoise(seed + 606);
    this.detailNoise = new PerlinNoise(seed + 303);
    this.continentalNoise = new PerlinNoise(seed + 404);
    this.riverNoise = new PerlinNoise(seed + 505);
  }

  // Continentalness determines land vs deep ocean
  public getContinentalness(worldX: number, worldZ: number): number {
    return this.continentalNoise.fbm2D(worldX * 0.003, worldZ * 0.003, 3, 0.5);
  }

  // Determine biome based on continentalness, temperature, and moisture
  public getBiome(worldX: number, worldZ: number): BiomeType {
    if (this.worldType === 'flat') return BiomeType.PLAINS;

    const cont = this.getContinentalness(worldX, worldZ);
    if (cont < -0.25) return BiomeType.OCEAN;

    const temp = this.biomeNoise.fbm2D(worldX * 0.005, worldZ * 0.005, 2);
    const humidity = this.biomeNoise.fbm2D((worldX + 500) * 0.005, (worldZ + 500) * 0.005, 2);

    if (temp < -0.15) return BiomeType.MOUNTAINS;
    if (temp > 0.22 && humidity < -0.08) return BiomeType.DESERT;
    if (humidity > 0.12) return BiomeType.FOREST;
    return BiomeType.PLAINS;
  }

  // Calculate terrain surface height at (worldX, worldZ)
  public getHeight(worldX: number, worldZ: number): number {
    if (this.worldType === 'flat') return 4;

    const cont = this.getContinentalness(worldX, worldZ);

    // Oceans (cont < -0.22)
    if (cont < -0.22) {
      const t = Math.max(0, Math.min(1, (-0.22 - cont) / 0.15));
      const depth = Math.floor(26 - t * 10 + this.heightNoise.noise2D(worldX * 0.03, worldZ * 0.03) * 1.5);
      return Math.max(14, Math.min(27, depth));
    }

    // Sandy Beach & Coastal shoreline (cont between -0.22 and -0.15)
    if (cont < -0.15) {
      const t = (cont + 0.22) / 0.07;
      const coastHeight = Math.floor(28 + t * 4 + this.detailNoise.noise2D(worldX * 0.05, worldZ * 0.05) * 0.8);
      return Math.max(27, Math.min(32, coastHeight));
    }

    // Inland biomes (Distinctive heights for variety)
    const biome = this.getBiome(worldX, worldZ);
    let baseHeight = 34;
    let heightScale = 3;

    if (biome === BiomeType.MOUNTAINS) {
      baseHeight = 44;
      heightScale = this.worldType === 'amplified' ? 24 : 14;
    } else if (biome === BiomeType.DESERT) {
      baseHeight = 33;
      heightScale = 3;
    } else if (biome === BiomeType.PLAINS) {
      baseHeight = 34;
      heightScale = 3;
    } else if (biome === BiomeType.FOREST) {
      baseHeight = 35;
      heightScale = 5;
    }

    const n = this.heightNoise.fbm2D(worldX * 0.012, worldZ * 0.012, 4, 0.45);
    const detail = this.detailNoise.noise2D(worldX * 0.06, worldZ * 0.06) * 1.2;
    let height = Math.floor(baseHeight + n * heightScale + detail);

    // Natural winding rivers: gentle shallow streams through valleys, smoothly carving only non-mountains
    if (biome !== BiomeType.MOUNTAINS) {
      const r = Math.abs(this.riverNoise.fbm2D(worldX * 0.005, worldZ * 0.005, 2));
      const riverWidth = 0.024;
      if (r < riverWidth) {
        const t = r / riverWidth; // 0 at center, 1 at edge
        const smoothT = t * t * (3 - 2 * t);
        const riverBed = 27 + smoothT * 4; // Dips smoothly down to Y=27-29 under sea level
        height = Math.floor(riverBed * (1 - smoothT) + height * smoothT);
      }
    }

    return Math.max(8, Math.min(TerrainGenerator.CHUNK_HEIGHT - 6, height));
  }

  // Populate voxel block array (16 * 64 * 16) for a chunk at (chunkX, chunkZ)
  public generateChunkData(chunkX: number, chunkZ: number): Uint8Array {
    const data = new Uint8Array(
      TerrainGenerator.CHUNK_WIDTH * TerrainGenerator.CHUNK_HEIGHT * TerrainGenerator.CHUNK_DEPTH
    );

    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    if (this.dimension === 'nether') {
      return this.generateNetherChunkData(chunkX, chunkZ);
    }
    if (this.dimension === 'end') {
      return this.generateEndChunkData(chunkX, chunkZ);
    }

    if (this.worldType === 'flat') {
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          data[getIndex(x, 0, z)] = Block.BEDROCK;
          data[getIndex(x, 1, z)] = Block.DIRT;
          data[getIndex(x, 2, z)] = Block.DIRT;
          data[getIndex(x, 3, z)] = Block.DIRT;
          data[getIndex(x, 4, z)] = Block.GRASS;
        }
      }
      return data;
    }

    const startX = chunkX * TerrainGenerator.CHUNK_WIDTH;
    const startZ = chunkZ * TerrainGenerator.CHUNK_DEPTH;

    // First pass: basic terrain, stone, dirt, surface block, water
    for (let x = 0; x < TerrainGenerator.CHUNK_WIDTH; x++) {
      for (let z = 0; z < TerrainGenerator.CHUNK_DEPTH; z++) {
        const worldX = startX + x;
        const worldZ = startZ + z;
        const surfaceY = this.getHeight(worldX, worldZ);
        const biome = this.getBiome(worldX, worldZ);
        const isUnderwater = surfaceY < TerrainGenerator.SEA_LEVEL;
        const isBeach = surfaceY >= TerrainGenerator.SEA_LEVEL && surfaceY <= TerrainGenerator.SEA_LEVEL + 2;

        // Bedrock at y=0
        data[getIndex(x, 0, z)] = Block.BEDROCK;

        // Fill underground & surface
        for (let y = 1; y <= surfaceY; y++) {
          // 3D Cave generation: Multi-tier 3D cheese caves, winding spaghetti tunnels, and ravines
          // Spaghetti tunnel 1:
          const c1 = this.caveNoise.noise3D(worldX * 0.032, y * 0.042, worldZ * 0.032);
          const c2 = this.caveNoise2.noise3D(worldX * 0.032 + 31.7, y * 0.042 + 11.2, worldZ * 0.032 + 53.4);
          const wormDistSq = c1 * c1 + c2 * c2;

          // Cross-tunnel spaghetti branch cutting through stone down to bedrock
          const c3 = this.caveNoise.noise3D(worldX * 0.026 + 110.3, y * 0.036 + 45.1, worldZ * 0.026 + 77.9);
          const c4 = this.caveNoise2.noise3D(worldX * 0.026 + 82.5, y * 0.036 + 93.7, worldZ * 0.026 + 21.6);
          const wormDistSq2 = c3 * c3 + c4 * c4;

          // 3D Perlin cheese caves: Swiss-cheese caverns and open underground chambers
          const cheeseNoise1 = this.detailNoise.noise3D(worldX * 0.020, y * 0.028, worldZ * 0.020);
          const cheeseNoise2 = this.caveNoise.noise3D(worldX * 0.016 + 140, y * 0.022 + 60, worldZ * 0.016 + 80);
          const isCheeseCave = (cheeseNoise1 > 0.36 && cheeseNoise2 > -0.22 && y > 3 && y < surfaceY - 3);

          // Deep vertical ravines slicing through the landscape
          const ravineN1 = this.riverNoise.noise2D(worldX * 0.012 + 150, worldZ * 0.012 + 350);
          const ravineN2 = this.heightNoise.noise2D(worldX * 0.012 - 70, worldZ * 0.012 + 80);
          const isRavine = Math.abs(ravineN1) < 0.024 && ravineN2 > 0.20 && y > 6 && y <= surfaceY && !isUnderwater;

          // Walkable spaghetti tunnel radius (cutting down towards bedrock)
          const wormRadius = y < 24 ? 0.038 : 0.032;
          const isTunnel = (wormDistSq < wormRadius) || (wormDistSq2 < (wormRadius * 0.88));

          // Real Minecraft solid surface protection: caves stay subterranean!
          // Only rare mountain cliff mouths (entranceNoise > 0.72) can open to daylight
          const isAboveSea = surfaceY >= TerrainGenerator.SEA_LEVEL + 1;
          const entranceNoise = this.detailNoise.noise2D(worldX * 0.045, worldZ * 0.045);
          const isMountainMouth = (biome === BiomeType.MOUNTAINS && surfaceY >= 42 && entranceNoise > 0.72);
          const isRareRavineMouth = (isRavine && entranceNoise > 0.60 && surfaceY >= 35);
          const canBreachSurface = isAboveSea && !isUnderwater && (isMountainMouth || isRareRavineMouth);
          const isNearSurface = y >= surfaceY - 3;

          let isCave = (isTunnel || isCheeseCave || isRavine) && y > 1;
          if (isUnderwater && y >= surfaceY - 5) {
            isCave = false; // Protect ocean/river bed from caving in completely
          }
          if (isNearSurface && !canBreachSurface) {
            isCave = false; // Guarantee solid 4-block grass/dirt/stone mantle!
          }

          if (isCave) {
            // Lava pools in deep subterranean caverns & spaghetti tunnels down to bedrock (y <= 12)
            if (y <= 12 && !isUnderwater && (y <= 7 || isCheeseCave || (y <= 10 && cheeseNoise1 > 0.25))) {
              data[getIndex(x, y, z)] = Block.LAVA;
            } else if (y >= 8 && y <= 14 && cheeseNoise1 > 0.40 && y <= 10 && !isUnderwater) {
              // Underground cavern water lake
              data[getIndex(x, y, z)] = Block.WATER;
            } else {
              data[getIndex(x, y, z)] = Block.AIR;
            }
            continue;
          }

          if (y === surfaceY) {
            if (isUnderwater) {
              // Ocean/River floor
              data[getIndex(x, y, z)] = (worldX + worldZ) % 3 === 0 ? Block.GRAVEL : Block.SAND;
            } else if (isBeach) {
              data[getIndex(x, y, z)] = Block.SAND;
            } else if (biome === BiomeType.DESERT) {
              data[getIndex(x, y, z)] = Block.SAND;
            } else if (biome === BiomeType.MOUNTAINS && y > 46) {
              data[getIndex(x, y, z)] = Block.SNOW;
            } else {
              data[getIndex(x, y, z)] = Block.GRASS;
            }
          } else if (y >= surfaceY - 3) {
            if (isUnderwater || isBeach || biome === BiomeType.DESERT) {
              data[getIndex(x, y, z)] = Block.SANDSTONE;
            } else {
              data[getIndex(x, y, z)] = Block.DIRT;
            }
          } else {
            // Underground stone with ores
            data[getIndex(x, y, z)] = this.getOreBlock(worldX, y, worldZ);
          }
        }

        // Fill water up to sea level
        if (isUnderwater) {
          for (let y = surfaceY + 1; y <= TerrainGenerator.SEA_LEVEL; y++) {
            data[getIndex(x, y, z)] = Block.WATER;
          }
        }
      }
    }

    // Second pass: Trees, Foliage, Cacti, Villages
    this.decorateChunk(data, chunkX, chunkZ);

    return data;
  }

  // Determine ore at depth
  private getOreBlock(x: number, y: number, z: number): Block {
    const oreNoise = this.detailNoise.noise3D(x * 0.2, y * 0.2, z * 0.2);

    if (y <= 12 && oreNoise > 0.72) return Block.DIAMOND_ORE;
    if (y <= 16 && oreNoise > 0.65) return Block.REDSTONE_ORE;
    if (y <= 24 && oreNoise > 0.68) return Block.GOLD_ORE;
    if (y <= 38 && oreNoise > 0.58) return Block.IRON_ORE;
    if (y <= 50 && oreNoise > 0.52) return Block.COAL_ORE;
    if (y <= 30 && oreNoise < -0.72) return Block.COBBLESTONE;
    if (oreNoise < -0.65) return Block.GRAVEL;

    return Block.STONE;
  }

  // Place trees, cacti, flowers, village structures
  private decorateChunk(data: Uint8Array, chunkX: number, chunkZ: number) {
    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    const startX = chunkX * TerrainGenerator.CHUNK_WIDTH;
    const startZ = chunkZ * TerrainGenerator.CHUNK_DEPTH;

    // Guaranteed village settlement at chunk (1, 0) and occasional complete villages in flat plains/desert
    const isSpawnVillage = (chunkX === 1 && chunkZ === 0);
    const isRareVillage = (Math.abs(chunkX % 24) === 12 && Math.abs(chunkZ % 24) === 12);
    const isVillageChunk = isSpawnVillage || isRareVillage;

    if (isVillageChunk) {
      const midY = this.getHeight(startX + 8, startZ + 8);
      const biome = this.getBiome(startX + 8, startZ + 8);
      const isSuitableBiome = biome === BiomeType.PLAINS || biome === BiomeType.DESERT;
      if (isSpawnVillage || (isSuitableBiome && midY >= TerrainGenerator.SEA_LEVEL + 1 && midY < TerrainGenerator.CHUNK_HEIGHT - 12)) {
        this.generateSpawnVillage(data, Math.min(36, Math.max(31, midY)));
        return;
      }
    }

    // 1. Abandoned Mineshafts (oak plank arch supports, cobwebs, rails, dungeon loot chests)
    const isMineshaftChunk = (Math.abs((chunkX * 19 + chunkZ * 31 + 2) % 7) === 0) && !isVillageChunk;
    if (isMineshaftChunk) {
      this.generateMineshaft(data, chunkX, chunkZ);
    }

    // 2. Subterranean cave decorations (stalactites, dripstone accents, exposed ore veins, cavern mushrooms)
    this.decorateCaveFeatures(data, startX, startZ);

    for (let x = 1; x < TerrainGenerator.CHUNK_WIDTH - 1; x++) {
      for (let z = 1; z < TerrainGenerator.CHUNK_DEPTH - 1; z++) {
        const worldX = startX + x;
        const worldZ = startZ + z;
        const surfaceY = this.getHeight(worldX, worldZ);

        // Underwater ocean & lake features: Coral Reefs, Kelp Forests, Seagrass, Sea Lanterns, Lily Pads
        if (surfaceY < TerrainGenerator.SEA_LEVEL) {
          const biome = this.getBiome(worldX, worldZ);

          // Lily pads resting on water surfaces in calm swamp / forest / plains lake bodies
          const isLilyBiome = (biome === BiomeType.PLAINS || biome === BiomeType.FOREST);
          const isShallow = surfaceY >= TerrainGenerator.SEA_LEVEL - 8;
          const lilyNoise = this.detailNoise.noise2D(worldX * 0.22 + 400, worldZ * 0.22 + 400);
          if (isLilyBiome && isShallow && lilyNoise > 0.35) {
            if (data[getIndex(x, TerrainGenerator.SEA_LEVEL, z)] === Block.WATER &&
                data[getIndex(x, TerrainGenerator.SEA_LEVEL + 1, z)] === Block.AIR) {
              data[getIndex(x, TerrainGenerator.SEA_LEVEL + 1, z)] = Block.LILY_PAD;
            }
          }

          if (biome === BiomeType.OCEAN || surfaceY <= TerrainGenerator.SEA_LEVEL - 3) {
            const oceanNoise = this.detailNoise.noise2D(worldX * 0.15, worldZ * 0.15);
            const coralNoise = this.detailNoise.noise2D(worldX * 0.28 + 100, worldZ * 0.28 + 100);

            // Colorful Coral Formations
            if (coralNoise > 0.32 && surfaceY + 2 < TerrainGenerator.SEA_LEVEL) {
              const coralTypes = [
                Block.CORAL_BRAIN,
                Block.CORAL_BUBBLE,
                Block.CORAL_FIRE,
                Block.CORAL_HORN,
                Block.CORAL_TUBE
              ];
              const cIdx = Math.floor(Math.abs(worldX * 7 + worldZ * 13) % coralTypes.length);
              const coralBlock = coralTypes[cIdx];
              const coralH = 1 + Math.floor((coralNoise - 0.32) * 5);
              for (let cy = 0; cy < coralH && surfaceY + cy < TerrainGenerator.SEA_LEVEL - 1; cy++) {
                data[getIndex(x, surfaceY + cy, z)] = coralBlock;
              }
              // Radiant underwater Sea Lantern block in large reef mounds
              if (coralNoise > 0.68 && surfaceY + 1 < TerrainGenerator.SEA_LEVEL) {
                data[getIndex(x, surfaceY + 1, z)] = Block.SEA_LANTERN;
              }
            } else if (oceanNoise > 0.42) {
              // Tall swaying kelp reaching toward water surface
              const kelpMax = Math.min(TerrainGenerator.SEA_LEVEL - 1, surfaceY + 3 + Math.floor(oceanNoise * 8));
              for (let ky = surfaceY + 1; ky <= kelpMax; ky++) {
                data[getIndex(x, ky, z)] = Block.KELP;
              }
            } else if (oceanNoise > 0.12 && surfaceY + 1 < TerrainGenerator.SEA_LEVEL) {
              // Sea grass tufts
              data[getIndex(x, surfaceY + 1, z)] = Block.SEAGRASS;
            }
          }
          continue;
        }

        const blockBelow = data[getIndex(x, surfaceY, z)];
        const biome = this.getBiome(worldX, worldZ);
        const rand = this.detailNoise.noise2D(worldX * 0.77, worldZ * 0.77);

        // 3. Sugar Cane generation on sand or dirt directly bordering water bodies at sea level
        if ((blockBelow === Block.SAND || blockBelow === Block.DIRT || blockBelow === Block.GRASS) &&
            surfaceY >= TerrainGenerator.SEA_LEVEL - 1 && surfaceY <= TerrainGenerator.SEA_LEVEL + 2) {
          let bordersWater = false;
          const cardinal = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (const [dx, dz] of cardinal) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16) {
              const checkY = Math.min(surfaceY, TerrainGenerator.SEA_LEVEL);
              if (data[getIndex(nx, checkY, nz)] === Block.WATER ||
                  data[getIndex(nx, checkY - 1, nz)] === Block.WATER ||
                  data[getIndex(nx, TerrainGenerator.SEA_LEVEL, nz)] === Block.WATER) {
                bordersWater = true;
                break;
              }
            }
          }

          if (bordersWater && rand > 0.05) {
            const caneHeight = (Math.abs(worldX * 5 + worldZ * 11) % 2 === 0) ? 3 : 2;
            for (let cy = 1; cy <= caneHeight; cy++) {
              if (surfaceY + cy < TerrainGenerator.CHUNK_HEIGHT) {
                data[getIndex(x, surfaceY + cy, z)] = Block.SUGAR_CANE;
              }
            }
            continue;
          }
        }

        // Trees on grass
        if (blockBelow === Block.GRASS && x >= 2 && x < TerrainGenerator.CHUNK_WIDTH - 2 && z >= 2 && z < TerrainGenerator.CHUNK_DEPTH - 2) {
          const treeChance = biome === BiomeType.FOREST ? 0.35 : (biome === BiomeType.PLAINS ? 0.04 : 0.01);
          if (rand > 1 - treeChance && surfaceY + 7 < TerrainGenerator.CHUNK_HEIGHT) {
            const isBirch = rand > 0.9;
            this.generateTree(data, x, surfaceY + 1, z, isBirch);
            continue;
          }

          // Flowers & vegetation
          if (rand > 0.6) {
            data[getIndex(x, surfaceY + 1, z)] = rand > 0.8 ? Block.POPPY : Block.DANDELION;
          }
        }

        // Wild red and brown mushrooms in shaded forest grottos
        if (biome === BiomeType.FOREST && (blockBelow === Block.GRASS || blockBelow === Block.DIRT)) {
          let isShaded = false;
          for (let cy = surfaceY + 2; cy <= Math.min(surfaceY + 7, TerrainGenerator.CHUNK_HEIGHT - 1); cy++) {
            const blockAbove = data[getIndex(x, cy, z)];
            if (blockAbove === Block.OAK_LEAVES || blockAbove === Block.BIRCH_LEAVES) {
              isShaded = true;
              break;
            }
          }

          if (isShaded && rand > 0.35 && data[getIndex(x, surfaceY + 1, z)] === Block.AIR) {
            data[getIndex(x, surfaceY + 1, z)] = (rand > 0.68) ? Block.RED_MUSHROOM : Block.BROWN_MUSHROOM;
            continue;
          }
        }

        // Cacti in desert on sand
        if (blockBelow === Block.SAND && biome === BiomeType.DESERT && x >= 2 && x < TerrainGenerator.CHUNK_WIDTH - 2 && z >= 2 && z < TerrainGenerator.CHUNK_DEPTH - 2) {
          if (rand > 0.75 && surfaceY + 4 < TerrainGenerator.CHUNK_HEIGHT) {
            const cactusHeight = 2 + Math.floor((rand - 0.75) * 8);
            for (let cy = 0; cy < cactusHeight; cy++) {
              data[getIndex(x, surfaceY + 1 + cy, z)] = Block.CACTUS;
            }
          }
        }
      }
    }
  }

  // Generate standard Minecraft tree
  private generateTree(data: Uint8Array, localX: number, startY: number, localZ: number, isBirch: boolean = false) {
    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    const trunkHeight = 5;
    const logBlock = isBirch ? Block.BIRCH_LOG : Block.OAK_LOG;
    const leafBlock = isBirch ? Block.BIRCH_LEAVES : Block.OAK_LEAVES;

    // Wood Trunk
    for (let ty = 0; ty < trunkHeight; ty++) {
      if (startY + ty < TerrainGenerator.CHUNK_HEIGHT) {
        data[getIndex(localX, startY + ty, localZ)] = logBlock;
      }
    }

    // Leaf Canopy
    const leafStart = startY + trunkHeight - 2;
    for (let ly = 0; ly < 4; ly++) {
      const cy = leafStart + ly;
      if (cy >= TerrainGenerator.CHUNK_HEIGHT) break;

      const radius = ly >= 2 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const lx = localX + dx;
          const lz = localZ + dz;

          if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16) continue;
          if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;

          const idx = getIndex(lx, cy, lz);
          if (data[idx] === Block.AIR) {
            data[idx] = leafBlock;
          }
        }
      }
    }
  }

  // Procedural Village Blacksmith Workshop
  private generateBlacksmith(data: Uint8Array, startX: number, floorY: number, startZ: number) {
    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    const w = 5;
    const d = 5;
    const h = 4;
    if (floorY + h + 2 >= TerrainGenerator.CHUNK_HEIGHT) return;

    // Cobblestone foundation floor
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        data[getIndex(startX + x, floorY, startZ + z)] = Block.COBBLESTONE;
      }
    }

    // Outer walls & corner pillars
    for (let y = 1; y <= h; y++) {
      for (let x = 0; x < w; x++) {
        for (let z = 0; z < d; z++) {
          const isEdge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
          const isCorner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);

          if (isCorner) {
            data[getIndex(startX + x, floorY + y, startZ + z)] = Block.OAK_LOG;
          } else if (isEdge) {
            if (z === 0 && x === 2 && (y === 1 || y === 2)) {
              data[getIndex(startX + x, floorY + y, startZ + z)] = Block.AIR; // Doorway
            } else if (y === 2 && (x === 0 || x === w - 1)) {
              data[getIndex(startX + x, floorY + y, startZ + z)] = Block.GLASS; // Window
            } else {
              data[getIndex(startX + x, floorY + y, startZ + z)] = Block.COBBLESTONE;
            }
          } else {
            data[getIndex(startX + x, floorY + y, startZ + z)] = Block.AIR;
          }
        }
      }
    }

    // Cobblestone roof
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        data[getIndex(startX + x, floorY + h + 1, startZ + z)] = Block.COBBLESTONE;
      }
    }

    // Interior: Double Furnace, Crafting Table, Loot Chest, Torch
    data[getIndex(startX + 1, floorY + 1, startZ + d - 2)] = Block.FURNACE;
    data[getIndex(startX + 2, floorY + 1, startZ + d - 2)] = Block.FURNACE;
    data[getIndex(startX + w - 2, floorY + 1, startZ + d - 2)] = Block.CHEST;
    data[getIndex(startX + w - 2, floorY + 1, startZ + 1)] = Block.CRAFTING_TABLE;
    data[getIndex(startX + 2, floorY + 3, startZ + d - 2)] = Block.TORCH;
  }

  // Procedural Village Cottage
  private generateVillageCottage(data: Uint8Array, startX: number, floorY: number, startZ: number) {
    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    const w = 6;
    const d = 6;
    const h = 4;
    if (floorY + h + 2 >= TerrainGenerator.CHUNK_HEIGHT) return;

    // Cobblestone foundation floor
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        data[getIndex(startX + x, floorY, startZ + z)] = Block.COBBLESTONE;
      }
    }

    // Walls & corners
    for (let y = 1; y <= h; y++) {
      for (let x = 0; x < w; x++) {
        for (let z = 0; z < d; z++) {
          const isEdge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
          const isCorner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);

          if (isCorner) {
            data[getIndex(startX + x, floorY + y, startZ + z)] = Block.OAK_LOG;
          } else if (isEdge) {
            if (z === 0 && (x === 2 || x === 3) && (y === 1 || y === 2)) {
              data[getIndex(startX + x, floorY + y, startZ + z)] = Block.AIR;
            } else if (y === 2 && ((z === d - 1 && x === 2) || (x === 0 && z === 2) || (x === w - 1 && z === 2))) {
              data[getIndex(startX + x, floorY + y, startZ + z)] = Block.GLASS;
            } else {
              data[getIndex(startX + x, floorY + y, startZ + z)] = Block.OAK_PLANKS;
            }
          } else {
            data[getIndex(startX + x, floorY + y, startZ + z)] = Block.AIR;
          }
        }
      }
    }

    // Roof (Wood planks ceiling)
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        data[getIndex(startX + x, floorY + h + 1, startZ + z)] = Block.OAK_PLANKS;
      }
    }

    // Interior Crafting Table, Bookshelf, Torch
    data[getIndex(startX + 1, floorY + 1, startZ + d - 2)] = Block.CRAFTING_TABLE;
    data[getIndex(startX + w - 2, floorY + 1, startZ + d - 2)] = Block.BOOKSHELF;
    data[getIndex(startX + 2, floorY + 3, startZ + d - 2)] = Block.TORCH;
  }

  // Procedural Village Well (Town Center)
  private generateVillageWell(data: Uint8Array, startX: number, floorY: number, startZ: number) {
    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    const size = 5;
    if (floorY + 5 >= TerrainGenerator.CHUNK_HEIGHT) return;

    // Gravel perimeter path
    for (let x = -1; x <= size; x++) {
      for (let z = -1; z <= size; z++) {
        const lx = startX + x;
        const lz = startZ + z;
        if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) {
          data[getIndex(lx, floorY, lz)] = Block.GRAVEL;
        }
      }
    }

    // Cobblestone rim & water center
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const isBorder = x === 0 || x === size - 1 || z === 0 || z === size - 1;
        if (isBorder) {
          data[getIndex(startX + x, floorY + 1, startZ + z)] = Block.COBBLESTONE;
        } else {
          data[getIndex(startX + x, floorY, startZ + z)] = Block.WATER;
          data[getIndex(startX + x, floorY + 1, startZ + z)] = Block.WATER;
        }
      }
    }

    // 4 Corner Oak Log Pillars supporting roof
    const corners = [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]];
    for (const [cx, cz] of corners) {
      data[getIndex(startX + cx, floorY + 2, startZ + cz)] = Block.OAK_LOG;
      data[getIndex(startX + cx, floorY + 3, startZ + cz)] = Block.OAK_LOG;
    }

    // Cobblestone well canopy roof
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        data[getIndex(startX + x, floorY + 4, startZ + z)] = Block.COBBLESTONE;
      }
    }
    data[getIndex(startX + 2, floorY + 3, startZ + 2)] = Block.TORCH;
  }

  // Procedural Wheat Farm Plot (5x5)
  private generateWheatFarm(data: Uint8Array, startX: number, floorY: number, startZ: number) {
    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    if (startX + 5 >= 16 || startZ + 5 >= 16 || floorY + 2 >= TerrainGenerator.CHUNK_HEIGHT) return;

    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        const isBorder = x === 0 || x === 4 || z === 0 || z === 4;
        const isCenterChannel = z === 2;

        if (isBorder) {
          data[getIndex(startX + x, floorY, startZ + z)] = Block.OAK_LOG;
        } else if (isCenterChannel) {
          data[getIndex(startX + x, floorY, startZ + z)] = Block.WATER;
        } else {
          data[getIndex(startX + x, floorY, startZ + z)] = Block.DIRT;
          data[getIndex(startX + x, floorY + 1, startZ + z)] = Block.WHEAT_CROP;
        }
      }
    }
  }

  // Procedural Abandoned Mineshaft with wooden arch supports, cobwebs, rails, and dungeon loot chests
  private generateMineshaft(data: Uint8Array, chunkX: number, chunkZ: number) {
    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    const floorY = 20; // Authentic deep underground mineshaft elevation

    // 1. Main North-South corridor (runs along Z at localX 7..9)
    for (let z = 0; z < 16; z++) {
      // Clear 3x3 corridor
      for (let x = 7; x <= 9; x++) {
        for (let y = floorY + 1; y <= floorY + 3; y++) {
          data[getIndex(x, y, z)] = Block.AIR;
        }
        // Floor: Oak planks with cobblestone accents
        if (data[getIndex(x, floorY, z)] !== Block.LAVA) {
          data[getIndex(x, floorY, z)] = ((z + x) % 3 === 0) ? Block.COBBLESTONE : Block.OAK_PLANKS;
        }
      }

      // Center rail track running along Z
      if (z % 6 !== 3) {
        data[getIndex(8, floorY + 1, z)] = Block.RAIL;
      }

      // Wooden Arch supports every 4 blocks along corridor (oak planks & fences)
      if (z === 2 || z === 6 || z === 10 || z === 14) {
        // Vertical fence posts on sides
        data[getIndex(7, floorY + 1, z)] = Block.OAK_FENCE;
        data[getIndex(7, floorY + 2, z)] = Block.OAK_FENCE;
        data[getIndex(9, floorY + 1, z)] = Block.OAK_FENCE;
        data[getIndex(9, floorY + 2, z)] = Block.OAK_FENCE;

        // Oak plank crossbeam connecting posts across ceiling
        data[getIndex(7, floorY + 3, z)] = Block.OAK_PLANKS;
        data[getIndex(8, floorY + 3, z)] = Block.OAK_PLANKS;
        data[getIndex(9, floorY + 3, z)] = Block.OAK_PLANKS;

        // Ceiling plank support
        data[getIndex(8, floorY + 4, z)] = Block.OAK_PLANKS;

        // Torches mounted on arch supports for authentic atmosphere
        if (z === 6) {
          data[getIndex(7, floorY + 3, z - 1)] = Block.TORCH;
        }
      }

      // Cobwebs clinging to corners, ceilings, and broken shaft sections
      if (z === 3 || z === 7 || z === 11) {
        data[getIndex(7, floorY + 3, z)] = Block.COBWEB;
      }
      if (z === 1 || z === 9 || z === 13) {
        data[getIndex(9, floorY + 3, z)] = Block.COBWEB;
      }
      if (z === 5) {
        data[getIndex(8, floorY + 3, z)] = Block.COBWEB;
      }
    }

    // 2. East-West branch corridor (runs along X at localZ 7..9)
    for (let x = 0; x < 16; x++) {
      if (x < 7 || x > 9) { // Avoid overwriting center intersection rails
        for (let z = 7; z <= 9; z++) {
          for (let y = floorY + 1; y <= floorY + 3; y++) {
            data[getIndex(x, y, z)] = Block.AIR;
          }
          if (data[getIndex(x, floorY, z)] !== Block.LAVA) {
            data[getIndex(x, floorY, z)] = Block.OAK_PLANKS;
          }
        }

        if (x % 5 !== 2) {
          data[getIndex(x, floorY + 1, 8)] = Block.RAIL;
        }

        if (x === 3 || x === 13) {
          data[getIndex(x, floorY + 1, 7)] = Block.OAK_FENCE;
          data[getIndex(x, floorY + 2, 7)] = Block.OAK_FENCE;
          data[getIndex(x, floorY + 1, 9)] = Block.OAK_FENCE;
          data[getIndex(x, floorY + 2, 9)] = Block.OAK_FENCE;
          data[getIndex(x, floorY + 3, 7)] = Block.OAK_PLANKS;
          data[getIndex(x, floorY + 3, 8)] = Block.OAK_PLANKS;
          data[getIndex(x, floorY + 3, 9)] = Block.OAK_PLANKS;
        }

        if (x === 2 || x === 12) {
          data[getIndex(x, floorY + 3, 7)] = Block.COBWEB;
          data[getIndex(x, floorY + 2, 9)] = Block.COBWEB;
        }
      }
    }

    // 3. Dungeon Loot Chest alcove (loot pool includes iron ingots, bread, pickaxes, and coal)
    data[getIndex(5, floorY, 8)] = Block.OAK_PLANKS;
    data[getIndex(5, floorY + 1, 8)] = Block.CHEST;
    data[getIndex(5, floorY + 2, 8)] = Block.TORCH;
    data[getIndex(5, floorY + 1, 9)] = Block.COBWEB;
    data[getIndex(6, floorY + 1, 9)] = Block.COBWEB;
    data[getIndex(5, floorY + 1, 7)] = Block.COBBLESTONE;
  }

  // Subterranean cave decorations: stalactites, dripstone accents, exposed ore veins, cavern mushrooms
  private decorateCaveFeatures(data: Uint8Array, startX: number, startZ: number) {
    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    for (let x = 1; x < 15; x++) {
      for (let z = 1; z < 15; z++) {
        const worldX = startX + x;
        const worldZ = startZ + z;

        for (let y = 2; y <= 35; y++) {
          const b = data[getIndex(x, y, z)];

          if (b === Block.AIR) {
            const above = data[getIndex(x, y + 1, z)];
            const below = data[getIndex(x, y - 1, z)];

            // Stalactite hanging down from cave ceiling
            if ((above === Block.STONE || above === Block.DRIPSTONE_BLOCK) && y > 12) {
              const dripNoise = this.detailNoise.noise3D(worldX * 0.32 + 80, y * 0.32, worldZ * 0.32 + 80);
              if (dripNoise > 0.65) {
                data[getIndex(x, y, z)] = Block.DRIPSTONE_BLOCK;
                if (dripNoise > 0.82 && y > 13 && data[getIndex(x, y - 1, z)] === Block.AIR) {
                  data[getIndex(x, y - 1, z)] = Block.DRIPSTONE_BLOCK;
                }
              }
            }

            // Stalagmite rising up from cave floor
            if (below === Block.STONE && y > 12 && y < 30) {
              const stalagNoise = this.detailNoise.noise3D(worldX * 0.32 - 80, y * 0.32, worldZ * 0.32 - 80);
              if (stalagNoise > 0.70) {
                data[getIndex(x, y, z)] = Block.DRIPSTONE_BLOCK;
              }
            }

            // Wild red and brown mushrooms in deep subterranean caverns
            if ((below === Block.STONE || below === Block.DIRT || below === Block.GRAVEL) && y >= 8 && y <= 28) {
              const shroomNoise = this.detailNoise.noise3D(worldX * 0.28 + 150, y * 0.28, worldZ * 0.28 + 150);
              if (shroomNoise > 0.72) {
                data[getIndex(x, y, z)] = (shroomNoise > 0.84) ? Block.RED_MUSHROOM : Block.BROWN_MUSHROOM;
              }
            }
          } else if (b === Block.STONE && y >= 6 && y <= 35) {
            // Rich ore veins exposed along cave walls
            const hasAdjacentAir =
              data[getIndex(x + 1, y, z)] === Block.AIR ||
              data[getIndex(x - 1, y, z)] === Block.AIR ||
              data[getIndex(x, y, z + 1)] === Block.AIR ||
              data[getIndex(x, y, z - 1)] === Block.AIR ||
              data[getIndex(x, y + 1, z)] === Block.AIR ||
              data[getIndex(x, y - 1, z)] === Block.AIR;

            if (hasAdjacentAir) {
              const veinNoise = this.detailNoise.noise3D(worldX * 0.22, y * 0.22, worldZ * 0.22);
              if (veinNoise > 0.60) {
                if (y <= 12 && veinNoise > 0.78) {
                  data[getIndex(x, y, z)] = Block.DIAMOND_ORE;
                } else if (y <= 18 && veinNoise > 0.72) {
                  data[getIndex(x, y, z)] = Block.REDSTONE_ORE;
                } else if (y <= 26 && veinNoise > 0.68) {
                  data[getIndex(x, y, z)] = Block.GOLD_ORE;
                } else if (veinNoise > 0.64) {
                  data[getIndex(x, y, z)] = Block.IRON_ORE;
                } else {
                  data[getIndex(x, y, z)] = Block.COAL_ORE;
                }
              }
            }
          }
        }
      }
    }
  }

  // Generate The End dimension: floating central island of End Stone with obsidian pillars
  public generateEndChunkData(chunkX: number, chunkZ: number): Uint8Array {
    const data = new Uint8Array(
      TerrainGenerator.CHUNK_WIDTH * TerrainGenerator.CHUNK_HEIGHT * TerrainGenerator.CHUNK_DEPTH
    );
    const getIndex = (x: number, y: number, z: number) =>
      (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;

    const startX = chunkX * TerrainGenerator.CHUNK_WIDTH;
    const startZ = chunkZ * TerrainGenerator.CHUNK_DEPTH;

    // Central island: ellipsoid of End Stone centered at world (0, 30, 0) radius ~32
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const wx = startX + x;
        const wz = startZ + z;
        const distSq = wx * wx + wz * wz;
        const radius = 32;

        if (distSq > (radius + 4) * (radius + 4)) continue;

        const edgeFade = Math.max(0, 1 - Math.sqrt(distSq) / radius);
        const islandHeight = Math.floor(28 + edgeFade * 6 + this.detailNoise.noise2D(wx * 0.05, wz * 0.05) * 2);

        for (let y = 24; y <= islandHeight; y++) {
          if (y < TerrainGenerator.CHUNK_HEIGHT) {
            data[getIndex(x, y, z)] = Block.END_STONE || Block.SANDSTONE;
          }
        }
        // Bedrock at bottom of island
        if (distSq < radius * radius) {
          data[getIndex(x, 24, z)] = Block.BEDROCK;
        }
      }
    }

    return data;
  }

  // Generate cavernous Nether dimension chunk
  public generateNetherChunkData(chunkX: number, chunkZ: number): Uint8Array {
    const data = new Uint8Array(
      TerrainGenerator.CHUNK_WIDTH * TerrainGenerator.CHUNK_HEIGHT * TerrainGenerator.CHUNK_DEPTH
    );

    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    const startX = chunkX * TerrainGenerator.CHUNK_WIDTH;
    const startZ = chunkZ * TerrainGenerator.CHUNK_DEPTH;
    const LAVA_LEVEL = 22;

    for (let x = 0; x < TerrainGenerator.CHUNK_WIDTH; x++) {
      for (let z = 0; z < TerrainGenerator.CHUNK_DEPTH; z++) {
        const worldX = startX + x;
        const worldZ = startZ + z;

        // Bedrock floor and ceiling
        data[getIndex(x, 0, z)] = Block.BEDROCK;
        data[getIndex(x, 63, z)] = Block.BEDROCK;
        data[getIndex(x, 62, z)] = Block.NETHERRACK;

        for (let y = 1; y < 62; y++) {
          // 3D Nether Cavern noise
          const cavernNoise = this.caveNoise.fbm3D(worldX * 0.045, y * 0.07, worldZ * 0.045, 3);
          const midDist = Math.abs(y - 32) / 32;
          const openBias = (1.0 - midDist) * 0.38;

          const isOpen = (cavernNoise + openBias) > 0.44;

          if (isOpen) {
            if (y <= LAVA_LEVEL) {
              data[getIndex(x, y, z)] = Block.LAVA;
            } else {
              data[getIndex(x, y, z)] = Block.AIR;
            }
          } else {
            // Quartz ore or Soul Sand
            const oreVal = this.detailNoise.noise3D(worldX * 0.18, y * 0.18, worldZ * 0.18);
            if (oreVal > 0.68 && y > 8 && y < 58) {
              data[getIndex(x, y, z)] = Block.NETHER_QUARTZ_ORE;
            } else if (y <= LAVA_LEVEL + 2 && (oreVal < -0.45 || (worldX + worldZ) % 7 === 0)) {
              data[getIndex(x, y, z)] = Block.SOUL_SAND;
            } else {
              data[getIndex(x, y, z)] = Block.NETHERRACK;
            }
          }
        }
      }
    }

    // Glowstone ceiling clusters hanging down
    for (let x = 2; x < 14; x += 3) {
      for (let z = 2; z < 14; z += 3) {
        const worldX = startX + x;
        const worldZ = startZ + z;
        const clusterNoise = this.detailNoise.noise2D(worldX * 0.08, worldZ * 0.08);
        if (clusterNoise > 0.35) {
          for (let gy = 56; gy >= 48; gy--) {
            if (data[getIndex(x, gy + 1, z)] !== Block.AIR) {
              data[getIndex(x, gy, z)] = Block.GLOWSTONE;
              if ((x + z) % 2 === 0) data[getIndex(x + 1, gy, z)] = Block.GLOWSTONE;
              if ((x + z) % 3 === 0) data[getIndex(x, gy, z + 1)] = Block.GLOWSTONE;
            }
          }
        }
      }
    }

    // Return Portal frame at chunk (0, 0)
    if (chunkX === 0 && chunkZ === 0) {
      const px = 6;
      const py = 25;
      const pz = 6;
      // Sturdy Nether Bricks landing pad
      for (let dx = -1; dx <= 4; dx++) {
        for (let dz = -1; dz <= 3; dz++) {
          data[getIndex(px + dx, py - 1, pz + dz)] = Block.NETHER_BRICKS;
          for (let dy = 0; dy <= 4; dy++) {
            data[getIndex(px + dx, py + dy, pz + dz)] = Block.AIR;
          }
        }
      }
      // Obsidian frame 4 wide, 5 tall
      for (let dx = 0; dx < 4; dx++) {
        data[getIndex(px + dx, py, pz)] = Block.OBSIDIAN;
        data[getIndex(px + dx, py + 4, pz)] = Block.OBSIDIAN;
      }
      for (let dy = 1; dy <= 3; dy++) {
        data[getIndex(px, py + dy, pz)] = Block.OBSIDIAN;
        data[getIndex(px + 3, py + dy, pz)] = Block.OBSIDIAN;
        // Shimmering portal vortex
        data[getIndex(px + 1, py + dy, pz)] = Block.PORTAL;
        data[getIndex(px + 2, py + dy, pz)] = Block.PORTAL;
      }
    }

    return data;
  }

  // Generate a full thriving village settlement at spawn chunk (1, 0)
  public generateSpawnVillage(data: Uint8Array, floorY: number) {
    const getIndex = (x: number, y: number, z: number) => {
      return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
    };

    // Solid foundation across the village
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = floorY + 1; y < floorY + 8; y++) {
          data[getIndex(x, y, z)] = Block.AIR;
        }
        for (let y = 1; y <= floorY; y++) {
          data[getIndex(x, y, z)] = (y === floorY) ? Block.GRASS : Block.DIRT;
        }
      }
    }

    // Gravel street cross connecting the quadrant buildings
    for (let i = 0; i < 16; i++) {
      data[getIndex(7, floorY, i)] = Block.GRAVEL;
      data[getIndex(8, floorY, i)] = Block.GRAVEL;
      data[getIndex(i, floorY, 7)] = Block.GRAVEL;
      data[getIndex(i, floorY, 8)] = Block.GRAVEL;
    }

    // Streetlamp posts with bright torches at all 4 avenue corners
    const lamps = [[6, 6], [9, 6], [6, 9], [9, 9]];
    for (const [lx, lz] of lamps) {
      data[getIndex(lx, floorY + 1, lz)] = Block.COBBLESTONE;
      data[getIndex(lx, floorY + 2, lz)] = Block.COBBLESTONE;
      data[getIndex(lx, floorY + 3, lz)] = Block.TORCH;
    }

    // 1. Village Cottage in North-West quadrant (localX: 1..5, localZ: 1..5)
    this.generateVillageCottage(data, 1, floorY, 1);

    // 2. Town Well in North-East quadrant (localX: 10..13, localZ: 1..4)
    this.generateVillageWell(data, 10, floorY, 1);

    // 3. Farmland with irrigated wheat crops in South-West quadrant (localX: 1..5, localZ: 10..14)
    this.generateWheatFarm(data, 1, floorY, 10);

    // 4. Blacksmith Workshop with Double Furnaces & Loot Chest in South-East quadrant (localX: 10..14, localZ: 10..14)
    this.generateBlacksmith(data, 10, floorY, 10);
  }
}
