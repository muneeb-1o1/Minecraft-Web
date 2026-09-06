import * as THREE from 'three';
import { World } from '../world/World';
import { BLOCK_DEFS, Block } from '../world/BlockTypes';

export class AABB {
  public min: THREE.Vector3;
  public max: THREE.Vector3;

  constructor(min: THREE.Vector3 = new THREE.Vector3(), max: THREE.Vector3 = new THREE.Vector3()) {
    this.min = min;
    this.max = max;
  }

  public set(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    this.min.set(minX, minY, minZ);
    this.max.set(maxX, maxY, maxZ);
  }

  public clone(): AABB {
    return new AABB(this.min.clone(), this.max.clone());
  }

  public intersects(other: AABB): boolean {
    return (
      this.min.x < other.max.x && this.max.x > other.min.x &&
      this.min.y < other.max.y && this.max.y > other.min.y &&
      this.min.z < other.max.z && this.max.z > other.min.z
    );
  }

  // Check collision and resolve movement vector against world blocks
  public static moveAndCollide(
    box: AABB,
    velocity: THREE.Vector3,
    world: World,
    isSneaking: boolean,
    isOnGround: boolean
  ): { resolvedVel: THREE.Vector3; onGround: boolean; hitCeiling: boolean; hitWall: boolean } {
    let onGround = false;
    let hitCeiling = false;
    let hitWall = false;

    let dx = velocity.x;
    let dy = velocity.y;
    let dz = velocity.z;

    // Sneaking edge prevention: clamp horizontal velocity if stepping off ledge
    if (isSneaking && isOnGround) {
      const step = 0.01;
      while (dx !== 0 && !AABB.hasBlockBelow(box, dx, 0, world)) {
        if (dx < step && dx >= -step) dx = 0;
        else if (dx > 0) dx -= step;
        else dx += step;
      }
      while (dz !== 0 && !AABB.hasBlockBelow(box, 0, dz, world)) {
        if (dz < step && dz >= -step) dz = 0;
        else if (dz > 0) dz -= step;
        else dz += step;
      }
      while (dx !== 0 && dz !== 0 && !AABB.hasBlockBelow(box, dx, dz, world)) {
        if (dx < step && dx >= -step) dx = 0;
        else if (dx > 0) dx -= step;
        else dx += step;
        if (dz < step && dz >= -step) dz = 0;
        else if (dz > 0) dz -= step;
        else dz += step;
      }
    }

    // 1. Resolve Y axis
    const yBlocks = AABB.getSurroundingSolidBlocks(box, dx, dy, dz, world);
    for (const b of yBlocks) {
      if (box.min.x + dx < b.max.x && box.max.x + dx > b.min.x &&
          box.min.z + dz < b.max.z && box.max.z + dz > b.min.z) {
        if (dy > 0 && box.max.y <= b.min.y && box.max.y + dy > b.min.y) {
          dy = b.min.y - box.max.y;
          hitCeiling = true;
        } else if (dy <= 0 && box.min.y >= b.max.y - 0.05 && box.min.y + dy <= b.max.y) {
          dy = b.max.y - box.min.y;
          onGround = true;
        }
      }
    }
    box.min.y += dy;
    box.max.y += dy;

    // 2. Resolve X axis
    for (const b of yBlocks) {
      if (box.min.y < b.max.y && box.max.y > b.min.y &&
          box.min.z + dz < b.max.z && box.max.z + dz > b.min.z) {
        if (dx > 0 && box.max.x <= b.min.x && box.max.x + dx > b.min.x) {
          dx = b.min.x - box.max.x;
          hitWall = true;
        } else if (dx < 0 && box.min.x >= b.max.x && box.min.x + dx < b.max.x) {
          dx = b.max.x - box.min.x;
          hitWall = true;
        }
      }
    }
    box.min.x += dx;
    box.max.x += dx;

    // 3. Resolve Z axis
    for (const b of yBlocks) {
      if (box.min.y < b.max.y && box.max.y > b.min.y &&
          box.min.x < b.max.x && box.max.x > b.min.x) {
        if (dz > 0 && box.max.z <= b.min.z && box.max.z + dz > b.min.z) {
          dz = b.min.z - box.max.z;
          hitWall = true;
        } else if (dz < 0 && box.min.z >= b.max.z && box.min.z + dz < b.max.z) {
          dz = b.max.z - box.min.z;
          hitWall = true;
        }
      }
    }
    box.min.z += dz;
    box.max.z += dz;

    return {
      resolvedVel: new THREE.Vector3(dx, dy, dz),
      onGround,
      hitCeiling,
      hitWall
    };
  }

  // Helper to check if there is ground under shifted player
  public static hasBlockBelow(box: AABB, offsetX: number, offsetZ: number, world: World): boolean {
    const checkMinX = box.min.x + offsetX;
    const checkMaxX = box.max.x + offsetX;
    const checkMinZ = box.min.z + offsetZ;
    const checkMaxZ = box.max.z + offsetZ;
    const checkY = Math.floor(box.min.y - 0.1);

    const bMinX = Math.floor(checkMinX);
    const bMaxX = Math.floor(checkMaxX - 0.0001);
    const bMinZ = Math.floor(checkMinZ);
    const bMaxZ = Math.floor(checkMaxZ - 0.0001);

    for (let x = bMinX; x <= bMaxX; x++) {
      for (let z = bMinZ; z <= bMaxZ; z++) {
        const b = world.getBlock(x, checkY, z);
        if (b === Block.AIR || b === Block.WATER || b === Block.LAVA || !BLOCK_DEFS[b]?.solid) {
          return false;
        }
      }
    }
    return true;
  }

  // Get bounding boxes of solid blocks in player neighborhood
  private static getSurroundingSolidBlocks(box: AABB, dx: number, dy: number, dz: number, world: World): AABB[] {
    const blocks: AABB[] = [];
    const minX = Math.floor(Math.min(box.min.x, box.min.x + dx) - 0.1);
    const maxX = Math.floor(Math.max(box.max.x, box.max.x + dx) + 0.1);
    const minY = Math.floor(Math.min(box.min.y, box.min.y + dy) - 0.1);
    const maxY = Math.floor(Math.max(box.max.y, box.max.y + dy) + 0.1);
    const minZ = Math.floor(Math.min(box.min.z, box.min.z + dz) - 0.1);
    const maxZ = Math.floor(Math.max(box.max.z, box.max.z + dz) + 0.1);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const block = world.getBlock(x, y, z);
          if (block !== Block.AIR && block !== Block.WATER && BLOCK_DEFS[block]?.solid) {
            blocks.push(new AABB(
              new THREE.Vector3(x, y, z),
              new THREE.Vector3(x + 1, y + 1, z + 1)
            ));
          }
        }
      }
    }
    return blocks;
  }
}
