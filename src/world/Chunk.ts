import * as THREE from 'three';
import { Block, BLOCK_DEFS } from './BlockTypes';
import { TextureAtlas } from '../textures/TextureAtlas';
import { TerrainGenerator } from './TerrainGenerator';

// Face directions: PX=0, NX=1, PY=2, NY=3, PZ=4, NZ=5
export const FACES = [
  { dir: [1, 0, 0], norm: [1, 0, 0], light: 0.75, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] }, // PX
  { dir: [-1, 0, 0], norm: [-1, 0, 0], light: 0.75, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] }, // NX
  { dir: [0, 1, 0], norm: [0, 1, 0], light: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] }, // PY (Top)
  { dir: [0, -1, 0], norm: [0, -1, 0], light: 0.5, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] }, // NY (Bottom)
  { dir: [0, 0, 1], norm: [0, 0, 1], light: 0.85, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] }, // PZ
  { dir: [0, 0, -1], norm: [0, 0, -1], light: 0.85, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }  // NZ
];

export class Chunk {
  public chunkX: number;
  public chunkZ: number;
  public worldX: number;
  public worldZ: number;
  public data: Uint8Array;
  public mesh: THREE.Mesh | null = null;
  public waterMesh: THREE.Mesh | null = null;
  public isDirty: boolean = true;
  public torchPositions: THREE.Vector3[] = [];

  constructor(chunkX: number, chunkZ: number, data?: Uint8Array) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.worldX = chunkX * TerrainGenerator.CHUNK_WIDTH;
    this.worldZ = chunkZ * TerrainGenerator.CHUNK_DEPTH;
    this.data = data || new Uint8Array(TerrainGenerator.CHUNK_WIDTH * TerrainGenerator.CHUNK_HEIGHT * TerrainGenerator.CHUNK_DEPTH);
  }

  public getIndex(x: number, y: number, z: number): number {
    return (y * TerrainGenerator.CHUNK_DEPTH + z) * TerrainGenerator.CHUNK_WIDTH + x;
  }

  public getBlock(x: number, y: number, z: number): Block {
    if (x < 0 || x >= TerrainGenerator.CHUNK_WIDTH || y < 0 || y >= TerrainGenerator.CHUNK_HEIGHT || z < 0 || z >= TerrainGenerator.CHUNK_DEPTH) {
      return Block.AIR;
    }
    return this.data[this.getIndex(x, y, z)] as Block;
  }

  public setBlock(x: number, y: number, z: number, block: Block) {
    if (x < 0 || x >= TerrainGenerator.CHUNK_WIDTH || y < 0 || y >= TerrainGenerator.CHUNK_HEIGHT || z < 0 || z >= TerrainGenerator.CHUNK_DEPTH) {
      return;
    }
    this.data[this.getIndex(x, y, z)] = block;
    this.isDirty = true;
  }

  // Calculate vertex ambient occlusion (0 = maximum occlusion, 3 = no occlusion)
  private getVertexAO(side1: boolean, side2: boolean, corner: boolean): number {
    if (side1 && side2) return 0;
    return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
  }

  // Generate chunk geometries (solid opaque/cutout mesh & transparent water mesh)
  public buildMesh(
    material: THREE.Material,
    waterMaterial: THREE.Material,
    getNeighborBlock: (wx: number, wy: number, wz: number) => Block
  ): { solid: THREE.Mesh | null; water: THREE.Mesh | null } {
    this.torchPositions = [];
    const solidPositions: number[] = [];
    const solidNormals: number[] = [];
    const solidUVs: number[] = [];
    const solidColors: number[] = [];
    const solidFoliage: number[] = [];
    const solidIndices: number[] = [];

    const waterPositions: number[] = [];
    const waterNormals: number[] = [];
    const waterUVs: number[] = [];
    const waterColors: number[] = [];
    const waterIndices: number[] = [];

    let solidVertexCount = 0;
    let waterVertexCount = 0;

    const aoLevels = [0.45, 0.65, 0.82, 1.0]; // AO color multipliers

    for (let x = 0; x < TerrainGenerator.CHUNK_WIDTH; x++) {
      for (let y = 0; y < TerrainGenerator.CHUNK_HEIGHT; y++) {
        for (let z = 0; z < TerrainGenerator.CHUNK_DEPTH; z++) {
          const block = this.getBlock(x, y, z);
          if (block === Block.AIR) continue;

          const def = BLOCK_DEFS[block];
          if (!def) continue;

          const wx = this.worldX + x;
          const wz = this.worldZ + z;

          // Special case: Flowers / Plants / Cobwebs (cross geometry)
          if (
            block === Block.DANDELION ||
            block === Block.POPPY ||
            block === Block.COBWEB ||
            block === Block.SUGAR_CANE ||
            block === Block.RED_MUSHROOM ||
            block === Block.BROWN_MUSHROOM ||
            block === Block.END_CRYSTAL
          ) {
            this.buildCrossGeometry(
              def.textures[0],
              wx, y, wz,
              solidPositions, solidNormals, solidUVs, solidColors, solidIndices,
              solidVertexCount
            );
            for (let i = 0; i < 8; i++) solidFoliage.push(1.0);
            solidVertexCount += 8;
            continue;
          }

          // Special case: Flat surface attachments (rail tracks, lily pads, end portal void)
          if (block === Block.RAIL || block === Block.LILY_PAD || block === Block.END_PORTAL) {
            const yOffset = block === Block.END_PORTAL ? 0.75 : 0.03;
            this.buildFlatGeometry(
              def.textures[0],
              wx, y, wz,
              solidPositions, solidNormals, solidUVs, solidColors, solidIndices,
              solidVertexCount,
              yOffset
            );
            for (let i = 0; i < 4; i++) solidFoliage.push(block === Block.LILY_PAD ? 1.0 : 0.0);
            solidVertexCount += 4;
            continue;
          }

          // Special case: Torches (authentic slender 3D post with glowing flame cap)
          if (block === Block.TORCH || block === Block.REDSTONE_TORCH) {
            this.buildTorchGeometry(
              def.textures[0],
              wx, y, wz,
              solidPositions, solidNormals, solidUVs, solidColors, solidIndices,
              solidVertexCount,
              block === Block.REDSTONE_TORCH
            );
            for (let i = 0; i < 24; i++) solidFoliage.push(0.0);
            solidVertexCount += 24;
            this.torchPositions.push(new THREE.Vector3(wx + 0.5, y + 0.65, wz + 0.5));
            continue;
          }

          // Standard voxel cube face culling
          const isWater = block === Block.WATER;
          const isLeaves = block === Block.OAK_LEAVES || block === Block.BIRCH_LEAVES;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nx = wx + face.dir[0];
            const ny = y + face.dir[1];
            const nz = wz + face.dir[2];

            const neighborBlock = (nx >= this.worldX && nx < this.worldX + 16 &&
                                   ny >= 0 && ny < TerrainGenerator.CHUNK_HEIGHT &&
                                   nz >= this.worldZ && nz < this.worldZ + 16)
              ? this.getBlock(nx - this.worldX, ny, nz - this.worldZ)
              : getNeighborBlock(nx, ny, nz);

            const neighborDef = BLOCK_DEFS[neighborBlock] || BLOCK_DEFS[Block.AIR];

            // Culling condition
            if (isWater) {
              // Never render internal boundaries between water blocks or submerged vegetation
              if (neighborBlock === Block.WATER || neighborBlock === Block.SEAGRASS || neighborBlock === Block.KELP) {
                continue;
              }
              // Don't render against solid stone, dirt, sand
              if (!neighborDef.transparent && neighborBlock !== Block.AIR) {
                continue;
              }
            } else {
              // Solid block: only render if neighbor is transparent and not the same block
              if (!neighborDef.transparent) continue;
              if (block === neighborBlock && block === Block.OAK_LEAVES) continue;
              if (block === neighborBlock && block === Block.BIRCH_LEAVES) continue;
            }

            // Texture UV
            const texIndex = def.textures[f];
            const [u0, v0, u1, v1] = TextureAtlas.getUV(texIndex);

            // Compute Ambient Occlusion for 4 corners across all 6 faces (Smooth Lighting)
            const aoMultipliers: number[] = [1, 1, 1, 1];
            if (!isWater) {
              const isSolid = (bx: number, by: number, bz: number) => {
                const b = (bx >= this.worldX && bx < this.worldX + 16 &&
                           by >= 0 && by < TerrainGenerator.CHUNK_HEIGHT &&
                           bz >= this.worldZ && bz < this.worldZ + 16)
                  ? this.getBlock(bx - this.worldX, by, bz - this.worldZ)
                  : getNeighborBlock(bx, by, bz);
                return !BLOCK_DEFS[b]?.transparent;
              };

              for (let c = 0; c < 4; c++) {
                const corner = face.corners[c];
                let s1 = false, s2 = false, cor = false;

                if (f === 2) { // Top face (PY)
                  const dx = corner[0] === 1 ? 1 : -1;
                  const dz = corner[2] === 1 ? 1 : -1;
                  s1 = isSolid(wx + dx, y + 1, wz);
                  s2 = isSolid(wx, y + 1, wz + dz);
                  cor = isSolid(wx + dx, y + 1, wz + dz);
                } else if (f === 3) { // Bottom face (NY)
                  const dx = corner[0] === 1 ? 1 : -1;
                  const dz = corner[2] === 1 ? 1 : -1;
                  s1 = isSolid(wx + dx, y - 1, wz);
                  s2 = isSolid(wx, y - 1, wz + dz);
                  cor = isSolid(wx + dx, y - 1, wz + dz);
                } else if (f === 0) { // East face (PX)
                  const dy = corner[1] === 1 ? 1 : -1;
                  const dz = corner[2] === 1 ? 1 : -1;
                  s1 = isSolid(wx + 1, y + dy, wz);
                  s2 = isSolid(wx + 1, y, wz + dz);
                  cor = isSolid(wx + 1, y + dy, wz + dz);
                } else if (f === 1) { // West face (NX)
                  const dy = corner[1] === 1 ? 1 : -1;
                  const dz = corner[2] === 1 ? 1 : -1;
                  s1 = isSolid(wx - 1, y + dy, wz);
                  s2 = isSolid(wx - 1, y, wz + dz);
                  cor = isSolid(wx - 1, y + dy, wz + dz);
                } else if (f === 4) { // South face (PZ)
                  const dx = corner[0] === 1 ? 1 : -1;
                  const dy = corner[1] === 1 ? 1 : -1;
                  s1 = isSolid(wx + dx, y, wz + 1);
                  s2 = isSolid(wx, y + dy, wz + 1);
                  cor = isSolid(wx + dx, y + dy, wz + 1);
                } else if (f === 5) { // North face (NZ)
                  const dx = corner[0] === 1 ? 1 : -1;
                  const dy = corner[1] === 1 ? 1 : -1;
                  s1 = isSolid(wx + dx, y, wz - 1);
                  s2 = isSolid(wx, y + dy, wz - 1);
                  cor = isSolid(wx + dx, y + dy, wz - 1);
                }

                const ao = this.getVertexAO(s1, s2, cor);
                aoMultipliers[c] = aoLevels[ao];
              }
            }

            const targetPos = isWater ? waterPositions : solidPositions;
            const targetNorm = isWater ? waterNormals : solidNormals;
            const targetUV = isWater ? waterUVs : solidUVs;
            const targetCol = isWater ? waterColors : solidColors;
            const targetInd = isWater ? waterIndices : solidIndices;
            const vOffset = isWater ? waterVertexCount : solidVertexCount;

            // 4 vertices of the quad
            const c0 = face.corners[0];
            const c1 = face.corners[1];
            const c2 = face.corners[2];
            const c3 = face.corners[3];

            // Water surface drop: top face and top edge of side faces drop by -0.12
            // so water side walls connect seamlessly with the surface with no rectangular lip!
            const getWaterDrop = (cornerY: number) => {
              if (!isWater) return 0;
              if (f === 2) return -0.12; // Top face
              if (cornerY === 1) return -0.12; // Top edge of side wall
              return 0;
            };

            targetPos.push(
              wx + c0[0], y + c0[1] + getWaterDrop(c0[1]), wz + c0[2],
              wx + c1[0], y + c1[1] + getWaterDrop(c1[1]), wz + c1[2],
              wx + c2[0], y + c2[1] + getWaterDrop(c2[1]), wz + c2[2],
              wx + c3[0], y + c3[1] + getWaterDrop(c3[1]), wz + c3[2]
            );

            for (let i = 0; i < 4; i++) {
              targetNorm.push(face.norm[0], face.norm[1], face.norm[2]);
            }

            targetUV.push(
              u0, v0,
              u1, v0,
              u1, v1,
              u0, v1
            );

            // Vertex colors with directional light & AO
            for (let i = 0; i < 4; i++) {
              const lightVal = face.light * aoMultipliers[i];
              targetCol.push(lightVal, lightVal, lightVal);
            }

            // Indices (two triangles per quad)
            targetInd.push(
              vOffset + 0, vOffset + 1, vOffset + 2,
              vOffset + 0, vOffset + 2, vOffset + 3
            );

            if (isWater) {
              waterVertexCount += 4;
            } else {
              solidVertexCount += 4;
              const fol = isLeaves ? 1.0 : 0.0;
              for (let i = 0; i < 4; i++) solidFoliage.push(fol);
            }
          }
        }
      }
    }

    // Clean up existing meshes
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }

    // Build solid mesh
    if (solidPositions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(solidPositions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(solidNormals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(solidUVs, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(solidColors, 3));
      geo.setAttribute('aFoliage', new THREE.Float32BufferAttribute(solidFoliage, 1));
      geo.setIndex(solidIndices);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();

      this.mesh = new THREE.Mesh(geo, material);
      this.mesh.castShadow = false;
      this.mesh.receiveShadow = true;
      this.mesh.matrixAutoUpdate = false;
      this.mesh.updateMatrix();
    }

    // Build water mesh
    if (waterPositions.length > 0) {
      const wGeo = new THREE.BufferGeometry();
      wGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
      wGeo.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
      wGeo.setAttribute('uv', new THREE.Float32BufferAttribute(waterUVs, 2));
      wGeo.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
      wGeo.setIndex(waterIndices);
      wGeo.computeBoundingBox();
      wGeo.computeBoundingSphere();

      this.waterMesh = new THREE.Mesh(wGeo, waterMaterial);
      this.waterMesh.castShadow = false;
      this.waterMesh.receiveShadow = false;
      this.waterMesh.matrixAutoUpdate = false;
      this.waterMesh.updateMatrix();
    }

    this.isDirty = false;
    return { solid: this.mesh, water: this.waterMesh };
  }

  // Cross geometry for flowers / plants
  private buildCrossGeometry(
    texIndex: number,
    wx: number, y: number, wz: number,
    pos: number[], norm: number[], uvs: number[], cols: number[], ind: number[],
    vOffset: number
  ) {
    const [u0, v0, u1, v1] = TextureAtlas.getUV(texIndex);

    // Quad 1: diagonal (0,0) to (1,1)
    pos.push(
      wx, y, wz,
      wx + 1, y, wz + 1,
      wx + 1, y + 1, wz + 1,
      wx, y + 1, wz
    );
    // Quad 2: diagonal (1,0) to (0,1)
    pos.push(
      wx + 1, y, wz,
      wx, y, wz + 1,
      wx, y + 1, wz + 1,
      wx + 1, y + 1, wz
    );

    for (let i = 0; i < 8; i++) {
      norm.push(0, 1, 0);
      cols.push(0.9, 0.9, 0.9);
    }

    uvs.push(
      u0, v0, u1, v0, u1, v1, u0, v1,
      u0, v0, u1, v0, u1, v1, u0, v1
    );

    ind.push(
      vOffset + 0, vOffset + 1, vOffset + 2,
      vOffset + 0, vOffset + 2, vOffset + 3,
      vOffset + 4, vOffset + 5, vOffset + 6,
      vOffset + 4, vOffset + 6, vOffset + 7
    );
  }

  // Flat geometry for rails, lily pads, and end portal surfaces
  private buildFlatGeometry(
    texIndex: number,
    wx: number, y: number, wz: number,
    pos: number[], norm: number[], uvs: number[], cols: number[], ind: number[],
    vOffset: number,
    yOffset: number = 0.03
  ) {
    const [u0, v0, u1, v1] = TextureAtlas.getUV(texIndex);
    const yOff = y + yOffset; // slightly elevated to avoid z-fighting or sit in frame

    pos.push(
      wx, yOff, wz,
      wx + 1, yOff, wz,
      wx + 1, yOff, wz + 1,
      wx, yOff, wz + 1
    );

    for (let i = 0; i < 4; i++) {
      norm.push(0, 1, 0);
      cols.push(0.95, 0.95, 0.95);
    }

    uvs.push(
      u0, v0,
      u1, v0,
      u1, v1,
      u0, v1
    );

    ind.push(
      vOffset + 0, vOffset + 3, vOffset + 2,
      vOffset + 0, vOffset + 2, vOffset + 1
    );
  }

  // Authentic 3D slender torch geometry (2x2 pixel post, 10 pixels high, glowing top flame)
  private buildTorchGeometry(
    texIndex: number,
    wx: number, y: number, wz: number,
    pos: number[], norm: number[], uvs: number[], cols: number[], ind: number[],
    vOffset: number,
    isRedstone: boolean = false
  ) {
    const [uMin, vMin, uMax, vMax] = TextureAtlas.getUV(texIndex);
    const uSpan = uMax - uMin;
    const vSpan = vMax - vMin;

    // The torch in the 16x16 tile is drawn at x: 6..10 (center 7..9), y: 2..16 (top flame y=2..6, stick y=6..16)
    // WebGL V: vMin is bottom of tile (y=16), vMax is top of tile (y=0)
    const u0 = uMin + uSpan * (7.0 / 16.0);
    const u1 = uMin + uSpan * (9.0 / 16.0);
    const v0 = vMin; // stick bottom
    const v1 = vMin + vSpan * (14.0 / 16.0); // flame top (y=2 from top -> 14/16 from bottom)
    const vFlame = vMin + vSpan * (10.0 / 16.0); // flame base (y=6 from top -> 10/16 from bottom)

    // Torch post bounds: width 0.125 (2/16), height 0.625 (10/16)
    const x0 = wx + 0.4375;
    const x1 = wx + 0.5625;
    const z0 = wz + 0.4375;
    const z1 = wz + 0.5625;
    const y0 = y;
    const y1 = y + 0.625;

    const flameColor = isRedstone ? [1.6, 0.3, 0.25] : [1.6, 1.4, 0.95];
    const stickColor = [0.95, 0.85, 0.72];

    // 1. Top face (flame cap)
    pos.push(
      x0, y1, z0,
      x1, y1, z0,
      x1, y1, z1,
      x0, y1, z1
    );
    for (let i = 0; i < 4; i++) {
      norm.push(0, 1, 0);
      cols.push(flameColor[0], flameColor[1], flameColor[2]);
    }
    uvs.push(u0, vFlame, u1, vFlame, u1, v1, u0, v1);

    // 2. North face (z = z0)
    pos.push(
      x1, y0, z0,
      x0, y0, z0,
      x0, y1, z0,
      x1, y1, z0
    );
    norm.push(0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1);
    cols.push(
      stickColor[0], stickColor[1], stickColor[2],
      stickColor[0], stickColor[1], stickColor[2],
      flameColor[0], flameColor[1], flameColor[2],
      flameColor[0], flameColor[1], flameColor[2]
    );
    uvs.push(u1, v0, u0, v0, u0, v1, u1, v1);

    // 3. South face (z = z1)
    pos.push(
      x0, y0, z1,
      x1, y0, z1,
      x1, y1, z1,
      x0, y1, z1
    );
    norm.push(0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1);
    cols.push(
      stickColor[0], stickColor[1], stickColor[2],
      stickColor[0], stickColor[1], stickColor[2],
      flameColor[0], flameColor[1], flameColor[2],
      flameColor[0], flameColor[1], flameColor[2]
    );
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);

    // 4. West face (x = x0)
    pos.push(
      x0, y0, z0,
      x0, y0, z1,
      x0, y1, z1,
      x0, y1, z0
    );
    norm.push(-1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0);
    cols.push(
      stickColor[0], stickColor[1], stickColor[2],
      stickColor[0], stickColor[1], stickColor[2],
      flameColor[0], flameColor[1], flameColor[2],
      flameColor[0], flameColor[1], flameColor[2]
    );
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);

    // 5. East face (x = x1)
    pos.push(
      x1, y0, z1,
      x1, y0, z0,
      x1, y0, z0,
      x1, y1, z1
    );
    norm.push(1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0);
    cols.push(
      stickColor[0], stickColor[1], stickColor[2],
      stickColor[0], stickColor[1], stickColor[2],
      flameColor[0], flameColor[1], flameColor[2],
      flameColor[0], flameColor[1], flameColor[2]
    );
    uvs.push(u1, v0, u0, v0, u0, v1, u1, v1);

    // 6. Bottom face
    pos.push(
      x0, y0, z1,
      x1, y0, z1,
      x1, y0, z0,
      x0, y0, z0
    );
    for (let i = 0; i < 4; i++) {
      norm.push(0, -1, 0);
      cols.push(0.5, 0.4, 0.3);
    }
    uvs.push(u0, v0, u1, v0, u1, vFlame, u0, vFlame);

    // Triangulation for 6 quads
    for (let q = 0; q < 6; q++) {
      const b = vOffset + q * 4;
      ind.push(b + 0, b + 1, b + 2, b + 0, b + 2, b + 3);
    }
  }

  public dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }
  }
}
