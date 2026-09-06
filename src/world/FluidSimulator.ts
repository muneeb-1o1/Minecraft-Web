import * as THREE from 'three';
import { Block, ItemId, BLOCK_DEFS } from './BlockTypes';
import { World } from './World';
import { Chunk } from './Chunk';

export interface FluidCell {
  type: Block.WATER | Block.LAVA;
  dist: number; // 0 = source, 1..MAX_DIST = flowing
  isSource: boolean;
}

export class FluidSimulator {
  private world: World;
  private updateQueue: { x: number; y: number; z: number }[] = [];
  private queuedKeys: Set<string> = new Set();
  public flowMap: Map<string, FluidCell> = new Map();

  public static readonly MAX_WATER_DIST = 5;
  public static readonly MAX_LAVA_DIST = 3;

  private waterTimer: number = 0;
  private lavaTimer: number = 0;
  private readonly WATER_TICK = 0.10; // ~10 ticks/sec
  private readonly LAVA_TICK = 0.30; // ~3 ticks/sec (slower, viscous lava)

  public onExtinguish?: (pos: THREE.Vector3, resultBlock: Block) => void;
  public onDropItem?: (id: number, count: number, pos: THREE.Vector3) => void;

  constructor(world: World) {
    this.world = world;
  }

  public getKey(x: number, y: number, z: number): string {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  public isFragile(block: Block): boolean {
    return (
      block === Block.TORCH ||
      block === Block.REDSTONE_WIRE ||
      block === Block.REDSTONE_TORCH ||
      block === Block.LEVER ||
      block === Block.DANDELION ||
      block === Block.POPPY ||
      block === Block.SEAGRASS ||
      block === Block.KELP ||
      block === Block.WHEAT_CROP
    );
  }

  public getFragileDrop(block: Block): number | null {
    switch (block) {
      case Block.TORCH: return Block.TORCH;
      case Block.REDSTONE_WIRE: return ItemId.REDSTONE_DUST;
      case Block.REDSTONE_TORCH: return Block.REDSTONE_TORCH;
      case Block.LEVER: return Block.LEVER;
      case Block.DANDELION: return Block.DANDELION;
      case Block.POPPY: return Block.POPPY;
      case Block.WHEAT_CROP: return ItemId.WHEAT_SEEDS;
      default: return null;
    }
  }

  public registerSource(x: number, y: number, z: number, type: Block.WATER | Block.LAVA) {
    const key = this.getKey(x, y, z);
    this.flowMap.set(key, { type, dist: 0, isSource: true });
    this.queueUpdate(x, y, z);
  }

  public onBlockChanged(x: number, y: number, z: number, newBlock: Block) {
    const key = this.getKey(x, y, z);

    if (newBlock === Block.WATER || newBlock === Block.LAVA) {
      if (!this.flowMap.has(key)) {
        this.flowMap.set(key, { type: newBlock, dist: 0, isSource: true });
      }
    } else {
      this.flowMap.delete(key);
    }

    // Queue this block and all 6 surrounding neighbors for fluid evaluation
    this.queueUpdate(x, y, z);
    this.queueUpdate(x + 1, y, z);
    this.queueUpdate(x - 1, y, z);
    this.queueUpdate(x, y + 1, z);
    this.queueUpdate(x, y - 1, z);
    this.queueUpdate(x, y, z + 1);
    this.queueUpdate(x, y, z - 1);
  }

  public queueUpdate(x: number, y: number, z: number) {
    const key = this.getKey(x, y, z);
    if (!this.queuedKeys.has(key)) {
      this.queuedKeys.add(key);
      this.updateQueue.push({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    }
  }

  public update(dt: number) {
    this.waterTimer += dt;
    this.lavaTimer += dt;

    const canWater = this.waterTimer >= this.WATER_TICK;
    const canLava = this.lavaTimer >= this.LAVA_TICK;

    if (!canWater && !canLava) return;
    if (canWater) this.waterTimer = 0;
    if (canLava) this.lavaTimer = 0;

    if (this.updateQueue.length === 0) return;

    // Track dirty chunks to rebuild once per tick rather than once per block
    const dirtyChunks = new Set<Chunk>();
    const processBudget = Math.min(this.updateQueue.length, 36);

    for (let i = 0; i < processBudget; i++) {
      const coord = this.updateQueue.shift();
      if (!coord) break;
      const key = this.getKey(coord.x, coord.y, coord.z);
      this.queuedKeys.delete(key);

      this.processFluidAt(coord.x, coord.y, coord.z, dirtyChunks);
    }

    // Rebuild all modified chunks
    for (const chunk of dirtyChunks) {
      this.world.rebuildChunkMesh(chunk);
    }
  }

  private processFluidAt(x: number, y: number, z: number, dirtyChunks: Set<Chunk>) {
    const block = this.world.getBlock(x, y, z);
    const key = this.getKey(x, y, z);

    // If block is air, check if neighboring fluid wants to flow into it
    if (block === Block.AIR || this.isFragile(block)) {
      // Find highest potential fluid neighbor (smallest distance)
      let bestFluid: { type: Block.WATER | Block.LAVA; dist: number } | null = null;

      // 1. Check above (waterfall flowing directly down)
      const aboveBlock = this.world.getBlock(x, y + 1, z);
      if (aboveBlock === Block.WATER || aboveBlock === Block.LAVA) {
        bestFluid = { type: aboveBlock, dist: 1 };
      }

      // 2. Check 4 horizontal neighbors if no vertical flow from directly above
      if (!bestFluid) {
        const cardinals = [
          [1, 0], [-1, 0], [0, 1], [0, -1]
        ];
        for (const [dx, dz] of cardinals) {
          const nx = x + dx;
          const nz = z + dz;
          const nb = this.world.getBlock(nx, y, nz);
          if (nb === Block.WATER || nb === Block.LAVA) {
            const nKey = this.getKey(nx, y, nz);
            const nCell = this.flowMap.get(nKey);
            const nDist = nCell ? nCell.dist : 0;
            const maxDist = nb === Block.WATER ? FluidSimulator.MAX_WATER_DIST : FluidSimulator.MAX_LAVA_DIST;

            if (nDist < maxDist) {
              if (!bestFluid || (nDist + 1 < bestFluid.dist)) {
                bestFluid = { type: nb, dist: nDist + 1 };
              }
            }
          }
        }
      }

      if (bestFluid) {
        // Wash fragile block
        if (this.isFragile(block)) {
          const drop = this.getFragileDrop(block);
          if (drop) {
            this.onDropItem?.(drop, 1, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
          }
        }

        // Set fluid block
        this.flowMap.set(key, { type: bestFluid.type, dist: bestFluid.dist, isSource: false });
        this.setBlockSilently(x, y, z, bestFluid.type, dirtyChunks);

        // Queue neighbors to continue the flow
        this.queueUpdate(x, y - 1, z);
        this.queueUpdate(x + 1, y, z);
        this.queueUpdate(x - 1, y, z);
        this.queueUpdate(x, y, z + 1);
        this.queueUpdate(x, y, z - 1);
      }
      return;
    }

    // If block is water or lava, handle propagation and drainage
    if (block === Block.WATER || block === Block.LAVA) {
      let cell = this.flowMap.get(key);
      if (!cell) {
        cell = { type: block, dist: 0, isSource: true };
        this.flowMap.set(key, cell);
      }

      // Check drainage for non-source flowing fluids
      if (!cell.isSource && cell.dist > 0) {
        let hasSourceSupply = false;

        // Above feeding?
        const above = this.world.getBlock(x, y + 1, z);
        if (above === cell.type) {
          hasSourceSupply = true;
        } else {
          // Horizontal upstream neighbor with lower dist?
          const cardinals = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [dx, dz] of cardinals) {
            const nb = this.world.getBlock(x + dx, y, z + dz);
            if (nb === cell.type) {
              const nCell = this.flowMap.get(this.getKey(x + dx, y, z + dz));
              if (nCell && nCell.dist < cell.dist) {
                hasSourceSupply = true;
                break;
              }
            }
          }
        }

        if (!hasSourceSupply) {
          // Fluid drains back into air!
          this.flowMap.delete(key);
          this.setBlockSilently(x, y, z, Block.AIR, dirtyChunks);
          this.queueUpdate(x, y - 1, z);
          this.queueUpdate(x + 1, y, z);
          this.queueUpdate(x - 1, y, z);
          this.queueUpdate(x, y, z + 1);
          this.queueUpdate(x, y, z - 1);
          return;
        }
      }

      // Downward propagation check
      if (y > 0) {
        const below = this.world.getBlock(x, y - 1, z);
        if (below === Block.AIR || this.isFragile(below)) {
          this.queueUpdate(x, y - 1, z);
          return; // Waterfall flows down before spreading horizontally
        }

        // Water meeting lava below
        if (cell.type === Block.WATER && below === Block.LAVA) {
          const belowKey = this.getKey(x, y - 1, z);
          const belowCell = this.flowMap.get(belowKey);
          const isLavaSource = !belowCell || belowCell.isSource;
          const result = isLavaSource ? Block.OBSIDIAN : Block.COBBLESTONE;
          this.flowMap.delete(belowKey);
          this.setBlockSilently(x, y - 1, z, result, dirtyChunks);
          this.onExtinguish?.(new THREE.Vector3(x + 0.5, y - 0.5, z + 0.5), result);
          return;
        }
      }

      // Horizontal spread check
      const maxDist = cell.type === Block.WATER ? FluidSimulator.MAX_WATER_DIST : FluidSimulator.MAX_LAVA_DIST;
      if (cell.dist < maxDist) {
        const cardinals = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dz] of cardinals) {
          const nx = x + dx;
          const nz = z + dz;
          const nb = this.world.getBlock(nx, y, nz);

          // Water touching lava horizontally
          if (cell.type === Block.WATER && nb === Block.LAVA) {
            const nKey = this.getKey(nx, y, nz);
            this.flowMap.delete(nKey);
            this.setBlockSilently(nx, y, nz, Block.COBBLESTONE, dirtyChunks);
            this.onExtinguish?.(new THREE.Vector3(nx + 0.5, y + 0.5, nz + 0.5), Block.COBBLESTONE);
            continue;
          }

          // Lava touching water horizontally
          if (cell.type === Block.LAVA && nb === Block.WATER) {
            const nKey = this.getKey(nx, y, nz);
            this.flowMap.delete(nKey);
            this.setBlockSilently(nx, y, nz, Block.STONE, dirtyChunks);
            this.onExtinguish?.(new THREE.Vector3(nx + 0.5, y + 0.5, nz + 0.5), Block.STONE);
            continue;
          }

          if (nb === Block.AIR || this.isFragile(nb)) {
            this.queueUpdate(nx, y, nz);
          }
        }
      }
    }
  }

  private setBlockSilently(x: number, y: number, z: number, block: Block, dirtyChunks: Set<Chunk>) {
    const { cx, cz, lx, lz } = this.world.worldToChunkCoords(x, z);
    const chunk = this.world.getOrCreateChunk(cx, cz);
    chunk.setBlock(lx, y, lz, block);
    dirtyChunks.add(chunk);

    // If on boundary, mark neighbor chunk dirty as well
    if (lx === 0) {
      const nb = this.world.getChunk(cx - 1, cz);
      if (nb) dirtyChunks.add(nb);
    }
    if (lx === 15) {
      const nb = this.world.getChunk(cx + 1, cz);
      if (nb) dirtyChunks.add(nb);
    }
    if (lz === 0) {
      const nb = this.world.getChunk(cx, cz - 1);
      if (nb) dirtyChunks.add(nb);
    }
    if (lz === 15) {
      const nb = this.world.getChunk(cx, cz + 1);
      if (nb) dirtyChunks.add(nb);
    }
  }

  /**
   * Calculates the 3D fluid flow current vector at the given world coordinates.
   * Uses fluid simulation flowMap distances and neighbor gradients to compute
   * authentic directional current vectors for players, mobs, and dropped items.
   */
  public getFlowVector(x: number, y: number, z: number): THREE.Vector3 {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);

    const currentBlock = this.world.getBlock(bx, by, bz);
    if (currentBlock !== Block.WATER && currentBlock !== Block.LAVA) {
      return new THREE.Vector3(0, 0, 0);
    }

    const flow = new THREE.Vector3(0, 0, 0);
    const key = this.getKey(bx, by, bz);
    const cell = this.flowMap.get(key);
    const currentDist = cell ? cell.dist : 0;

    // 1. Horizontal gradient across 4 cardinal neighbors
    const cardinals = [
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];

    for (const [dx, dz] of cardinals) {
      const nx = bx + dx;
      const nz = bz + dz;
      const nb = this.world.getBlock(nx, by, nz);
      const nbBelow = this.world.getBlock(nx, by - 1, nz);

      // If neighbor drops into air/void below, strong current towards that drop
      if (nbBelow === Block.AIR || this.isFragile(nbBelow)) {
        flow.x += dx * 3.0;
        flow.z += dz * 3.0;
      } else if (nb === Block.AIR || this.isFragile(nb)) {
        // Open air horizontal spread direction
        flow.x += dx * 2.0;
        flow.z += dz * 2.0;
      } else if (nb === currentBlock) {
        const nCell = this.flowMap.get(this.getKey(nx, by, nz));
        const nDist = nCell ? nCell.dist : 0;
        // Fluid flows from upstream (lower dist) to downstream (higher dist)
        const diff = nDist - currentDist;
        flow.x += dx * diff;
        flow.z += dz * diff;
      }
    }

    // 2. Vertical waterfall current
    const above = this.world.getBlock(bx, by + 1, bz);
    const below = this.world.getBlock(bx, by - 1, bz);
    if (above === currentBlock || below === Block.AIR || below === currentBlock) {
      flow.y -= 1.0;
    }

    // Normalize horizontal current direction while retaining proportional strength
    const horizLen = Math.sqrt(flow.x * flow.x + flow.z * flow.z);
    if (horizLen > 0.001) {
      flow.x /= horizLen;
      flow.z /= horizLen;
    }

    // Viscosity dampening for lava currents
    if (currentBlock === Block.LAVA) {
      flow.multiplyScalar(0.4);
    }

    return flow;
  }
}
