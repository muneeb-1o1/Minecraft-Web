import * as THREE from 'three';
import { Block, BLOCK_DEFS } from './BlockTypes';
import { Chunk } from './Chunk';
import { TerrainGenerator } from './TerrainGenerator';
import { TextureAtlas } from '../textures/TextureAtlas';
import { FluidSimulator } from './FluidSimulator';

export interface RaycastHit {
  hit: boolean;
  block: Block;
  pos: THREE.Vector3; // Integer world coordinates of hit block
  normal: THREE.Vector3; // Normal face pointing away from hit block
  distance: number;
}

export class World {
  public scene: THREE.Scene;
  public generator: TerrainGenerator;
  public atlas: TextureAtlas;
  public fluidSimulator: FluidSimulator;
  public overworldChunks: Map<string, Chunk> = new Map();
  public netherChunks: Map<string, Chunk> = new Map();
  public currentDimension: 'overworld' | 'nether' = 'overworld';
  public chunks: Map<string, Chunk> = this.overworldChunks;
  public renderDistance: number = 6;

  // Time-sliced smooth chunk meshing & generation system (eliminates lag spikes)
  private lastScanCX: number = 999999;
  private lastScanCZ: number = 999999;
  private chunkScanTimer: number = 0;
  private meshQueue: Chunk[] = [];
  private queuedKeys: Set<string> = new Set();
  private generationQueue: { cx: number; cz: number }[] = [];
  private queuedGenKeys: Set<string> = new Set();

  public terrainMaterial: THREE.MeshStandardMaterial;
  public waterMaterial: THREE.MeshStandardMaterial;
  public waterUniforms: {
    uTime: { value: number };
    uShallowColor: { value: THREE.Color };
    uDeepColor: { value: THREE.Color };
    uFresnelColor: { value: THREE.Color };
    uCausticsIntensity: { value: number };
  };
  public terrainUniforms: {
    uTime: { value: number };
    uCausticsIntensity: { value: number };
  };

  constructor(scene: THREE.Scene, atlas: TextureAtlas, seed: number = 1337, worldType: 'default' | 'flat' | 'amplified' = 'default') {
    this.scene = scene;
    this.atlas = atlas;
    this.generator = new TerrainGenerator(seed, worldType);
    this.fluidSimulator = new FluidSimulator(this);

    this.waterUniforms = {
      uTime: { value: 0.0 },
      uShallowColor: { value: new THREE.Color(0x3eaaf5) }, // crystal azure shallow water
      uDeepColor: { value: new THREE.Color(0x0c3b88) },    // deep sapphire navy
      uFresnelColor: { value: new THREE.Color(0xd2edff) },  // glancing sky reflection sheen
      uCausticsIntensity: { value: 1.0 }
    };

    this.terrainUniforms = {
      uTime: { value: 0.0 },
      uCausticsIntensity: { value: 1.0 }
    };

    // Opaque and cutout material with vertex colors and pixel filtering
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      map: this.atlas.texture,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05,
      alphaTest: 0.35,
      side: THREE.FrontSide
    });

    // Water translucent material with surface Fresnel and depth-based color modulation
    this.waterMaterial = new THREE.MeshStandardMaterial({
      map: this.atlas.texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      roughness: 0.12,
      metalness: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.setupWaterMaterialShader();
    this.setupTerrainMaterialShader();
  }

  private setupWaterMaterialShader() {
    this.waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterUniforms.uTime;
      shader.uniforms.uShallowColor = this.waterUniforms.uShallowColor;
      shader.uniforms.uDeepColor = this.waterUniforms.uDeepColor;
      shader.uniforms.uFresnelColor = this.waterUniforms.uFresnelColor;
      shader.uniforms.uCausticsIntensity = this.waterUniforms.uCausticsIntensity;

      shader.vertexShader = `
        varying vec3 vCustomWorldPosition;
        varying vec3 vCustomWorldNormal;
        ${shader.vertexShader}
      `.replace(
        '#include <worldpos_vertex>',
        `
        #include <worldpos_vertex>
        vCustomWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vCustomWorldNormal = normalize(mat3(modelMatrix) * normal);
        `
      );

      shader.fragmentShader = `
        uniform float uTime;
        uniform vec3 uShallowColor;
        uniform vec3 uDeepColor;
        uniform vec3 uFresnelColor;
        uniform float uCausticsIntensity;
        varying vec3 vCustomWorldPosition;
        varying vec3 vCustomWorldNormal;
        ${shader.fragmentShader}
      `.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>

        // Water surface fresnel and depth-based color modulation
        vec3 V = normalize(cameraPosition - vCustomWorldPosition);
        vec3 N = normalize(vCustomWorldNormal);

        // Dynamic micro-surface wave ripples
        float waveA = sin(vCustomWorldPosition.x * 2.5 + uTime * 2.8) * cos(vCustomWorldPosition.z * 2.5 + uTime * 2.2);
        float waveB = cos(vCustomWorldPosition.x * 4.0 - vCustomWorldPosition.z * 3.5 + uTime * 3.4);
        vec3 waveNormal = normalize(N + vec3(waveA * 0.08, 0.0, waveB * 0.08));

        // Fresnel reflection factor (grazing angle sheen)
        float cosTheta = clamp(dot(V, waveNormal), 0.0, 1.0);
        float fresnel = pow(1.0 - cosTheta, 3.5);

        // Depth-based color modulation: transitions from azure shallows to deep sapphire ocean depths
        float depth = max(0.0, 30.5 - vCustomWorldPosition.y);
        float depthFactor = clamp(depth / 14.0, 0.0, 1.0);
        vec3 depthWaterCol = mix(uShallowColor, uDeepColor, depthFactor);

        // Animated water caustics wave distortion on surface
        float c1 = sin(vCustomWorldPosition.x * 3.0 + uTime * 2.6) * cos(vCustomWorldPosition.z * 3.0 + uTime * 2.2);
        float c2 = cos(vCustomWorldPosition.x * 4.5 - vCustomWorldPosition.z * 4.5 - uTime * 3.2);
        float caustics = pow(clamp((c1 + c2) * 0.5 + 0.5, 0.0, 1.0), 3.0) * uCausticsIntensity;

        gl_FragColor.rgb = mix(gl_FragColor.rgb, depthWaterCol, 0.55);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uFresnelColor, fresnel * 0.55 + caustics * 0.22);
        gl_FragColor.a = clamp(gl_FragColor.a + fresnel * 0.26, 0.45, 0.95);
        `
      );
    };
  }

  private setupTerrainMaterialShader() {
    this.terrainMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.terrainUniforms.uTime;
      shader.uniforms.uCausticsIntensity = this.terrainUniforms.uCausticsIntensity;

      shader.vertexShader = `
        attribute float aFoliage;
        uniform float uTime;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // Gentle organic wind swaying for leaves, flowers, grass, and crops
        if (aFoliage > 0.5) {
          float heightFactor = clamp(fract(position.y), 0.15, 1.0);
          float sway = sin(uTime * 2.2 + position.x * 0.8 + position.z * 0.8) * 0.045 * heightFactor;
          transformed.x += sway;
          transformed.z += sway * 0.6;
        }
        `
      );
    };
  }

  public setGraphicsPreset(preset: 'retro' | 'fancy' | 'rtx' | 'rtx-ultra') {
    if (preset === 'rtx-ultra') {
      this.waterMaterial.roughness = 0.04;
      this.waterMaterial.metalness = 0.20;
      this.waterMaterial.opacity = 0.68;
      this.terrainMaterial.roughness = 0.82;
      this.terrainMaterial.metalness = 0.04;
    } else if (preset === 'rtx') {
      this.waterMaterial.roughness = 0.08;
      this.waterMaterial.metalness = 0.12;
      this.waterMaterial.opacity = 0.64;
      this.terrainMaterial.roughness = 0.88;
      this.terrainMaterial.metalness = 0.02;
    } else {
      // Authentic Vanilla: crisp matte textures, clear vibrant water with gentle translucency
      this.waterMaterial.roughness = 0.22;
      this.waterMaterial.metalness = 0.0;
      this.waterMaterial.opacity = 0.62;
      this.terrainMaterial.roughness = 0.94;
      this.terrainMaterial.metalness = 0.0;
    }
    this.waterMaterial.needsUpdate = true;
    this.terrainMaterial.needsUpdate = true;
  }

  public getChunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  public getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(this.getChunkKey(cx, cz));
  }

  public getOrCreateChunk(cx: number, cz: number): Chunk {
    const key = this.getChunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const data = this.generator.generateChunkData(cx, cz);
      chunk = new Chunk(cx, cz, data);
      this.chunks.set(key, chunk);

      // Re-mesh any adjacent neighbors that already have meshes so borders merge seamlessly
      const neighbors = [
        this.getChunk(cx - 1, cz),
        this.getChunk(cx + 1, cz),
        this.getChunk(cx, cz - 1),
        this.getChunk(cx, cz + 1)
      ];
      for (const neighbor of neighbors) {
        if (neighbor && neighbor.mesh) {
          neighbor.isDirty = true;
          this.enqueueChunkMesh(neighbor);
        }
      }
    }
    return chunk;
  }

  public worldToChunkCoords(wx: number, wz: number): { cx: number; cz: number; lx: number; lz: number } {
    const cx = Math.floor(wx / TerrainGenerator.CHUNK_WIDTH);
    const cz = Math.floor(wz / TerrainGenerator.CHUNK_DEPTH);
    const lx = ((wx % TerrainGenerator.CHUNK_WIDTH) + TerrainGenerator.CHUNK_WIDTH) % TerrainGenerator.CHUNK_WIDTH;
    const lz = ((wz % TerrainGenerator.CHUNK_DEPTH) + TerrainGenerator.CHUNK_DEPTH) % TerrainGenerator.CHUNK_DEPTH;
    return { cx, cz, lx, lz };
  }

  // Predict border block type deterministically when neighbor chunk is not loaded into memory yet
  public getPredictedBlock(wx: number, wy: number, wz: number): Block {
    if (wy < 0 || wy >= TerrainGenerator.CHUNK_HEIGHT) return Block.AIR;
    if (this.currentDimension !== 'overworld') return Block.AIR;
    if (this.generator.worldType === 'flat') {
      if (wy === 0) return Block.BEDROCK;
      if (wy <= 3) return Block.DIRT;
      if (wy === 4) return Block.GRASS;
      return Block.AIR;
    }
    if (wy === 0) return Block.BEDROCK;
    const surfaceY = this.generator.getHeight(wx, wz);
    if (wy <= surfaceY) {
      return Block.STONE;
    }
    if (surfaceY < TerrainGenerator.SEA_LEVEL && wy <= TerrainGenerator.SEA_LEVEL) {
      return Block.WATER;
    }
    return Block.AIR;
  }

  public getBlock(wx: number, wy: number, wz: number): Block {
    if (wy < 0 || wy >= TerrainGenerator.CHUNK_HEIGHT) return Block.AIR;
    const { cx, cz, lx, lz } = this.worldToChunkCoords(wx, wz);
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (!chunk) return this.getPredictedBlock(wx, wy, wz);
    return chunk.getBlock(lx, wy, lz);
  }

  public enqueueChunkMesh(chunk: Chunk) {
    const key = this.getChunkKey(chunk.chunkX, chunk.chunkZ);
    if (!this.queuedKeys.has(key)) {
      this.queuedKeys.add(key);
      this.meshQueue.push(chunk);
    }
  }

  public setBlock(wx: number, wy: number, wz: number, block: Block): boolean {
    if (wy < 0 || wy >= TerrainGenerator.CHUNK_HEIGHT) return false;
    const { cx, cz, lx, lz } = this.worldToChunkCoords(wx, wz);
    const chunk = this.getOrCreateChunk(cx, cz);
    chunk.setBlock(lx, wy, lz, block);
    this.fluidSimulator.onBlockChanged(wx, wy, wz, block);

    // If on chunk boundary, mark neighbor chunks dirty and enqueue them smoothly
    if (lx === 0) {
      const neighbor = this.getChunk(cx - 1, cz);
      if (neighbor) {
        neighbor.isDirty = true;
        this.enqueueChunkMesh(neighbor);
      }
    }
    if (lx === 15) {
      const neighbor = this.getChunk(cx + 1, cz);
      if (neighbor) {
        neighbor.isDirty = true;
        this.enqueueChunkMesh(neighbor);
      }
    }
    if (lz === 0) {
      const neighbor = this.getChunk(cx, cz - 1);
      if (neighbor) {
        neighbor.isDirty = true;
        this.enqueueChunkMesh(neighbor);
      }
    }
    if (lz === 15) {
      const neighbor = this.getChunk(cx, cz + 1);
      if (neighbor) {
        neighbor.isDirty = true;
        this.enqueueChunkMesh(neighbor);
      }
    }

    // Immediately rebuild modified chunk so block action feels instantaneous
    this.rebuildChunkMesh(chunk);
    return true;
  }

  // Initial immediate generation of spawn chunks
  public generateImmediateSpawnArea(centerCX: number = 0, centerCZ: number = 0) {
    // 1. Generate voxel data for all spawn chunks first
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.getOrCreateChunk(centerCX + dx, centerCZ + dz);
      }
    }
    // 2. Build meshes once all neighbor data is present
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.getChunk(centerCX + dx, centerCZ + dz);
        if (chunk && chunk.isDirty) {
          this.rebuildChunkMesh(chunk);
        }
      }
    }
  }

  // Update water & terrain shader time
  public update(dt: number) {
    this.waterUniforms.uTime.value += dt;
    this.terrainUniforms.uTime.value += dt;
  }

  // Update chunks around player position with high-performance time-budgeted pipeline
  public updateAroundPlayer(playerX: number, playerZ: number, dt: number = 0.016) {
    this.update(dt);
    this.fluidSimulator.update(dt);

    const centerCX = Math.floor(playerX / TerrainGenerator.CHUNK_WIDTH);
    const centerCZ = Math.floor(playerZ / TerrainGenerator.CHUNK_DEPTH);
    const r = this.renderDistance;

    this.chunkScanTimer -= dt;

    // Scan for new chunks when moving or every 200ms
    if (centerCX !== this.lastScanCX || centerCZ !== this.lastScanCZ || this.chunkScanTimer <= 0) {
      this.lastScanCX = centerCX;
      this.lastScanCZ = centerCZ;
      this.chunkScanTimer = 0.20;

      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 1) continue;
          const cx = centerCX + dx;
          const cz = centerCZ + dz;
          const key = this.getChunkKey(cx, cz);

          if (!this.chunks.has(key)) {
            if (!this.queuedGenKeys.has(key)) {
              this.queuedGenKeys.add(key);
              this.generationQueue.push({ cx, cz });
            }
          } else {
            const chunk = this.chunks.get(key)!;
            if (chunk.isDirty) {
              this.enqueueChunkMesh(chunk);
            }
          }
        }
      }

      // Prioritize generation of chunks closest to the player
      this.generationQueue.sort((a, b) => {
        const distA = Math.pow(a.cx - centerCX, 2) + Math.pow(a.cz - centerCZ, 2);
        const distB = Math.pow(b.cx - centerCX, 2) + Math.pow(b.cz - centerCZ, 2);
        return distA - distB;
      });

      // Unload distant chunks outside render distance + 2.5 buffer
      const unloadDistSq = (r + 2.5) * (r + 2.5);
      for (const [key, chunk] of this.chunks.entries()) {
        const dx = chunk.chunkX - centerCX;
        const dz = chunk.chunkZ - centerCZ;
        if (dx * dx + dz * dz > unloadDistSq) {
          if (chunk.mesh) this.scene.remove(chunk.mesh);
          if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
          chunk.dispose();
          this.chunks.delete(key);
          this.queuedKeys.delete(key);
          this.queuedGenKeys.delete(key);
        }
      }

      // Prioritize meshing of chunks closest to the player
      this.meshQueue.sort((a, b) => {
        const distA = Math.pow(a.chunkX - centerCX, 2) + Math.pow(a.chunkZ - centerCZ, 2);
        const distB = Math.pow(b.chunkX - centerCX, 2) + Math.pow(b.chunkZ - centerCZ, 2);
        return distA - distB;
      });
    }

    // High-performance time-budgeted processing (guarantees steady 60+ FPS without micro-stutters)
    const frameStart = performance.now();
    const maxGenBudgetMs = 1.8; // Max 1.8ms per frame for terrain data generation
    const maxMeshBudgetMs = 2.2; // Max 2.2ms per frame for chunk mesh construction

    // 1. Time-budgeted chunk terrain data generation
    while (this.generationQueue.length > 0 && (performance.now() - frameStart) < maxGenBudgetMs) {
      const next = this.generationQueue.shift();
      if (!next) break;
      const key = this.getChunkKey(next.cx, next.cz);
      this.queuedGenKeys.delete(key);

      // Only generate if still within render range
      const dx = next.cx - centerCX;
      const dz = next.cz - centerCZ;
      if (dx * dx + dz * dz <= (r + 1.5) * (r + 1.5)) {
        const chunk = this.getOrCreateChunk(next.cx, next.cz);
        if (chunk.isDirty) {
          this.enqueueChunkMesh(chunk);
        }
      }
    }

    // 2. Time-budgeted chunk mesh building
    while (this.meshQueue.length > 0 && (performance.now() - frameStart) < (maxGenBudgetMs + maxMeshBudgetMs)) {
      const chunk = this.meshQueue.shift();
      if (!chunk) break;
      const key = this.getChunkKey(chunk.chunkX, chunk.chunkZ);
      this.queuedKeys.delete(key);

      if (chunk.isDirty && this.chunks.has(key)) {
        this.rebuildChunkMesh(chunk);
      }
    }

    // Update dynamic torch light pool around player position
    this.updateDynamicTorchLights(playerX, playerZ, dt);
  }

  // Dynamic local torch light pool (max 2 point lights total to maintain solid 60+ FPS)
  private dynamicTorchLights: THREE.PointLight[] = [];
  private torchLightUpdateTimer: number = 0;

  private updateDynamicTorchLights(playerX: number, playerZ: number, dt: number) {
    this.torchLightUpdateTimer -= dt;
    if (this.torchLightUpdateTimer > 0) return;
    this.torchLightUpdateTimer = 0.25; // Update positions 4 times per second

    // Lazy initialization of 2 pool lights
    if (this.dynamicTorchLights.length === 0) {
      for (let i = 0; i < 2; i++) {
        const light = new THREE.PointLight(0xffaa44, 0.9, 11, 1.6);
        light.visible = false;
        this.scene.add(light);
        this.dynamicTorchLights.push(light);
      }
    }

    // Find the 2 closest torches within 14 blocks of player
    const centerCX = Math.floor(playerX / TerrainGenerator.CHUNK_WIDTH);
    const centerCZ = Math.floor(playerZ / TerrainGenerator.CHUNK_DEPTH);

    let nearestTorches: { pos: THREE.Vector3; distSq: number }[] = [];
    const maxRadiusSq = 14 * 14;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.getChunk(centerCX + dx, centerCZ + dz);
        if (!chunk || !chunk.torchPositions) continue;
        for (const pos of chunk.torchPositions) {
          const ddx = pos.x - playerX;
          const ddz = pos.z - playerZ;
          const dSq = ddx * ddx + ddz * ddz;
          if (dSq < maxRadiusSq) {
            nearestTorches.push({ pos, distSq: dSq });
          }
        }
      }
    }

    nearestTorches.sort((a, b) => a.distSq - b.distSq);

    // Assign nearest torches to the 2 pool lights
    for (let i = 0; i < this.dynamicTorchLights.length; i++) {
      const light = this.dynamicTorchLights[i];
      if (i < nearestTorches.length) {
        light.position.copy(nearestTorches[i].pos);
        light.visible = true;
      } else {
        light.visible = false;
      }
    }
  }

  public rebuildChunkMesh(chunk: Chunk) {
    if (chunk.mesh) this.scene.remove(chunk.mesh);
    if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);

    const { solid, water } = chunk.buildMesh(
      this.terrainMaterial,
      this.waterMaterial,
      (wx, wy, wz) => this.getBlock(wx, wy, wz)
    );

    if (solid) this.scene.add(solid);
    if (water) this.scene.add(water);
  }

  // Voxel Digital Differential Analyzer (DDA) raycasting
  public raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number = 6, includeFluids: boolean = false): RaycastHit {
    const noHit: RaycastHit = {
      hit: false,
      block: Block.AIR,
      pos: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      distance: 0
    };

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;

    const stepX = dx >= 0 ? 1 : -1;
    const stepY = dy >= 0 ? 1 : -1;
    const stepZ = dz >= 0 ? 1 : -1;

    const deltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const deltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const deltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

    let maxX = dx >= 0 ? (Math.floor(origin.x) + 1 - origin.x) * deltaX : (origin.x - Math.floor(origin.x)) * deltaX;
    let maxY = dy >= 0 ? (Math.floor(origin.y) + 1 - origin.y) * deltaY : (origin.y - Math.floor(origin.y)) * deltaY;
    let maxZ = dz >= 0 ? (Math.floor(origin.z) + 1 - origin.z) * deltaZ : (origin.z - Math.floor(origin.z)) * deltaZ;

    const normal = new THREE.Vector3();
    let dist = 0;

    while (dist < maxDistance) {
      if (maxX < maxY) {
        if (maxX < maxZ) {
          x += stepX;
          dist = maxX;
          maxX += deltaX;
          normal.set(-stepX, 0, 0);
        } else {
          z += stepZ;
          dist = maxZ;
          maxZ += deltaZ;
          normal.set(0, 0, -stepZ);
        }
      } else {
        if (maxY < maxZ) {
          y += stepY;
          dist = maxY;
          maxY += deltaY;
          normal.set(0, -stepY, 0);
        } else {
          z += stepZ;
          dist = maxZ;
          maxZ += deltaZ;
          normal.set(0, 0, -stepZ);
        }
      }

      if (dist > maxDistance) break;

      const block = this.getBlock(x, y, z);
      if (block !== Block.AIR && (includeFluids || (block !== Block.WATER && block !== Block.LAVA))) {
        return {
          hit: true,
          block,
          pos: new THREE.Vector3(x, y, z),
          normal,
          distance: dist
        };
      }
    }

    return noHit;
  }

  // Find surface height at coordinates for safe player spawn
  public getSafeSpawnHeight(worldX: number, worldZ: number): number {
    const cx = Math.floor(worldX / TerrainGenerator.CHUNK_WIDTH);
    const cz = Math.floor(worldZ / TerrainGenerator.CHUNK_DEPTH);
    this.getOrCreateChunk(cx, cz);

    for (let y = TerrainGenerator.CHUNK_HEIGHT - 1; y >= 1; y--) {
      const block = this.getBlock(worldX, y, worldZ);
      if (block !== Block.AIR && block !== Block.WATER && BLOCK_DEFS[block]?.solid) {
        return y + 1; // Top surface of the solid block
      }
    }
    return 34; // fallback
  }

  // Find dry solid ground at or near target coordinates above sea level
  public getSafeSpawnLocation(targetX: number = 0, targetZ: number = 0): { x: number; y: number; z: number } {
    if (this.currentDimension === 'nether') {
      // Chunk (0, 0) portal pad is at (8, 25, 8)
      return { x: 7.5, y: 26, z: 7.5 };
    }

    const initialY = this.getSafeSpawnHeight(targetX, targetZ);
    if (initialY > TerrainGenerator.SEA_LEVEL) {
      return { x: targetX, y: initialY, z: targetZ };
    }

    for (let r = 2; r <= 32; r += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        for (let dz = -r; dz <= r; dz += 2) {
          const testX = targetX + dx;
          const testZ = targetZ + dz;
          const y = this.getSafeSpawnHeight(testX, testZ);
          if (y > TerrainGenerator.SEA_LEVEL) {
            const surfaceBlock = this.getBlock(testX, y - 1, testZ);
            if (surfaceBlock !== Block.WATER && surfaceBlock !== Block.AIR) {
              return { x: testX, y, z: testZ };
            }
          }
        }
      }
    }

    return { x: targetX, y: Math.max(initialY, TerrainGenerator.SEA_LEVEL + 1), z: targetZ };
  }

  public switchDimension(dim: 'overworld' | 'nether') {
    if (this.currentDimension === dim) return;

    // 1. Detach all meshes of current dimension from scene
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) this.scene.remove(chunk.mesh);
      if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
    }

    // 2. Set new active dimension
    this.currentDimension = dim;
    this.generator.dimension = dim;
    this.chunks = dim === 'nether' ? this.netherChunks : this.overworldChunks;

    // 3. Re-attach meshes of target dimension to scene
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) this.scene.add(chunk.mesh);
      if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
    }

    // 4. Update scene atmosphere
    if (dim === 'nether') {
      this.scene.background = new THREE.Color(0x350808);
      this.scene.fog = new THREE.FogExp2(0x350808, 0.024);
    } else {
      this.scene.background = new THREE.Color(0x87ceeb);
      this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.008);
    }
  }

  public dispose() {
    // Clean up dynamic torch light pool
    for (const light of this.dynamicTorchLights) {
      this.scene.remove(light);
      light.dispose();
    }
    this.dynamicTorchLights = [];

    for (const chunk of this.overworldChunks.values()) {
      if (chunk.mesh) this.scene.remove(chunk.mesh);
      if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
      chunk.dispose();
    }
    for (const chunk of this.netherChunks.values()) {
      if (chunk.mesh) this.scene.remove(chunk.mesh);
      if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
      chunk.dispose();
    }
    this.overworldChunks.clear();
    this.netherChunks.clear();
    this.terrainMaterial.dispose();
    this.waterMaterial.dispose();
  }
}
