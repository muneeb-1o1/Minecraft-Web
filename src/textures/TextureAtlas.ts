import * as THREE from 'three';
import { TextureIndex, Block, ItemId } from '../world/BlockTypes';

export class TextureAtlas {
  public static readonly ATLAS_SIZE = 256;
  public static readonly TILE_SIZE = 16;
  public static readonly TILES_PER_ROW = TextureAtlas.ATLAS_SIZE / TextureAtlas.TILE_SIZE; // 16

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;
  public crackTexture: THREE.CanvasTexture;
  private iconCache: Map<number, string> = new Map();

  constructor() {
    if (typeof document === 'undefined') {
      this.canvas = {} as HTMLCanvasElement;
      this.ctx = {} as CanvasRenderingContext2D;
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.crackTexture = new THREE.CanvasTexture(this.canvas);
      return;
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = TextureAtlas.ATLAS_SIZE;
    this.canvas.height = TextureAtlas.ATLAS_SIZE;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.imageSmoothingEnabled = false;

    this.generateAllTextures();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestMipmapNearestFilter;
    this.texture.generateMipmaps = true;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // Create crack overlay texture (10 stages across a 160x16 strip or 64x64 grid)
    this.crackTexture = this.createCrackTexture();
  }

  private waterAnimTimer: number = 0;

  // Real-time animated water texture loop
  public update(dt: number, timeSeconds: number) {
    this.waterAnimTimer += dt;
    if (this.waterAnimTimer >= 0.055) { // 18 FPS authentic fluid ripple animation
      this.waterAnimTimer = 0;
      this.drawAnimatedWater(timeSeconds);
      this.texture.needsUpdate = true;
    }
  }

  private drawAnimatedWater(time: number) {
    const tileIndex = TextureIndex.WATER;
    const x = (tileIndex % TextureAtlas.TILES_PER_ROW) * TextureAtlas.TILE_SIZE;
    const y = Math.floor(tileIndex / TextureAtlas.TILES_PER_ROW) * TextureAtlas.TILE_SIZE;

    // Palette of authentic dynamic water colors with realistic caustics wave distortion and specular shimmer
    const cAbyss = '#0d2d7d';
    const cDeep = '#1442b0';
    const cMid = '#1d54c8';
    const cFlow = '#286ae2';
    const cCrest = '#3e84f5';
    const cShimmer = '#68a6ff';
    const cSpecular = '#d4eaff';

    for (let py = 0; py < 16; py++) {
      const fy = (py / 16.0) * Math.PI * 2;
      for (let px = 0; px < 16; px++) {
        const fx = (px / 16.0) * Math.PI * 2;

        // Non-linear wave distortion simulating caustics refraction
        const distortX = Math.sin(fy + time * 2.5) * 0.35;
        const distortY = Math.cos(fx - time * 2.8) * 0.35;
        const u = fx + distortX;
        const v = fy + distortY;

        // Periodic multi-frequency harmonics guaranteed to tile seamlessly across 16x16 grid borders
        const w1 = Math.sin(u + v + time * 3.2);
        const w2 = Math.cos(u * 2.0 - v + time * 2.4);
        const w3 = Math.sin(u - v * 2.0 - time * 2.8);
        const w4 = Math.cos(u * 3.0 + v * 2.0 + time * 3.8);

        // Caustic ridge sharpening
        const causticPeak = Math.pow(Math.max(0, Math.sin(u * 2.0 + time * 2.0) * Math.cos(v * 2.0 - time * 1.8) + 0.35), 2.2);
        const sum = (w1 * 0.36 + w2 * 0.28 + w3 * 0.20 + w4 * 0.12) + causticPeak * 0.58;

        let col: string;
        if (sum > 0.88) {
          col = cSpecular;
        } else if (sum > 0.48) {
          col = cShimmer;
        } else if (sum > 0.08) {
          col = cCrest;
        } else if (sum > -0.38) {
          col = cFlow;
        } else if (sum > -0.72) {
          col = cMid;
        } else if (sum > -0.92) {
          col = cDeep;
        } else {
          col = cAbyss;
        }

        this.ctx.fillStyle = col;
        this.ctx.fillRect(x + px, y + py, 1, 1);
      }
    }
  }

  // Analytical water caustics intensity calculator for underwater world points
  public static calculateCaustics(wx: number, wy: number, wz: number, time: number): number {
    if (wy > 30.5) return 0.0;
    const depth = 30.5 - wy;
    const depthFade = Math.max(0.1, Math.min(1.0, 1.0 - depth / 20.0));
    const p1x = wx * 1.2 + time * 0.55;
    const p1z = wz * 1.2 + time * 0.38;
    const p2x = wx * 1.8 - time * 0.45;
    const p2z = wz * 1.8 - time * 0.62;
    const w1 = Math.sin(p1x + Math.sin(p1z * 1.4 + time * 0.9)) * Math.cos(p1z + Math.cos(p1x * 1.2 - time * 0.8));
    const w2 = Math.sin(p2x - Math.cos(p2z * 1.3 - time * 0.95)) * Math.cos(p2z + Math.sin(p2x * 1.5 + time * 1.15));
    const caustPattern = Math.pow(Math.max(0, Math.min(1, (w1 + w2) * 0.5 + 0.5)), 2.8);
    return caustPattern * depthFade;
  }

  // Helper to convert index to UV coordinates [uMin, vMin, uMax, vMax]
  public static getUV(index: number): [number, number, number, number] {
    const tileU = (index % TextureAtlas.TILES_PER_ROW) * TextureAtlas.TILE_SIZE;
    const tileV = Math.floor(index / TextureAtlas.TILES_PER_ROW) * TextureAtlas.TILE_SIZE;

    // WebGL texture coords: V=0 is bottom, V=1 is top
    const uMin = tileU / TextureAtlas.ATLAS_SIZE;
    const uMax = (tileU + TextureAtlas.TILE_SIZE) / TextureAtlas.ATLAS_SIZE;
    const vMax = 1 - (tileV / TextureAtlas.ATLAS_SIZE);
    const vMin = 1 - ((tileV + TextureAtlas.TILE_SIZE) / TextureAtlas.ATLAS_SIZE);

    return [uMin, vMin, uMax, vMax];
  }

  // Draw a 16x16 tile at tileIndex
  private drawTile(index: number, drawFn: (ctx: CanvasRenderingContext2D, x: number, y: number) => void) {
    const x = (index % TextureAtlas.TILES_PER_ROW) * TextureAtlas.TILE_SIZE;
    const y = Math.floor(index / TextureAtlas.TILES_PER_ROW) * TextureAtlas.TILE_SIZE;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, TextureAtlas.TILE_SIZE, TextureAtlas.TILE_SIZE);
    this.ctx.clip();
    drawFn(this.ctx, x, y);
    this.ctx.restore();
  }

  private generateAllTextures() {
    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    // 1. Dirt Texture (authentic multi-tone warm loam)
    const drawDirt = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      ctx.fillStyle = '#866043';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 101);
          if (r > 0.82) {
            ctx.fillStyle = '#573d26'; // dark pebble
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r > 0.62) {
            ctx.fillStyle = '#6e4e35'; // medium dark
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.15) {
            ctx.fillStyle = '#9b724f'; // highlight speck
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.05) {
            ctx.fillStyle = '#b08259'; // bright grain
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    };

    // Grass Top (authentic lush Minecraft green with balanced contrast)
    this.drawTile(TextureIndex.GRASS_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#4c7c24';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 202);
          if (r > 0.78) {
            ctx.fillStyle = '#3b621c'; // shadow blades
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r > 0.52) {
            ctx.fillStyle = '#588d2b'; // mid blades
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.18) {
            ctx.fillStyle = '#6baa35'; // sunlit tips
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.04) {
            ctx.fillStyle = '#7ebd3e'; // bright highlight
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Grass Side (rich dirt with natural hanging grass tassels)
    this.drawTile(TextureIndex.GRASS_SIDE, (ctx, x, y) => {
      drawDirt(ctx, x, y);
      ctx.fillStyle = '#4c7c24';
      ctx.fillRect(x, y, 16, 2);
      const hanging = [3, 2, 4, 3, 5, 2, 4, 3, 2, 4, 5, 3, 2, 4, 3, 2];
      for (let px = 0; px < 16; px++) {
        const h = hanging[px];
        for (let py = 2; py < h; py++) {
          const isBottomTip = (py === h - 1);
          ctx.fillStyle = isBottomTip ? '#3b621c' : ((px % 2 === 0) ? '#588d2b' : '#6baa35');
          ctx.fillRect(x + px, y + py, 1, 1);
        }
      }
    });

    // Dirt
    this.drawTile(TextureIndex.DIRT, drawDirt);

    // Stone (authentic textured granular grey)
    this.drawTile(TextureIndex.STONE, (ctx, x, y) => {
      ctx.fillStyle = '#787878';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 303);
          if (r > 0.82) {
            ctx.fillStyle = '#525252'; // dark mineral speck
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r > 0.65) {
            ctx.fillStyle = '#636363'; // shadow grain
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.16) {
            ctx.fillStyle = '#8e8e8e'; // light speck
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.05) {
            ctx.fillStyle = '#a0a0a0'; // bright fleck
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Cobblestone (authentic rounded mortared stones with organic highlights)
    this.drawTile(TextureIndex.COBBLESTONE, (ctx, x, y) => {
      // Dark mortar base
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x, y, 16, 16);
      // Stones
      const stones = [
        { sx: 1, sy: 1, w: 6, h: 4, col: '#727272', hi: '#8c8c8c', sh: '#525252' },
        { sx: 8, sy: 0, w: 7, h: 5, col: '#6b6b6b', hi: '#828282', sh: '#4d4d4d' },
        { sx: 0, sy: 6, w: 8, h: 5, col: '#787878', hi: '#949494', sh: '#585858' },
        { sx: 9, sy: 6, w: 6, h: 4, col: '#646464', hi: '#7a7a7a', sh: '#4a4a4a' },
        { sx: 2, sy: 11, w: 6, h: 4, col: '#707070', hi: '#888888', sh: '#545454' },
        { sx: 9, sy: 11, w: 6, h: 4, col: '#7c7c7c', hi: '#969696', sh: '#5c5c5c' }
      ];
      stones.forEach(s => {
        // Body
        ctx.fillStyle = s.col;
        ctx.fillRect(x + s.sx, y + s.sy, s.w, s.h);
        // Top/left highlight
        ctx.fillStyle = s.hi;
        ctx.fillRect(x + s.sx, y + s.sy, s.w, 1);
        ctx.fillRect(x + s.sx, y + s.sy, 1, s.h);
        // Bottom/right shadow
        ctx.fillStyle = s.sh;
        ctx.fillRect(x + s.sx, y + s.sy + s.h - 1, s.w, 1);
        ctx.fillRect(x + s.sx + s.w - 1, y + s.sy, 1, s.h);
      });
    });

    // Bedrock
    this.drawTile(TextureIndex.BEDROCK, (ctx, x, y) => {
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 404);
          if (r > 0.8) ctx.fillStyle = '#0a0a0a';
          else if (r > 0.5) ctx.fillStyle = '#3a3a3a';
          else if (r > 0.2) ctx.fillStyle = '#262626';
          else ctx.fillStyle = '#555555';
          ctx.fillRect(x + px, y + py, 1, 1);
        }
      }
    });

    // Oak Log Side
    this.drawTile(TextureIndex.OAK_LOG_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#675232';
      ctx.fillRect(x, y, 16, 16);
      for (let px = 0; px < 16; px++) {
        const dark = (px % 4 === 0 || px % 7 === 0);
        for (let py = 0; py < 16; py++) {
          const r = pseudoRandom(py * 16 + px + 505);
          ctx.fillStyle = dark ? (r > 0.5 ? '#43341b' : '#524023') : (r > 0.5 ? '#79613c' : '#675232');
          ctx.fillRect(x + px, y + py, 1, 1);
        }
      }
    });

    // Oak Log Top
    this.drawTile(TextureIndex.OAK_LOG_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#a98a58';
      ctx.fillRect(x, y, 16, 16);
      // Bark border
      ctx.fillStyle = '#524023';
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      // Tree rings
      ctx.strokeStyle = '#8d7041';
      ctx.strokeRect(x + 3.5, y + 3.5, 9, 9);
      ctx.fillStyle = '#7a5f33';
      ctx.fillRect(x + 7, y + 7, 2, 2);
    });

    // Oak Leaves (rich foliage with clustered transparency and leaf edge highlights)
    this.drawTile(TextureIndex.OAK_LEAVES, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 606);
          if (r > 0.22) {
            if (r > 0.82) {
              ctx.fillStyle = '#225012'; // deep shadow leaf
            } else if (r > 0.55) {
              ctx.fillStyle = '#326f1c'; // mid leaf
            } else if (r > 0.35) {
              ctx.fillStyle = '#448e26'; // outer leaf
            } else {
              ctx.fillStyle = '#59a633'; // bright sunlit leaf edge
            }
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Oak Planks (warm honey-golden planks with subtle woodgrain and crisp joints)
    this.drawTile(TextureIndex.OAK_PLANKS, (ctx, x, y) => {
      ctx.fillStyle = '#a6824c';
      ctx.fillRect(x, y, 16, 16);
      // Woodgrain noise
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 712);
          if (r > 0.78) {
            ctx.fillStyle = '#8f6e3c';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.2) {
            ctx.fillStyle = '#b8945a';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Horizontal plank seams every 4 pixels
      for (let py = 3; py < 16; py += 4) {
        ctx.fillStyle = '#563e1c';
        ctx.fillRect(x, y + py, 16, 1);
        ctx.fillStyle = '#c5a065'; // top highlight of plank below seam
        if (py + 1 < 16) {
          ctx.fillRect(x, y + py + 1, 16, 1);
        }
      }
      // Vertical plank divider joints
      const joints = [
        { jx: 5, jy: 0 },
        { jx: 12, jy: 4 },
        { jx: 3, jy: 8 },
        { jx: 10, jy: 12 }
      ];
      joints.forEach(j => {
        ctx.fillStyle = '#563e1c';
        ctx.fillRect(x + j.jx, y + j.jy, 1, 4);
      });
    });

    // Birch Log Side
    this.drawTile(TextureIndex.BIRCH_LOG_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#dcdcd7';
      ctx.fillRect(x, y, 16, 16);
      // Black notches
      const notches = [
        { nx: 2, ny: 2, w: 3, h: 1 },
        { nx: 9, ny: 5, w: 4, h: 2 },
        { nx: 3, ny: 10, w: 4, h: 1 },
        { nx: 11, ny: 13, w: 3, h: 2 }
      ];
      ctx.fillStyle = '#262626';
      notches.forEach(n => ctx.fillRect(x + n.nx, y + n.ny, n.w, n.h));
    });

    // Birch Log Top
    this.drawTile(TextureIndex.BIRCH_LOG_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#c5b897';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#444444';
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      ctx.strokeStyle = '#a49877';
      ctx.strokeRect(x + 3.5, y + 3.5, 9, 9);
      ctx.fillStyle = '#847857';
      ctx.fillRect(x + 7, y + 7, 2, 2);
    });

    // Birch Leaves
    this.drawTile(TextureIndex.BIRCH_LEAVES, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 707);
          if (r > 0.25) {
            ctx.fillStyle = r > 0.8 ? '#4b7522' : (r > 0.5 ? '#679e31' : '#80c042');
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Birch Planks
    this.drawTile(TextureIndex.BIRCH_PLANKS, (ctx, x, y) => {
      ctx.fillStyle = '#c7bca0';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 3; py < 16; py += 4) {
        ctx.fillStyle = '#9b8f72';
        ctx.fillRect(x, y + py, 16, 1);
      }
      ctx.fillRect(x + 4, y, 1, 4);
      ctx.fillRect(x + 12, y + 4, 1, 4);
      ctx.fillRect(x + 6, y + 8, 1, 4);
      ctx.fillRect(x + 10, y + 12, 1, 4);
    });

    // Sand
    this.drawTile(TextureIndex.SAND, (ctx, x, y) => {
      ctx.fillStyle = '#d9cc9b';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 808);
          if (r > 0.75) {
            ctx.fillStyle = '#c4b57e';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.2) {
            ctx.fillStyle = '#e8dcb2';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Sandstone Side
    this.drawTile(TextureIndex.SANDSTONE_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#ded5a6';
      ctx.fillRect(x, y, 16, 16);
      // Top layer
      ctx.fillStyle = '#c7bc8a';
      ctx.fillRect(x, y + 3, 16, 2);
      ctx.fillRect(x, y + 11, 16, 2);
      // Hieroglyphic style bands
      ctx.fillStyle = '#b5a975';
      ctx.fillRect(x + 2, y + 6, 3, 3);
      ctx.fillRect(x + 8, y + 6, 3, 3);
      ctx.fillRect(x + 13, y + 6, 2, 3);
    });

    // Sandstone Top
    this.drawTile(TextureIndex.SANDSTONE_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#ded5a6';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#c7bc8a';
      ctx.strokeRect(x + 1.5, y + 1.5, 13, 13);
    });

    // Gravel
    this.drawTile(TextureIndex.GRAVEL, (ctx, x, y) => {
      ctx.fillStyle = '#7a7674';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 909);
          if (r > 0.8) ctx.fillStyle = '#575351';
          else if (r > 0.5) ctx.fillStyle = '#948f8c';
          else if (r < 0.2) ctx.fillStyle = '#66615e';
          ctx.fillRect(x + px, y + py, 1, 1);
        }
      }
    });

    // Glass
    this.drawTile(TextureIndex.GLASS, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      // Reflective diagonal streaks
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(x + 3, y + 2, 2, 1);
      ctx.fillRect(x + 2, y + 3, 1, 2);
      ctx.fillRect(x + 11, y + 7, 2, 1);
      ctx.fillRect(x + 10, y + 8, 1, 2);
    });

    // Water - Organic, seamless Minecraft fluid waves with subtle shimmer
    this.drawTile(TextureIndex.WATER, (ctx, x, y) => {
      // Deep oceanic cyan-blue base
      ctx.fillStyle = '#205ed8';
      ctx.fillRect(x, y, 16, 16);

      // Organic fluid wave ripples (no hard horizontal grid lines)
      const ripples = [
        { rx: 0, ry: 1, rw: 5, rh: 1, c: '#2c73eb' },
        { rx: 7, ry: 2, rw: 6, rh: 1, c: '#3680f2' },
        { rx: 2, ry: 4, rw: 7, rh: 1, c: '#2768e0' },
        { rx: 11, ry: 5, rw: 5, rh: 1, c: '#3680f2' },
        { rx: 0, ry: 7, rw: 4, rh: 1, c: '#2c73eb' },
        { rx: 6, ry: 8, rw: 6, rh: 1, c: '#3d8df8' },
        { rx: 1, ry: 10, rw: 8, rh: 1, c: '#2768e0' },
        { rx: 11, ry: 11, rw: 4, rh: 1, c: '#3680f2' },
        { rx: 4, ry: 13, rw: 6, rh: 1, c: '#2c73eb' },
        { rx: 12, ry: 14, rw: 4, rh: 1, c: '#2768e0' },
        // Subtle soft sunlight specular flecks
        { rx: 8, ry: 2, rw: 2, rh: 1, c: '#62a8ff' },
        { rx: 7, ry: 8, rw: 2, rh: 1, c: '#62a8ff' },
        { rx: 3, ry: 13, rw: 2, rh: 1, c: '#549eff' },
        // Deep shading pockets
        { rx: 3, ry: 3, rw: 3, rh: 1, c: '#194eb8' },
        { rx: 10, ry: 9, rw: 4, rh: 1, c: '#194eb8' },
        { rx: 1, ry: 15, rw: 5, rh: 1, c: '#194eb8' }
      ];

      for (const r of ripples) {
        ctx.fillStyle = r.c;
        ctx.fillRect(x + r.rx, y + r.ry, r.rw, r.rh);
      }
    });

    // Function to draw ore clusters onto stone base
    const drawOre = (index: number, oreColor: string, darkColor: string, seed: number) => {
      this.drawTile(index, (ctx, x, y) => {
        // Stone base
        ctx.fillStyle = '#737373';
        ctx.fillRect(x, y, 16, 16);
        for (let py = 0; py < 16; py++) {
          for (let px = 0; px < 16; px++) {
            const r = pseudoRandom(py * 16 + px + 303);
            if (r > 0.75) {
              ctx.fillStyle = '#5c5c5c';
              ctx.fillRect(x + px, y + py, 1, 1);
            } else if (r < 0.25) {
              ctx.fillStyle = '#8a8a8a';
              ctx.fillRect(x + px, y + py, 1, 1);
            }
          }
        }
        // Ore flecks
        const clusters = [
          { cx: 3, cy: 4 }, { cx: 4, cy: 4 }, { cx: 4, cy: 5 },
          { cx: 10, cy: 3 }, { cx: 11, cy: 4 },
          { cx: 7, cy: 9 }, { cx: 8, cy: 9 }, { cx: 8, cy: 10 }, { cx: 7, cy: 10 },
          { cx: 12, cy: 11 }, { cx: 13, cy: 12 },
          { cx: 3, cy: 12 }, { cx: 4, cy: 11 }
        ];
        clusters.forEach(c => {
          ctx.fillStyle = darkColor;
          ctx.fillRect(x + c.cx, y + c.cy, 2, 2);
          ctx.fillStyle = oreColor;
          ctx.fillRect(x + c.cx, y + c.cy, 1, 1);
        });
      });
    };

    drawOre(TextureIndex.COAL_ORE, '#282828', '#141414', 1);
    drawOre(TextureIndex.IRON_ORE, '#d8af93', '#b8896c', 2);
    drawOre(TextureIndex.GOLD_ORE, '#fcee4b', '#d1af21', 3);
    drawOre(TextureIndex.DIAMOND_ORE, '#4dedf4', '#26b8bf', 4);
    drawOre(TextureIndex.REDSTONE_ORE, '#ff2200', '#9c1100', 5);

    // Crafting Table Top
    this.drawTile(TextureIndex.CRAFTING_TABLE_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#9e7c47';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#573d1c';
      ctx.strokeRect(x + 1.5, y + 1.5, 13, 13);
      // 3x3 grid
      ctx.beginPath();
      ctx.moveTo(x + 5.5, y + 2); ctx.lineTo(x + 5.5, y + 14);
      ctx.moveTo(x + 10.5, y + 2); ctx.lineTo(x + 10.5, y + 14);
      ctx.moveTo(x + 2, y + 5.5); ctx.lineTo(x + 14, y + 5.5);
      ctx.moveTo(x + 2, y + 10.5); ctx.lineTo(x + 14, y + 10.5);
      ctx.strokeStyle = '#573d1c';
      ctx.stroke();
    });

    // Crafting Table Side
    this.drawTile(TextureIndex.CRAFTING_TABLE_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#9e7c47';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#573d1c';
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      // Saw tool silhouette
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(x + 4, y + 5, 8, 2);
      ctx.fillStyle = '#3a2007';
      ctx.fillRect(x + 2, y + 5, 2, 3);
    });

    // Crafting Table Front
    this.drawTile(TextureIndex.CRAFTING_TABLE_FRONT, (ctx, x, y) => {
      ctx.fillStyle = '#9e7c47';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#573d1c';
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      // Hanging shears/pliers tool silhouette
      ctx.fillStyle = '#b0b0b0';
      ctx.fillRect(x + 5, y + 4, 2, 7);
      ctx.fillRect(x + 9, y + 4, 2, 7);
      ctx.fillRect(x + 6, y + 7, 4, 2);
    });

    // Furnace Side
    this.drawTile(TextureIndex.FURNACE_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#666666';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#3a3a3a';
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      ctx.strokeRect(x + 2.5, y + 2.5, 11, 11);
    });

    // Furnace Front
    this.drawTile(TextureIndex.FURNACE_FRONT, (ctx, x, y) => {
      ctx.fillStyle = '#666666';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#3a3a3a';
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      // Vent / Mouth
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(x + 4, y + 8, 8, 6);
      ctx.fillStyle = '#3e3e3e';
      ctx.fillRect(x + 5, y + 3, 6, 3);
    });

    // Chest Top
    this.drawTile(TextureIndex.CHEST_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#926a35';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#422a10';
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      ctx.strokeRect(x + 2.5, y + 2.5, 11, 11);
    });

    // Chest Side
    this.drawTile(TextureIndex.CHEST_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#926a35';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#422a10';
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      ctx.fillRect(x, y + 4, 16, 1);
    });

    // Chest Front
    this.drawTile(TextureIndex.CHEST_FRONT, (ctx, x, y) => {
      ctx.fillStyle = '#926a35';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#422a10';
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      ctx.fillRect(x, y + 4, 16, 1);
      // Metal Latch
      ctx.fillStyle = '#d4d4d4';
      ctx.fillRect(x + 7, y + 3, 2, 4);
      ctx.fillStyle = '#333333';
      ctx.strokeRect(x + 6.5, y + 2.5, 3, 5);
    });

    // Bricks
    this.drawTile(TextureIndex.BRICKS, (ctx, x, y) => {
      ctx.fillStyle = '#944436';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#d1c2b8';
      // Mortar horizontal
      ctx.fillRect(x, y + 3, 16, 1);
      ctx.fillRect(x, y + 7, 16, 1);
      ctx.fillRect(x, y + 11, 16, 1);
      ctx.fillRect(x, y + 15, 16, 1);
      // Mortar vertical
      ctx.fillRect(x + 7, y, 1, 3);
      ctx.fillRect(x + 3, y + 4, 1, 3);
      ctx.fillRect(x + 11, y + 4, 1, 3);
      ctx.fillRect(x + 7, y + 8, 1, 3);
      ctx.fillRect(x + 3, y + 12, 1, 3);
      ctx.fillRect(x + 11, y + 12, 1, 3);
    });

    // Bookshelf
    this.drawTile(TextureIndex.BOOKSHELF, (ctx, x, y) => {
      ctx.fillStyle = '#9e7c47';
      ctx.fillRect(x, y, 16, 16);
      // Shelves
      ctx.fillStyle = '#22180c';
      ctx.fillRect(x + 1, y + 1, 14, 6);
      ctx.fillRect(x + 1, y + 9, 14, 6);
      // Books
      const bookColors = ['#a83232', '#3260a8', '#32a852', '#a89432', '#6b32a8'];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = bookColors[i % bookColors.length];
        ctx.fillRect(x + 2 + i * 2, y + 2, 2, 5);
        ctx.fillStyle = bookColors[(i + 2) % bookColors.length];
        ctx.fillRect(x + 2 + i * 2, y + 10, 2, 5);
      }
    });

    // TNT Side
    this.drawTile(TextureIndex.TNT_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#db3b26';
      ctx.fillRect(x, y, 16, 16);
      // White band
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y + 6, 16, 4);
      // Black text "TNT"
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 5px sans-serif';
      ctx.fillText('TNT', x + 2, y + 10);
    });

    // TNT Top
    this.drawTile(TextureIndex.TNT_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#db3b26';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 6, y + 6, 4, 4);
      // Fuse
      ctx.fillStyle = '#333333';
      ctx.fillRect(x + 7, y + 7, 2, 2);
    });

    // TNT Bottom
    this.drawTile(TextureIndex.TNT_BOTTOM, (ctx, x, y) => {
      ctx.fillStyle = '#db3b26';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#333333';
      for (let py = 2; py < 14; py += 3) {
        for (let px = 2; px < 14; px += 3) {
          ctx.fillRect(x + px, y + py, 2, 2);
        }
      }
    });

    // Torch (authentic Minecraft torch: shaded wood stick and multi-tone glowing flame)
    this.drawTile(TextureIndex.TORCH, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Wooden stick shaft (shadow on left/bottom, highlight on right)
      ctx.fillStyle = '#4a331c'; // shadow wood
      ctx.fillRect(x + 7, y + 6, 1, 10);
      ctx.fillStyle = '#6b4c2b'; // main wood
      ctx.fillRect(x + 8, y + 6, 1, 10);
      ctx.fillStyle = '#835f37'; // light grain speck
      ctx.fillRect(x + 8, y + 9, 1, 2);

      // Charcoal ember top
      ctx.fillStyle = '#2b1b0e';
      ctx.fillRect(x + 7, y + 5, 2, 1);

      // Outer orange flame aura
      ctx.fillStyle = '#ff6a00';
      ctx.fillRect(x + 6, y + 3, 4, 3);
      ctx.fillRect(x + 7, y + 2, 2, 4);

      // Inner golden flame
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(x + 7, y + 3, 2, 3);

      // Core white-hot spark
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 7, y + 3, 1, 2);
    });

    // Dandelion
    this.drawTile(TextureIndex.DANDELION, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      ctx.fillStyle = '#3f7c19';
      ctx.fillRect(x + 7, y + 6, 2, 10);
      // Yellow petals
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(x + 6, y + 3, 4, 4);
      ctx.fillStyle = '#ffea55';
      ctx.fillRect(x + 7, y + 2, 2, 2);
    });

    // Poppy
    this.drawTile(TextureIndex.POPPY, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      ctx.fillStyle = '#3f7c19';
      ctx.fillRect(x + 7, y + 6, 2, 10);
      // Red blossom
      ctx.fillStyle = '#d61818';
      ctx.fillRect(x + 5, y + 2, 6, 5);
      ctx.fillStyle = '#111111';
      ctx.fillRect(x + 7, y + 4, 2, 2);
    });

    // Snow
    this.drawTile(TextureIndex.SNOW, (ctx, x, y) => {
      ctx.fillStyle = '#edf4fa';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#d2e4f5';
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          if (pseudoRandom(py * 16 + px + 1010) > 0.8) {
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Cactus Side
    this.drawTile(TextureIndex.CACTUS_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#186414';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#288820';
      // Fluting
      for (let px = 1; px < 16; px += 3) {
        ctx.fillRect(x + px, y, 2, 16);
      }
      // Thorns
      ctx.fillStyle = '#ffffff';
      const thorns = [{ tx: 2, ty: 3 }, { tx: 8, ty: 5 }, { tx: 14, ty: 2 }, { tx: 5, ty: 9 }, { tx: 11, ty: 12 }];
      thorns.forEach(t => ctx.fillRect(x + t.tx, y + t.ty, 1, 1));
    });

    // Cactus Top
    this.drawTile(TextureIndex.CACTUS_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#186414';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#288820';
      ctx.strokeRect(x + 2.5, y + 2.5, 11, 11);
      ctx.fillStyle = '#0f440c';
      ctx.fillRect(x + 7, y + 7, 2, 2);
    });

    // Wheat Crop
    this.drawTile(TextureIndex.WHEAT_CROP, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      ctx.fillStyle = '#e6b800';
      for (let px = 2; px < 14; px += 2) {
        ctx.fillRect(x + px, y + 4, 1, 12);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(x + px, y + 2, 2, 3);
        ctx.fillStyle = '#c49a00';
        ctx.fillRect(x + px - 1, y + 7, 1, 2);
        ctx.fillStyle = '#e6b800';
      }
    });

    // Bed Top (White pillow at head, Red quilt blanket)
    this.drawTile(TextureIndex.BED_TOP, (ctx, x, y) => {
      // Red blanket
      ctx.fillStyle = '#a61b1b';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#ba2727';
      ctx.fillRect(x + 1, y + 1, 14, 14);
      // White pillow
      ctx.fillStyle = '#e8eaed';
      ctx.fillRect(x + 2, y + 2, 12, 4);
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(x + 3, y + 2, 10, 3);
      ctx.fillStyle = '#dadce0';
      ctx.strokeRect(x + 2.5, y + 2.5, 11, 3);
      // Blanket fold crease
      ctx.fillStyle = '#7a1010';
      ctx.fillRect(x + 1, y + 7, 14, 1);
    });

    // Bed Side (Red blanket, Oak wooden frame and legs)
    this.drawTile(TextureIndex.BED_SIDE, (ctx, x, y) => {
      // Oak wood lower half
      ctx.fillStyle = '#9c7349';
      ctx.fillRect(x, y + 8, 16, 8);
      // Bed legs
      ctx.fillStyle = '#6e4f30';
      ctx.fillRect(x + 1, y + 11, 2, 5);
      ctx.fillRect(x + 13, y + 11, 2, 5);
      // Red mattress & blanket upper half
      ctx.fillStyle = '#ba2727';
      ctx.fillRect(x, y + 3, 16, 6);
      ctx.fillStyle = '#e8eaed'; // Pillow side visible at top edge
      ctx.fillRect(x + 1, y + 3, 4, 3);
      ctx.fillStyle = '#a61b1b';
      ctx.fillRect(x, y + 8, 16, 1);
    });

    // Obsidian (Deep dark obsidian with reflective violet flecks)
    this.drawTile(TextureIndex.OBSIDIAN, (ctx, x, y) => {
      ctx.fillStyle = '#140f1d';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 707);
          if (r > 0.8) {
            ctx.fillStyle = '#392150';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r > 0.65) {
            ctx.fillStyle = '#211731';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.08) {
            ctx.fillStyle = '#643888'; // Specular sheen
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Nether Portal (Shimmering translucent swirling purple void)
    this.drawTile(TextureIndex.PORTAL, (ctx, x, y) => {
      ctx.fillStyle = '#4c116d';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 808);
          if (r > 0.75) {
            ctx.fillStyle = '#8328b0';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r > 0.5) {
            ctx.fillStyle = '#681c91';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.15) {
            ctx.fillStyle = '#2b0740';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#b744ec';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Netherrack (Porous blood-red volcanic stone)
    this.drawTile(TextureIndex.NETHERRACK, (ctx, x, y) => {
      ctx.fillStyle = '#651c1c';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 909);
          if (r > 0.72) {
            ctx.fillStyle = '#852222';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.22) {
            ctx.fillStyle = '#420f0f';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.35) {
            ctx.fillStyle = '#521414';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Soul Sand (Deep brown porous sand with faint wailing soul impressions)
    this.drawTile(TextureIndex.SOUL_SAND, (ctx, x, y) => {
      ctx.fillStyle = '#4a382e';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 1010);
          if (r > 0.8) {
            ctx.fillStyle = '#5c463a';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.2) {
            ctx.fillStyle = '#35271f';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Faint soul face outlines
      ctx.fillStyle = '#261b15';
      ctx.fillRect(x + 4, y + 5, 2, 2);
      ctx.fillRect(x + 9, y + 5, 2, 2);
      ctx.fillRect(x + 6, y + 9, 3, 2);
    });

    // Glowstone (Luminescent golden crystal cluster)
    this.drawTile(TextureIndex.GLOWSTONE, (ctx, x, y) => {
      ctx.fillStyle = '#cb982e';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 1111);
          if (r > 0.7) {
            ctx.fillStyle = '#fce475';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r > 0.5) {
            ctx.fillStyle = '#e8ba46';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.15) {
            ctx.fillStyle = '#8f6417';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Nether Bricks (Dark purplish-red fired masonry)
    this.drawTile(TextureIndex.NETHER_BRICKS, (ctx, x, y) => {
      ctx.fillStyle = '#2b141a';
      ctx.fillRect(x, y, 16, 16);
      // Mortar lines
      ctx.fillStyle = '#17090d';
      ctx.fillRect(x, y + 3, 16, 1);
      ctx.fillRect(x, y + 7, 16, 1);
      ctx.fillRect(x, y + 11, 16, 1);
      ctx.fillRect(x, y + 15, 16, 1);
      // Vertical joints
      ctx.fillRect(x + 7, y, 1, 3);
      ctx.fillRect(x + 3, y + 4, 1, 3);
      ctx.fillRect(x + 11, y + 4, 1, 3);
      ctx.fillRect(x + 7, y + 8, 1, 3);
      ctx.fillRect(x + 3, y + 12, 1, 3);
      ctx.fillRect(x + 11, y + 12, 1, 3);
      // Highlights
      ctx.fillStyle = '#3c1d25';
      ctx.fillRect(x + 1, y + 1, 5, 1);
      ctx.fillRect(x + 9, y + 1, 5, 1);
      ctx.fillRect(x + 5, y + 5, 5, 1);
    });

    // Nether Quartz Ore (Netherrack embedded with brilliant white quartz crystals)
    this.drawTile(TextureIndex.NETHER_QUARTZ_ORE, (ctx, x, y) => {
      // Netherrack base
      ctx.fillStyle = '#651c1c';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 1212);
          if (r > 0.75) {
            ctx.fillStyle = '#852222';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.2) {
            ctx.fillStyle = '#420f0f';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Quartz clusters
      const quartzPixels = [
        { px: 4, py: 4 }, { px: 5, py: 4 }, { px: 4, py: 5 }, { px: 5, py: 5 },
        { px: 10, py: 3 }, { px: 11, py: 4 },
        { px: 8, py: 9 }, { px: 9, py: 9 }, { px: 8, py: 10 },
        { px: 3, py: 11 }, { px: 4, py: 12 }, { px: 12, py: 11 }
      ];
      ctx.fillStyle = '#edeae0';
      quartzPixels.forEach(p => ctx.fillRect(x + p.px, y + p.py, 1, 1));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 4, y + 4, 1, 1);
      ctx.fillRect(x + 8, y + 9, 1, 1);
    });

    // Lava (Molten fiery liquid with orange/yellow crests)
    this.drawTile(TextureIndex.LAVA, (ctx, x, y) => {
      ctx.fillStyle = '#cf3908';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 1313);
          if (r > 0.7) {
            ctx.fillStyle = '#ff9900';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r > 0.5) {
            ctx.fillStyle = '#e85d04';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.12) {
            ctx.fillStyle = '#ffdd00'; // Hot molten center
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#9b1d04';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // Enchanting Table Top (Obsidian border, red cloth surface, golden corner accents)
    this.drawTile(TextureIndex.ENCHANTING_TABLE_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#140f1d';
      ctx.fillRect(x, y, 16, 16);
      // Red velvet center
      ctx.fillStyle = '#941818';
      ctx.fillRect(x + 2, y + 2, 12, 12);
      ctx.fillStyle = '#b72222';
      ctx.fillRect(x + 4, y + 4, 8, 8);
      // Diamond corner inlays
      ctx.fillStyle = '#4dedf4';
      ctx.fillRect(x + 2, y + 2, 2, 2);
      ctx.fillRect(x + 12, y + 2, 2, 2);
      ctx.fillRect(x + 2, y + 12, 2, 2);
      ctx.fillRect(x + 12, y + 12, 2, 2);
    });

    // Enchanting Table Side
    this.drawTile(TextureIndex.ENCHANTING_TABLE_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#140f1d';
      ctx.fillRect(x, y, 16, 16);
      // Red cloth hanging lip
      ctx.fillStyle = '#941818';
      ctx.fillRect(x, y, 16, 3);
      ctx.fillStyle = '#b72222';
      ctx.fillRect(x, y, 16, 1);
      // Diamond carvings
      ctx.fillStyle = '#4dedf4';
      ctx.fillRect(x + 7, y + 7, 2, 2);
    });

    // Enchanting Table Bottom
    this.drawTile(TextureIndex.ENCHANTING_TABLE_BOTTOM, (ctx, x, y) => {
      ctx.fillStyle = '#140f1d';
      ctx.fillRect(x, y, 16, 16);
    });

    // Brewing Stand Side
    this.drawTile(TextureIndex.BREWING_STAND_SIDE, (ctx, x, y) => {
      ctx.fillStyle = '#7f8c8d';
      ctx.fillRect(x, y, 16, 16);
      // Cobblestone base
      ctx.fillStyle = '#4b5257';
      ctx.fillRect(x + 2, y + 12, 12, 4);
      // Central blaze rod
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(x + 7, y + 2, 2, 10);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(x + 7, y + 4, 2, 4);
    });

    // Brewing Stand Top
    this.drawTile(TextureIndex.BREWING_STAND_TOP, (ctx, x, y) => {
      ctx.fillStyle = '#4b5257';
      ctx.fillRect(x, y, 16, 16);
      // 3 bottle slots
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(x + 3, y + 3, 3, 3);
      ctx.fillRect(x + 10, y + 3, 3, 3);
      ctx.fillRect(x + 6, y + 10, 4, 4);
      // Center blaze rod top
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(x + 7, y + 7, 2, 2);
    });

    // Nether Wart Block
    this.drawTile(TextureIndex.NETHER_WART_BLOCK, (ctx, x, y) => {
      ctx.fillStyle = '#731414';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py += 2) {
        for (let px = 0; px < 16; px += 2) {
          if ((px * 7 + py * 13) % 5 === 0) {
            ctx.fillStyle = '#8f1b1b';
            ctx.fillRect(x + px, y + py, 2, 2);
          } else if ((px + py) % 4 === 0) {
            ctx.fillStyle = '#570d0d';
            ctx.fillRect(x + px, y + py, 2, 2);
          }
        }
      }
    });

    // 1. Brain Coral (Vibrant Pink with maze-like polyp grooves)
    this.drawTile(TextureIndex.CORAL_BRAIN, (ctx, x, y) => {
      ctx.fillStyle = '#d95788';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 7101);
          if (r > 0.65) {
            ctx.fillStyle = '#ea85a9';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.28) {
            ctx.fillStyle = '#b53867';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Distinct winding maze tracks
      ctx.fillStyle = '#942250';
      ctx.fillRect(x + 2, y + 2, 4, 1);
      ctx.fillRect(x + 5, y + 3, 1, 3);
      ctx.fillRect(x + 8, y + 4, 4, 1);
      ctx.fillRect(x + 11, y + 5, 1, 4);
      ctx.fillRect(x + 3, y + 9, 5, 1);
      ctx.fillRect(x + 7, y + 10, 1, 4);
      ctx.fillRect(x + 10, y + 12, 4, 1);
    });

    // 2. Bubble Coral (Rich Magenta & Violet with clustered bubble polyps)
    this.drawTile(TextureIndex.CORAL_BUBBLE, (ctx, x, y) => {
      ctx.fillStyle = '#8c2ca8';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 7202);
          if (r > 0.68) {
            ctx.fillStyle = '#ad48cc';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#62177a';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Glowing circular bubble polyps
      const bubbles = [
        { bx: 3, by: 3 }, { bx: 10, by: 4 }, { bx: 6, by: 9 },
        { bx: 12, by: 11 }, { bx: 2, by: 12 }
      ];
      bubbles.forEach(b => {
        ctx.fillStyle = '#c56ae0';
        ctx.fillRect(x + b.bx, y + b.by, 2, 2);
        ctx.fillStyle = '#f3bfff';
        ctx.fillRect(x + b.bx, y + b.by, 1, 1);
      });
    });

    // 3. Fire Coral (Radiant Crimson & Orange-Red)
    this.drawTile(TextureIndex.CORAL_FIRE, (ctx, x, y) => {
      ctx.fillStyle = '#d62828';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 7303);
          if (r > 0.65) {
            ctx.fillStyle = '#f77f00';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#9b111e';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Fiery branch veins
      ctx.fillStyle = '#fcbf49';
      ctx.fillRect(x + 4, y + 3, 1, 4);
      ctx.fillRect(x + 5, y + 5, 2, 1);
      ctx.fillRect(x + 10, y + 8, 1, 5);
      ctx.fillRect(x + 9, y + 10, 3, 1);
    });

    // 4. Horn Coral (Golden Sunny Yellow with ridges)
    this.drawTile(TextureIndex.CORAL_HORN, (ctx, x, y) => {
      ctx.fillStyle = '#e0ac00';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 7404);
          if (r > 0.65) {
            ctx.fillStyle = '#ffd13b';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#a87800';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Curved horn ridges
      ctx.fillStyle = '#fff07a';
      ctx.fillRect(x + 3, y + 2, 3, 1);
      ctx.fillRect(x + 6, y + 3, 2, 1);
      ctx.fillRect(x + 8, y + 4, 1, 3);
      ctx.fillRect(x + 5, y + 9, 4, 1);
      ctx.fillRect(x + 9, y + 10, 1, 3);
    });

    // 5. Tube Coral (Vivid Cobalt Blue with porous round tube openings)
    this.drawTile(TextureIndex.CORAL_TUBE, (ctx, x, y) => {
      ctx.fillStyle = '#2858bb';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 7505);
          if (r > 0.65) {
            ctx.fillStyle = '#4a7fe8';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#163a8a';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Porous tube mouths (deep hollow blue centers)
      const tubes = [{ tx: 3, ty: 3 }, { tx: 10, ty: 4 }, { tx: 6, ty: 9 }, { tx: 11, ty: 11 }];
      tubes.forEach(t => {
        ctx.fillStyle = '#0f245a';
        ctx.fillRect(x + t.tx, y + t.ty, 2, 2);
        ctx.fillStyle = '#70a4ff';
        ctx.fillRect(x + t.tx - 1, y + t.ty, 1, 2);
      });
    });

    // 6. Seagrass (Underwater waving green fronds)
    this.drawTile(TextureIndex.SEAGRASS, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Left blade
      ctx.fillStyle = '#2d7a22';
      ctx.fillRect(x + 4, y + 6, 2, 10);
      ctx.fillStyle = '#46ab35';
      ctx.fillRect(x + 5, y + 4, 2, 8);
      ctx.fillStyle = '#65cf52';
      ctx.fillRect(x + 6, y + 2, 1, 6);

      // Right blade
      ctx.fillStyle = '#22631a';
      ctx.fillRect(x + 10, y + 7, 2, 9);
      ctx.fillStyle = '#3fa02f';
      ctx.fillRect(x + 9, y + 5, 2, 7);
      ctx.fillStyle = '#5ac748';
      ctx.fillRect(x + 8, y + 3, 1, 5);
    });

    // 7. Kelp Stem & Top (Tall swaying underwater forest stalks)
    this.drawTile(TextureIndex.KELP_STEM, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Central stalk
      ctx.fillStyle = '#3f6315';
      ctx.fillRect(x + 7, y, 2, 16);
      ctx.fillStyle = '#5c8f22';
      ctx.fillRect(x + 8, y, 1, 16);
      // Leaves reaching outwards
      ctx.fillStyle = '#4f7d1b';
      ctx.fillRect(x + 4, y + 4, 3, 2);
      ctx.fillRect(x + 3, y + 3, 2, 2);
      ctx.fillRect(x + 9, y + 10, 3, 2);
      ctx.fillRect(x + 11, y + 9, 2, 2);
    });

    this.drawTile(TextureIndex.KELP_TOP, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      ctx.fillStyle = '#3f6315';
      ctx.fillRect(x + 7, y + 4, 2, 12);
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(x + 6, y + 2, 4, 3);
      ctx.fillRect(x + 7, y + 1, 2, 2);
      // Lush top canopy bulb
      ctx.fillStyle = '#84cc16';
      ctx.fillRect(x + 7, y + 2, 2, 2);
    });

    // 8. Sea Lantern (Luminous Aquamarine & Cyan with frame)
    this.drawTile(TextureIndex.SEA_LANTERN, (ctx, x, y) => {
      ctx.fillStyle = '#b4eae8';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 7606);
          if (r > 0.6) {
            ctx.fillStyle = '#d7f7f5';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#83d2d0';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Glowing border frame
      ctx.fillStyle = '#4ea8a8';
      ctx.fillRect(x, y, 16, 1);
      ctx.fillRect(x, y + 15, 16, 1);
      ctx.fillRect(x, y, 1, 16);
      ctx.fillRect(x + 15, y, 1, 16);
      // Center cross
      ctx.fillRect(x + 7, y, 2, 16);
      ctx.fillRect(x, y + 7, 16, 2);
      // Bright glowing center core
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 7, y + 7, 2, 2);
    });

    // 9. Redstone Wire (Circuit line cross)
    this.drawTile(TextureIndex.REDSTONE_WIRE, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      ctx.fillStyle = '#b31b1b';
      // Center circuit hub
      ctx.fillRect(x + 5, y + 5, 6, 6);
      ctx.fillRect(x + 7, y, 2, 16);
      ctx.fillRect(x, y + 7, 16, 2);
      // Brighter inner core
      ctx.fillStyle = '#ff3333';
      ctx.fillRect(x + 6, y + 6, 4, 4);
      ctx.fillRect(x + 7, y + 2, 2, 12);
      ctx.fillRect(x + 2, y + 7, 12, 2);
      ctx.fillStyle = '#ff8888';
      ctx.fillRect(x + 7, y + 7, 2, 2);
    });

    // 10. Redstone Torch
    this.drawTile(TextureIndex.REDSTONE_TORCH, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Wooden stick shaft
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(x + 7, y + 6, 2, 9);
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(x + 8, y + 6, 1, 9);
      // Glowing Redstone Head
      ctx.fillStyle = '#991111';
      ctx.fillRect(x + 6, y + 2, 4, 4);
      ctx.fillStyle = '#ff2222';
      ctx.fillRect(x + 7, y + 3, 2, 2);
      ctx.fillStyle = '#ffaaaa';
      ctx.fillRect(x + 7, y + 2, 1, 1);
    });

    // 11. Lever
    this.drawTile(TextureIndex.LEVER, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Cobblestone mounting plate
      ctx.fillStyle = '#666666';
      ctx.fillRect(x + 4, y + 11, 8, 4);
      ctx.fillStyle = '#888888';
      ctx.fillRect(x + 5, y + 11, 6, 1);
      // Angled switch handle
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(x + 7, y + 8, 2, 3);
      ctx.fillRect(x + 8, y + 5, 2, 3);
      ctx.fillRect(x + 9, y + 2, 2, 3);
    });

    // 12. Redstone Lamp (Off)
    this.drawTile(TextureIndex.REDSTONE_LAMP, (ctx, x, y) => {
      ctx.fillStyle = '#4a2f1c';
      ctx.fillRect(x, y, 16, 16);
      // Dark border frame & grid
      ctx.fillStyle = '#26170d';
      ctx.fillRect(x, y, 16, 1);
      ctx.fillRect(x, y + 15, 16, 1);
      ctx.fillRect(x, y, 1, 16);
      ctx.fillRect(x + 15, y, 1, 16);
      ctx.fillRect(x + 7, y, 2, 16);
      ctx.fillRect(x, y + 7, 16, 2);
      // Inner filament nodes
      ctx.fillStyle = '#663e21';
      ctx.fillRect(x + 3, y + 3, 3, 3);
      ctx.fillRect(x + 10, y + 3, 3, 3);
      ctx.fillRect(x + 3, y + 10, 3, 3);
      ctx.fillRect(x + 10, y + 10, 3, 3);
    });

    // 13. Redstone Lamp (Lit)
    this.drawTile(TextureIndex.REDSTONE_LAMP_LIT, (ctx, x, y) => {
      ctx.fillStyle = '#e59e35';
      ctx.fillRect(x, y, 16, 16);
      // Frame grid
      ctx.fillStyle = '#3a2010';
      ctx.fillRect(x, y, 16, 1);
      ctx.fillRect(x, y + 15, 16, 1);
      ctx.fillRect(x, y, 1, 16);
      ctx.fillRect(x + 15, y, 1, 16);
      ctx.fillRect(x + 7, y, 2, 16);
      ctx.fillRect(x, y + 7, 16, 2);
      // Brilliant glowing amber centers
      ctx.fillStyle = '#ffeaa7';
      ctx.fillRect(x + 2, y + 2, 4, 4);
      ctx.fillRect(x + 10, y + 2, 4, 4);
      ctx.fillRect(x + 2, y + 10, 4, 4);
      ctx.fillRect(x + 10, y + 10, 4, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 3, y + 3, 2, 2);
      ctx.fillRect(x + 11, y + 3, 2, 2);
      ctx.fillRect(x + 3, y + 11, 2, 2);
      ctx.fillRect(x + 11, y + 11, 2, 2);
    });

    // 14. Farmland Top & Side
    this.drawTile(TextureIndex.FARMLAND_TOP, (ctx, x, y) => {
      // Dark fertile tilled loam soil
      ctx.fillStyle = '#4a2f1a';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 8811);
          if (r > 0.65) {
            ctx.fillStyle = '#5c3a21';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#3a2312';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Furrow rows running across horizontally
      ctx.fillStyle = '#2f1a0b';
      for (let row = 1; row < 16; row += 3) {
        ctx.fillRect(x, y + row, 16, 1);
      }
    });

    this.drawTile(TextureIndex.FARMLAND_SIDE, (ctx, x, y) => {
      // Dirt on bottom 14 rows
      drawDirt(ctx, x, y);
      // Dark tilled top rim
      ctx.fillStyle = '#4a2f1a';
      ctx.fillRect(x, y, 16, 2);
      ctx.fillStyle = '#3a2312';
      ctx.fillRect(x, y + 2, 16, 1);
    });

    // 15. Cobweb
    this.drawTile(TextureIndex.COBWEB, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      // Radial corner lines
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 15, y + 15);
      ctx.moveTo(x + 15, y + 1); ctx.lineTo(x + 1, y + 15);
      ctx.moveTo(x + 8, y + 1); ctx.lineTo(x + 8, y + 15);
      ctx.moveTo(x + 1, y + 8); ctx.lineTo(x + 15, y + 8);
      ctx.stroke();

      // Concentric web rings
      ctx.strokeStyle = '#d5d5d5';
      ctx.strokeRect(x + 5.5, y + 5.5, 5, 5);
      ctx.strokeStyle = '#c0c0c0';
      ctx.strokeRect(x + 2.5, y + 2.5, 11, 11);
    });

    // 16. Rail
    this.drawTile(TextureIndex.RAIL, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Wooden ties (sleepers)
      ctx.fillStyle = '#7a5229';
      ctx.fillRect(x + 1, y + 2, 14, 2);
      ctx.fillRect(x + 1, y + 7, 14, 2);
      ctx.fillRect(x + 1, y + 12, 14, 2);
      ctx.fillStyle = '#543617';
      ctx.fillRect(x + 1, y + 3, 14, 1);
      ctx.fillRect(x + 1, y + 8, 14, 1);
      ctx.fillRect(x + 1, y + 13, 14, 1);

      // Steel rails
      ctx.fillStyle = '#b0b0b0';
      ctx.fillRect(x + 3, y, 2, 16);
      ctx.fillRect(x + 11, y, 2, 16);
      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(x + 3, y, 1, 16);
      ctx.fillRect(x + 11, y, 1, 16);
      ctx.fillStyle = '#707070';
      ctx.fillRect(x + 4, y, 1, 16);
      ctx.fillRect(x + 12, y, 1, 16);

      // Metal spikes on ties
      ctx.fillStyle = '#333333';
      ctx.fillRect(x + 2, y + 2, 1, 1);
      ctx.fillRect(x + 5, y + 2, 1, 1);
      ctx.fillRect(x + 10, y + 2, 1, 1);
      ctx.fillRect(x + 13, y + 2, 1, 1);
      ctx.fillRect(x + 2, y + 7, 1, 1);
      ctx.fillRect(x + 5, y + 7, 1, 1);
      ctx.fillRect(x + 10, y + 7, 1, 1);
      ctx.fillRect(x + 13, y + 7, 1, 1);
      ctx.fillRect(x + 2, y + 12, 1, 1);
      ctx.fillRect(x + 5, y + 12, 1, 1);
      ctx.fillRect(x + 10, y + 12, 1, 1);
      ctx.fillRect(x + 13, y + 12, 1, 1);
    });

    // 17. Sugar Cane
    this.drawTile(TextureIndex.SUGAR_CANE, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Segmented stalks
      const stalkX = [2, 6, 10, 13];
      for (const sx of stalkX) {
        ctx.fillStyle = '#78b82e';
        ctx.fillRect(x + sx, y, 2, 16);
        ctx.fillStyle = '#9fe642';
        ctx.fillRect(x + sx, y, 1, 16);
        // Joint rings
        ctx.fillStyle = '#4e7e17';
        ctx.fillRect(x + sx, y + 4, 2, 1);
        ctx.fillRect(x + sx, y + 9, 2, 1);
        ctx.fillRect(x + sx, y + 14, 2, 1);
      }
      // Small side shoots / leaf tips
      ctx.fillStyle = '#8bd434';
      ctx.fillRect(x + 4, y + 3, 2, 1);
      ctx.fillRect(x + 8, y + 8, 2, 1);
      ctx.fillRect(x + 12, y + 5, 2, 1);
    });

    // 18. Red Mushroom
    this.drawTile(TextureIndex.RED_MUSHROOM, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Stem
      ctx.fillStyle = '#e3dac9';
      ctx.fillRect(x + 7, y + 8, 2, 8);
      ctx.fillStyle = '#c7bca8';
      ctx.fillRect(x + 8, y + 8, 1, 8);

      // Red Cap
      ctx.fillStyle = '#d42828';
      ctx.fillRect(x + 4, y + 3, 8, 5);
      ctx.fillRect(x + 3, y + 5, 10, 3);
      ctx.fillStyle = '#9e1a1a';
      ctx.fillRect(x + 3, y + 7, 10, 1);

      // White polka dots
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 5, y + 4, 2, 2);
      ctx.fillRect(x + 9, y + 4, 2, 2);
      ctx.fillRect(x + 4, y + 6, 1, 1);
      ctx.fillRect(x + 11, y + 6, 1, 1);
      ctx.fillRect(x + 7, y + 5, 2, 2);
    });

    // 19. Brown Mushroom
    this.drawTile(TextureIndex.BROWN_MUSHROOM, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Stem
      ctx.fillStyle = '#d8cca8';
      ctx.fillRect(x + 7, y + 7, 2, 9);
      ctx.fillStyle = '#b8aa84';
      ctx.fillRect(x + 8, y + 7, 1, 9);

      // Flat brown umbrella cap
      ctx.fillStyle = '#87562b';
      ctx.fillRect(x + 3, y + 4, 10, 3);
      ctx.fillRect(x + 4, y + 3, 8, 1);
      ctx.fillStyle = '#5c3818';
      ctx.fillRect(x + 3, y + 6, 10, 1);
      ctx.fillStyle = '#a87340';
      ctx.fillRect(x + 5, y + 3, 6, 1);
      ctx.fillRect(x + 4, y + 4, 2, 1);
    });

    // 20. Lily Pad
    this.drawTile(TextureIndex.LILY_PAD, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      ctx.fillStyle = '#2d5e23';
      ctx.fillRect(x + 2, y + 2, 12, 12);
      // Rounded corners
      ctx.clearRect(x + 2, y + 2, 2, 1);
      ctx.clearRect(x + 2, y + 2, 1, 2);
      ctx.clearRect(x + 12, y + 2, 2, 1);
      ctx.clearRect(x + 13, y + 2, 1, 2);
      ctx.clearRect(x + 2, y + 13, 2, 1);
      ctx.clearRect(x + 2, y + 12, 1, 2);
      ctx.clearRect(x + 12, y + 13, 2, 1);
      ctx.clearRect(x + 13, y + 12, 1, 2);

      // Pad color gradient & veins
      ctx.fillStyle = '#3c7930';
      ctx.fillRect(x + 3, y + 3, 10, 10);
      ctx.fillStyle = '#4c963d';
      ctx.fillRect(x + 4, y + 4, 4, 4);

      // Characteristic V-notch
      ctx.clearRect(x + 8, y + 2, 2, 6);
      ctx.clearRect(x + 7, y + 4, 2, 3);
    });

    // 21. Dripstone Block
    this.drawTile(TextureIndex.DRIPSTONE_BLOCK, (ctx, x, y) => {
      ctx.fillStyle = '#835c4b';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 7123);
          if (r > 0.7) {
            ctx.fillStyle = '#9c6d59';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#6e4d3f';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Mineral drip lines
      ctx.fillStyle = '#593e32';
      ctx.fillRect(x + 3, y + 4, 2, 7);
      ctx.fillRect(x + 10, y + 2, 2, 8);
      ctx.fillStyle = '#b38069';
      ctx.fillRect(x + 4, y + 5, 1, 4);
    });

    // Ice (Translucent frosted cyan with ice crystal streaks)
    this.drawTile(TextureIndex.ICE, (ctx, x, y) => {
      ctx.fillStyle = '#8fc5e3';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 8812);
          if (r > 0.75) {
            ctx.fillStyle = '#bce5f8';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.25) {
            ctx.fillStyle = '#72a9c9';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
      // Crystal fractures
      ctx.fillStyle = '#d8f2ff';
      ctx.fillRect(x + 2, y + 4, 4, 1);
      ctx.fillRect(x + 5, y + 5, 3, 1);
      ctx.fillRect(x + 9, y + 10, 5, 1);
      ctx.fillRect(x + 11, y + 11, 3, 1);
    });

    // 22. Monster Spawner (Iron cage cage bars with blazing fire glow)
    this.drawTile(TextureIndex.SPAWNER, (ctx, x, y) => {
      // Dark hollow background
      ctx.fillStyle = '#12171a';
      ctx.fillRect(x, y, 16, 16);

      // Inner fire core
      ctx.fillStyle = '#e67e22';
      ctx.fillRect(x + 5, y + 5, 6, 6);
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(x + 6, y + 6, 4, 4);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(x + 7, y + 7, 2, 2);

      // Iron cage outer border
      ctx.fillStyle = '#3a444a';
      ctx.fillRect(x, y, 16, 2);
      ctx.fillRect(x, y + 14, 16, 2);
      ctx.fillRect(x, y, 2, 16);
      ctx.fillRect(x + 14, y, 2, 16);

      // Vertical & horizontal cage bars
      ctx.fillStyle = '#2c353b';
      ctx.fillRect(x + 5, y, 2, 16);
      ctx.fillRect(x + 9, y, 2, 16);
      ctx.fillRect(x, y + 5, 16, 2);
      ctx.fillRect(x, y + 9, 16, 2);

      // Iron highlight studs
      ctx.fillStyle = '#5f6d75';
      ctx.fillRect(x + 1, y + 1, 1, 1);
      ctx.fillRect(x + 14, y + 1, 1, 1);
      ctx.fillRect(x + 1, y + 14, 1, 1);
      ctx.fillRect(x + 14, y + 14, 1, 1);
    });

    // 23. End Stone (Pitted pale yellow-cream celestial rock)
    this.drawTile(TextureIndex.END_STONE, (ctx, x, y) => {
      ctx.fillStyle = '#dedaa4';
      ctx.fillRect(x, y, 16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 9101);
          if (r > 0.72) {
            ctx.fillStyle = '#eeeab8';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.22) {
            ctx.fillStyle = '#c5bf80';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.08) {
            ctx.fillStyle = '#a69f60';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    });

    // 24. End Portal Frame Top (Empty)
    this.drawTile(TextureIndex.END_PORTAL_FRAME_TOP, (ctx, x, y) => {
      // Outer mossy green stone rim
      ctx.fillStyle = '#395a42';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#4c7356';
      ctx.fillRect(x + 1, y + 1, 14, 14);

      // Corner gold/sandstone accents
      ctx.fillStyle = '#dedaa4';
      ctx.fillRect(x + 1, y + 1, 2, 2);
      ctx.fillRect(x + 13, y + 1, 2, 2);
      ctx.fillRect(x + 1, y + 13, 2, 2);
      ctx.fillRect(x + 13, y + 13, 2, 2);

      // Dark sunken circular socket for Eye of Ender
      ctx.fillStyle = '#17362a';
      ctx.fillRect(x + 4, y + 4, 8, 8);
      ctx.fillStyle = '#0f241c';
      ctx.fillRect(x + 5, y + 5, 6, 6);
    });

    // 25. End Portal Frame Side
    this.drawTile(TextureIndex.END_PORTAL_FRAME_SIDE, (ctx, x, y) => {
      // Lower End Stone section
      ctx.fillStyle = '#dedaa4';
      ctx.fillRect(x, y + 4, 16, 12);
      for (let py = 4; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const r = pseudoRandom(py * 16 + px + 9202);
          if (r > 0.75) {
            ctx.fillStyle = '#eeeab8';
            ctx.fillRect(x + px, y + py, 1, 1);
          } else if (r < 0.22) {
            ctx.fillStyle = '#c5bf80';
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }

      // Upper decorative green band
      ctx.fillStyle = '#304c38';
      ctx.fillRect(x, y, 16, 4);
      ctx.fillStyle = '#43684d';
      ctx.fillRect(x, y + 1, 16, 2);
    });

    // 26. End Portal Frame Top (Filled with Eye of Ender)
    this.drawTile(TextureIndex.END_PORTAL_FRAME_FILLED_TOP, (ctx, x, y) => {
      // Base frame
      ctx.fillStyle = '#395a42';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#4c7356';
      ctx.fillRect(x + 1, y + 1, 14, 14);

      ctx.fillStyle = '#dedaa4';
      ctx.fillRect(x + 1, y + 1, 2, 2);
      ctx.fillRect(x + 13, y + 1, 2, 2);
      ctx.fillRect(x + 1, y + 13, 2, 2);
      ctx.fillRect(x + 13, y + 13, 2, 2);

      // Dark socket
      ctx.fillStyle = '#17362a';
      ctx.fillRect(x + 4, y + 4, 8, 8);

      // Glowing Eye of Ender embedded in socket
      ctx.fillStyle = '#11998e';
      ctx.fillRect(x + 5, y + 5, 6, 6);
      ctx.fillStyle = '#38ef7d';
      ctx.fillRect(x + 6, y + 6, 4, 4);
      // Slit pupil & fire reflection
      ctx.fillStyle = '#0a1012';
      ctx.fillRect(x + 7, y + 6, 2, 4);
      ctx.fillStyle = '#fdcb6e';
      ctx.fillRect(x + 6, y + 6, 1, 1);
    });

    // 27. End Portal Block (Starry cosmic void)
    this.drawTile(TextureIndex.END_PORTAL, (ctx, x, y) => {
      ctx.fillStyle = '#060712';
      ctx.fillRect(x, y, 16, 16);

      // Swirling nebula patches
      ctx.fillStyle = '#14143a';
      ctx.fillRect(x + 2, y + 3, 5, 4);
      ctx.fillRect(x + 9, y + 8, 5, 5);

      // Star specks
      const stars = [
        [3, 4, '#74b9ff'], [5, 11, '#a29bfe'], [11, 3, '#55efc4'],
        [13, 10, '#fd79a8'], [8, 7, '#ffffff'], [10, 13, '#81ecec'],
        [2, 13, '#dfe6e9'], [14, 2, '#ffeaa7']
      ];
      for (const [sx, sy, col] of stars) {
        ctx.fillStyle = col as string;
        ctx.fillRect(x + (sx as number), y + (sy as number), 1, 1);
      }
    });

    // 28. End Crystal
    this.drawTile(TextureIndex.END_CRYSTAL, (ctx, x, y) => {
      ctx.clearRect(x, y, 16, 16);
      // Outer glass faceted prism
      ctx.strokeStyle = '#a29bfe';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3.5, y + 3.5, 9, 9);

      // Inner spinning core
      ctx.fillStyle = '#e84393';
      ctx.fillRect(x + 6, y + 6, 4, 4);
      ctx.fillStyle = '#fd79a8';
      ctx.fillRect(x + 7, y + 7, 2, 2);

      // Corner flare sparkles
      ctx.fillStyle = '#dfe6e9';
      ctx.fillRect(x + 3, y + 3, 2, 2);
      ctx.fillRect(x + 11, y + 11, 2, 2);
    });
  }

  // Create 10 authentic progressive mining crack stages (0-9)
  private createCrackTexture(): THREE.CanvasTexture {
    if (typeof document === 'undefined') {
      return new THREE.CanvasTexture({} as HTMLCanvasElement);
    }

    const crackCanvas = document.createElement('canvas');
    crackCanvas.width = 160; // 10 stages * 16px
    crackCanvas.height = 16;
    const ctx = crackCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Authentic progressive crack segments: [x1, y1, x2, y2, minStage]
    // Each stage cumulatively retains earlier fissures and sprouts new branching fractures
    const crackSegments: [number, number, number, number, number][] = [
      // Stage 0: Subtle central hairline fissure
      [8, 7, 7, 9, 0],
      [7, 9, 9, 10, 0],

      // Stage 1: Central cross fissures
      [8, 7, 9, 5, 1],
      [9, 10, 11, 11, 1],
      [7, 9, 5, 9, 1],

      // Stage 2: Radiating outward branches
      [9, 5, 7, 3, 2],
      [11, 11, 13, 10, 2],
      [5, 9, 4, 12, 2],
      [8, 7, 6, 6, 2],

      // Stage 3: Extending fractures
      [7, 3, 5, 2, 3],
      [13, 10, 14, 12, 3],
      [4, 12, 2, 11, 3],
      [6, 6, 3, 6, 3],
      [9, 5, 12, 4, 3],

      // Stage 4: Secondary branches sprout
      [5, 2, 3, 1, 4],
      [12, 4, 14, 3, 4],
      [14, 12, 15, 14, 4],
      [2, 11, 1, 13, 4],
      [9, 10, 8, 13, 4],
      [8, 13, 9, 15, 4],

      // Stage 5: Spiderweb interconnected fractures
      [3, 6, 2, 8, 5],
      [2, 8, 2, 11, 5],
      [5, 2, 8, 2, 5],
      [12, 4, 11, 7, 5],
      [11, 7, 13, 10, 5],
      [8, 13, 6, 14, 5],

      // Stage 6: Cracks reaching block edges
      [3, 1, 1, 0, 6],
      [14, 3, 15, 2, 6],
      [1, 13, 0, 14, 6],
      [9, 15, 10, 15, 6],
      [6, 6, 8, 9, 6],
      [7, 3, 10, 2, 6],

      // Stage 7: Heavy fragmentation, chunks separating
      [10, 2, 12, 1, 7],
      [12, 1, 14, 0, 7],
      [3, 6, 4, 4, 7],
      [4, 4, 5, 2, 7],
      [6, 14, 4, 15, 7],
      [4, 15, 3, 15, 7],
      [13, 10, 15, 8, 7],
      [15, 8, 15, 7, 7],

      // Stage 8: Severe fragmentation web across borders
      [0, 7, 2, 8, 8],
      [0, 14, 0, 10, 8],
      [15, 2, 15, 4, 8],
      [11, 11, 13, 13, 8],
      [13, 13, 14, 15, 8],
      [14, 15, 15, 15, 8],
      [1, 4, 3, 6, 8],
      [0, 3, 1, 4, 8],
      [7, 9, 9, 7, 8],

      // Stage 9: Deep spiderweb shatter spanning entire face
      [8, 0, 7, 3, 9],
      [15, 12, 14, 12, 9],
      [0, 15, 2, 15, 9],
      [2, 15, 4, 15, 9],
      [5, 9, 6, 12, 9],
      [6, 12, 8, 13, 9],
      [10, 5, 12, 4, 9],
      [12, 7, 15, 6, 9],
      [1, 9, 2, 11, 9]
    ];

    for (let stage = 0; stage < 10; stage++) {
      const ox = stage * 16;

      // 1. First pass: subtle 1px offset highlight for 3D engraved depth
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      for (const seg of crackSegments) {
        if (seg[4] <= stage) {
          ctx.beginPath();
          ctx.moveTo(ox + seg[0] + 1, seg[1] + 1);
          ctx.lineTo(ox + seg[2] + 1, seg[3] + 1);
          ctx.stroke();
        }
      }

      // 2. Second pass: deep black authentic fracture lines
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.90)';
      for (const seg of crackSegments) {
        if (seg[4] <= stage) {
          ctx.beginPath();
          ctx.moveTo(ox + seg[0], seg[1]);
          ctx.lineTo(ox + seg[2], seg[3]);
          ctx.stroke();
        }
      }

      // 3. In advanced stages (6-9), add dense fragmentation specks at intersections
      if (stage >= 6) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(ox + 7, 8, 2, 2);
        ctx.fillRect(ox + 10, 6, 1, 2);
        ctx.fillRect(ox + 5, 11, 2, 1);
        if (stage >= 8) {
          ctx.fillRect(ox + 13, 11, 2, 2);
          ctx.fillRect(ox + 3, 5, 2, 2);
          ctx.fillRect(ox + 11, 3, 1, 1);
        }
      }
    }

    const tex = new THREE.CanvasTexture(crackCanvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  // Generate an icon data URL for inventory / hotbar HUD
  public getItemIconDataUrl(itemId: number): string {
    if (this.iconCache.has(itemId)) {
      return this.iconCache.get(itemId)!;
    }

    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Check if it's a tool or standalone item
    if (itemId >= ItemId.STICK && itemId <= ItemId.DIAMOND_HOE) {
      this.drawToolIcon(ctx, itemId);
    } else {
      // Draw block icon from atlas
      const blockId = itemId as Block;
      let faceIndex = TextureIndex.STONE;
      switch (blockId) {
        case Block.FARMLAND: faceIndex = TextureIndex.FARMLAND_SIDE; break;
        case Block.GRASS: faceIndex = TextureIndex.GRASS_SIDE; break;
        case Block.DIRT: faceIndex = TextureIndex.DIRT; break;
        case Block.COBBLESTONE: faceIndex = TextureIndex.COBBLESTONE; break;
        case Block.OAK_LOG: faceIndex = TextureIndex.OAK_LOG_SIDE; break;
        case Block.OAK_PLANKS: faceIndex = TextureIndex.OAK_PLANKS; break;
        case Block.OAK_LEAVES: faceIndex = TextureIndex.OAK_LEAVES; break;
        case Block.BIRCH_LOG: faceIndex = TextureIndex.BIRCH_LOG_SIDE; break;
        case Block.BIRCH_PLANKS: faceIndex = TextureIndex.BIRCH_PLANKS; break;
        case Block.SAND: faceIndex = TextureIndex.SAND; break;
        case Block.SANDSTONE: faceIndex = TextureIndex.SANDSTONE_SIDE; break;
        case Block.GRAVEL: faceIndex = TextureIndex.GRAVEL; break;
        case Block.GLASS: faceIndex = TextureIndex.GLASS; break;
        case Block.WATER: faceIndex = TextureIndex.WATER; break;
        case Block.COAL_ORE: faceIndex = TextureIndex.COAL_ORE; break;
        case Block.IRON_ORE: faceIndex = TextureIndex.IRON_ORE; break;
        case Block.GOLD_ORE: faceIndex = TextureIndex.GOLD_ORE; break;
        case Block.DIAMOND_ORE: faceIndex = TextureIndex.DIAMOND_ORE; break;
        case Block.CRAFTING_TABLE: faceIndex = TextureIndex.CRAFTING_TABLE_FRONT; break;
        case Block.FURNACE: faceIndex = TextureIndex.FURNACE_FRONT; break;
        case Block.CHEST: faceIndex = TextureIndex.CHEST_FRONT; break;
        case Block.BRICKS: faceIndex = TextureIndex.BRICKS; break;
        case Block.BOOKSHELF: faceIndex = TextureIndex.BOOKSHELF; break;
        case Block.TNT: faceIndex = TextureIndex.TNT_SIDE; break;
        case Block.TORCH: faceIndex = TextureIndex.TORCH; break;
        case Block.DANDELION: faceIndex = TextureIndex.DANDELION; break;
        case Block.POPPY: faceIndex = TextureIndex.POPPY; break;
        case Block.SNOW: faceIndex = TextureIndex.SNOW; break;
        case Block.CACTUS: faceIndex = TextureIndex.CACTUS_SIDE; break;
        case Block.BED: faceIndex = TextureIndex.BED_TOP; break;
        case Block.OBSIDIAN: faceIndex = TextureIndex.OBSIDIAN; break;
        case Block.PORTAL: faceIndex = TextureIndex.PORTAL; break;
        case Block.NETHERRACK: faceIndex = TextureIndex.NETHERRACK; break;
        case Block.SOUL_SAND: faceIndex = TextureIndex.SOUL_SAND; break;
        case Block.GLOWSTONE: faceIndex = TextureIndex.GLOWSTONE; break;
        case Block.NETHER_BRICKS: faceIndex = TextureIndex.NETHER_BRICKS; break;
        case Block.NETHER_QUARTZ_ORE: faceIndex = TextureIndex.NETHER_QUARTZ_ORE; break;
        case Block.LAVA: faceIndex = TextureIndex.LAVA; break;
        case Block.ENCHANTING_TABLE: faceIndex = TextureIndex.ENCHANTING_TABLE_TOP; break;
        case Block.BREWING_STAND: faceIndex = TextureIndex.BREWING_STAND_TOP; break;
        case Block.NETHER_WART_BLOCK: faceIndex = TextureIndex.NETHER_WART_BLOCK; break;
        case Block.REDSTONE_WIRE: faceIndex = TextureIndex.REDSTONE_WIRE; break;
        case Block.REDSTONE_TORCH: faceIndex = TextureIndex.REDSTONE_TORCH; break;
        case Block.LEVER: faceIndex = TextureIndex.LEVER; break;
        case Block.REDSTONE_LAMP: faceIndex = TextureIndex.REDSTONE_LAMP; break;
        case Block.REDSTONE_LAMP_LIT: faceIndex = TextureIndex.REDSTONE_LAMP_LIT; break;
        case Block.COBWEB: faceIndex = TextureIndex.COBWEB; break;
        case Block.RAIL: faceIndex = TextureIndex.RAIL; break;
        case Block.SUGAR_CANE: faceIndex = TextureIndex.SUGAR_CANE; break;
        case Block.RED_MUSHROOM: faceIndex = TextureIndex.RED_MUSHROOM; break;
        case Block.BROWN_MUSHROOM: faceIndex = TextureIndex.BROWN_MUSHROOM; break;
        case Block.LILY_PAD: faceIndex = TextureIndex.LILY_PAD; break;
        case Block.OAK_FENCE: faceIndex = TextureIndex.OAK_PLANKS; break;
        case Block.DRIPSTONE_BLOCK: faceIndex = TextureIndex.DRIPSTONE_BLOCK; break;
        case Block.NETHER_BRICK_FENCE: faceIndex = TextureIndex.NETHER_BRICKS; break;
        case Block.SPAWNER: faceIndex = TextureIndex.SPAWNER; break;
        case Block.END_STONE: faceIndex = TextureIndex.END_STONE; break;
        case Block.END_PORTAL_FRAME: faceIndex = TextureIndex.END_PORTAL_FRAME_TOP; break;
        case Block.END_PORTAL_FRAME_FILLED: faceIndex = TextureIndex.END_PORTAL_FRAME_FILLED_TOP; break;
        case Block.END_PORTAL: faceIndex = TextureIndex.END_PORTAL; break;
        case Block.END_CRYSTAL: faceIndex = TextureIndex.END_CRYSTAL; break;
        default: faceIndex = TextureIndex.STONE; break;
      }

      const sx = (faceIndex % TextureAtlas.TILES_PER_ROW) * TextureAtlas.TILE_SIZE;
      const sy = Math.floor(faceIndex / TextureAtlas.TILES_PER_ROW) * TextureAtlas.TILE_SIZE;
      ctx.drawImage(this.canvas, sx, sy, 16, 16, 0, 0, 32, 32);
    }

    const dataUrl = c.toDataURL();
    this.iconCache.set(itemId, dataUrl);
    return dataUrl;
  }

  public getPixelIcon(itemId: number): string {
    return this.getItemIconDataUrl(itemId);
  }

  private drawToolIcon(ctx: CanvasRenderingContext2D, itemId: number) {
    const scale = 2;
    const drawPixel = (px: number, py: number, col: string) => {
      ctx.fillStyle = col;
      ctx.fillRect(px * scale, py * scale, scale, scale);
    };

    if (itemId === ItemId.STICK) {
      for (let i = 4; i <= 12; i++) {
        drawPixel(i, 16 - i, '#5c4028');
        drawPixel(i + 1, 16 - i, '#7a5a3a');
      }
      return;
    }

    if (itemId === ItemId.APPLE) {
      // Red apple
      ctx.fillStyle = '#dd1111';
      ctx.fillRect(8, 8, 16, 16);
      ctx.fillStyle = '#558822';
      ctx.fillRect(14, 4, 4, 4);
      return;
    }

    if (itemId === ItemId.COAL) {
      ctx.fillStyle = '#222222';
      ctx.fillRect(8, 8, 16, 16);
      return;
    }

    if (itemId === ItemId.DIAMOND) {
      ctx.fillStyle = '#4dedf4';
      ctx.fillRect(8, 8, 16, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10, 10, 4, 4);
      return;
    }

    if (itemId === ItemId.IRON_INGOT) {
      ctx.fillStyle = '#dcdcdc';
      ctx.fillRect(6, 10, 20, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 10, 20, 3);
      return;
    }

    if (itemId === ItemId.GOLD_INGOT) {
      ctx.fillStyle = '#fcee4b';
      ctx.fillRect(6, 10, 20, 12);
      ctx.fillStyle = '#ffff99';
      ctx.fillRect(6, 10, 20, 3);
      return;
    }

    if (itemId === ItemId.EMERALD) {
      ctx.fillStyle = '#17dd62';
      ctx.fillRect(8, 8, 16, 16);
      ctx.fillStyle = '#6eff9b';
      ctx.fillRect(10, 10, 12, 12);
      ctx.fillStyle = '#0a8838';
      ctx.strokeRect(8.5, 8.5, 15, 15);
      return;
    }

    if (itemId === ItemId.BREAD) {
      ctx.fillStyle = '#d28b49';
      ctx.fillRect(4, 10, 24, 12);
      ctx.fillStyle = '#8d5524';
      ctx.fillRect(4, 10, 24, 3);
      ctx.fillRect(8, 14, 3, 4);
      ctx.fillRect(14, 14, 3, 4);
      ctx.fillRect(20, 14, 3, 4);
      return;
    }

    if (itemId === ItemId.RAW_BEEF || itemId === ItemId.COOKED_BEEF) {
      ctx.fillStyle = itemId === ItemId.RAW_BEEF ? '#aa2222' : '#5a2d18';
      ctx.fillRect(6, 8, 20, 16);
      ctx.fillStyle = itemId === ItemId.RAW_BEEF ? '#ffcccc' : '#8d4d29';
      ctx.fillRect(8, 10, 8, 6);
      return;
    }

    if (itemId === ItemId.PORKCHOP) {
      ctx.fillStyle = '#f48fb1';
      ctx.fillRect(6, 8, 20, 16);
      ctx.fillStyle = '#ad1457';
      ctx.strokeRect(6.5, 8.5, 19, 15);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(18, 10, 4, 4);
      return;
    }

    if (itemId === ItemId.FEATHER) {
      ctx.fillStyle = '#ffffff';
      for (let i = 4; i <= 14; i++) {
        drawPixel(i, 16 - i, '#dddddd');
        drawPixel(i - 1, 16 - i, '#ffffff');
        drawPixel(i + 1, 16 - i, '#bbbbbb');
      }
      return;
    }

    if (itemId === ItemId.RAW_CHICKEN) {
      ctx.fillStyle = '#f8bbd0';
      ctx.fillRect(8, 10, 16, 12);
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(6, 18, 6, 4);
      return;
    }

    if (itemId === ItemId.LEATHER) {
      ctx.fillStyle = '#795548';
      ctx.fillRect(6, 6, 20, 20);
      ctx.fillStyle = '#4e342e';
      ctx.fillRect(10, 10, 12, 12);
      return;
    }

    if (itemId === ItemId.GUNPOWDER) {
      ctx.fillStyle = '#555555';
      ctx.fillRect(8, 14, 16, 8);
      ctx.fillRect(12, 10, 8, 4);
      ctx.fillStyle = '#333333';
      ctx.fillRect(10, 16, 4, 4);
      return;
    }

    if (itemId === ItemId.ROTTEN_FLESH) {
      ctx.fillStyle = '#4e6b32';
      ctx.fillRect(6, 8, 20, 16);
      ctx.fillStyle = '#825e34';
      ctx.fillRect(12, 12, 8, 8);
      return;
    }

    if (itemId === ItemId.WOOL) {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(6, 6, 20, 20);
      ctx.fillStyle = '#c0c0c0';
      ctx.strokeRect(6.5, 6.5, 19, 19);
      return;
    }

    if (itemId === ItemId.WHEAT) {
      ctx.fillStyle = '#e6b800';
      ctx.fillRect(8, 8, 16, 16);
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(10, 6, 12, 8);
      ctx.fillStyle = '#8d5524';
      ctx.fillRect(6, 16, 20, 2);
      return;
    }

    // Determine material color for pickaxe / sword / axe / shovel
    let matCol = '#9e7c47';
    if (itemId.toString().includes('STONE')) matCol = '#757575';
    if (itemId.toString().includes('IRON')) matCol = '#e0e0e0';
    if (itemId.toString().includes('DIAMOND')) matCol = '#4dedf4';

    // Stick handle diagonal
    for (let i = 2; i <= 10; i++) {
      drawPixel(i, 16 - i, '#5c4028');
    }

    // Tool head
    if (itemId === ItemId.WOODEN_PICKAXE || itemId === ItemId.STONE_PICKAXE || itemId === ItemId.IRON_PICKAXE || itemId === ItemId.DIAMOND_PICKAXE) {
      drawPixel(9, 4, matCol);
      drawPixel(10, 4, matCol);
      drawPixel(11, 4, matCol);
      drawPixel(12, 5, matCol);
      drawPixel(13, 6, matCol);
      drawPixel(9, 5, matCol);
      drawPixel(8, 6, matCol);
      drawPixel(7, 7, matCol);
    } else if (itemId === ItemId.WOODEN_SWORD || itemId === ItemId.STONE_SWORD || itemId === ItemId.IRON_SWORD || itemId === ItemId.DIAMOND_SWORD) {
      for (let i = 6; i <= 13; i++) {
        drawPixel(i, 16 - i, matCol);
        drawPixel(i + 1, 16 - i, '#ffffff');
      }
      // Guard
      drawPixel(5, 12, '#3a3a3a');
      drawPixel(6, 11, '#3a3a3a');
    } else if (itemId.toString().includes('AXE')) {
      for (let ax = 9; ax <= 13; ax++) {
        for (let ay = 3; ay <= 7; ay++) {
          drawPixel(ax, ay, matCol);
        }
      }
    } else if (itemId.toString().includes('SHOVEL')) {
      drawPixel(11, 4, matCol);
      drawPixel(12, 4, matCol);
      drawPixel(11, 5, matCol);
      drawPixel(12, 5, matCol);
      drawPixel(10, 6, matCol);
    } else if (itemId === ItemId.BOW) {
      // Curved wooden stave
      const wood = '#6e4f30';
      const string = '#f1f2f6';
      drawPixel(4, 4, wood);
      drawPixel(5, 3, wood);
      drawPixel(6, 3, wood);
      drawPixel(7, 4, wood);
      drawPixel(8, 5, wood);
      drawPixel(9, 6, wood);
      drawPixel(10, 7, wood);
      drawPixel(11, 8, wood);
      drawPixel(12, 9, wood);
      drawPixel(12, 10, wood);
      drawPixel(11, 11, wood);
      // Bowstring
      drawPixel(4, 5, string);
      drawPixel(5, 6, string);
      drawPixel(6, 7, string);
      drawPixel(7, 8, string);
      drawPixel(8, 9, string);
      drawPixel(9, 10, string);
      drawPixel(10, 11, string);
    } else if (itemId === ItemId.ARROW) {
      // Shaft
      for (let i = 4; i <= 11; i++) {
        drawPixel(i, 16 - i, '#8b5a2b');
      }
      // Flint tip
      drawPixel(11, 4, '#747d8c');
      drawPixel(12, 4, '#2f3542');
      drawPixel(12, 5, '#747d8c');
      // Feathers
      drawPixel(3, 13, '#f1f2f6');
      drawPixel(4, 13, '#ced6e0');
      drawPixel(3, 12, '#ced6e0');
    } else if (itemId === ItemId.BONE) {
      const boneCol = '#dfe4ea';
      for (let i = 5; i <= 11; i++) {
        drawPixel(i, 16 - i, boneCol);
      }
      // Joint knobs
      drawPixel(4, 12, boneCol);
      drawPixel(4, 11, boneCol);
      drawPixel(11, 4, boneCol);
      drawPixel(12, 4, boneCol);
    } else if (itemId === ItemId.FLINT) {
      ctx.fillStyle = '#2f3542';
      ctx.fillRect(10, 6, 12, 16);
      ctx.fillStyle = '#57606f';
      ctx.fillRect(12, 8, 8, 12);
    } else if (itemId === ItemId.IRON_HELMET || itemId === ItemId.DIAMOND_HELMET) {
      const col = itemId === ItemId.IRON_HELMET ? '#e4e7eb' : '#00d2d3';
      const darkCol = itemId === ItemId.IRON_HELMET ? '#8395a7' : '#01a3a4';
      for (let px = 3; px <= 12; px++) {
        for (let py = 3; py <= 6; py++) drawPixel(px, py, col);
      }
      // Cheek guards
      drawPixel(3, 7, col); drawPixel(3, 8, col); drawPixel(3, 9, darkCol);
      drawPixel(12, 7, col); drawPixel(12, 8, col); drawPixel(12, 9, darkCol);
      // Nose guard
      drawPixel(7, 7, darkCol); drawPixel(8, 7, darkCol);
    } else if (itemId === ItemId.IRON_CHESTPLATE || itemId === ItemId.DIAMOND_CHESTPLATE) {
      const col = itemId === ItemId.IRON_CHESTPLATE ? '#e4e7eb' : '#00d2d3';
      const darkCol = itemId === ItemId.IRON_CHESTPLATE ? '#8395a7' : '#01a3a4';
      // Torso
      for (let px = 4; px <= 11; px++) {
        for (let py = 4; py <= 12; py++) drawPixel(px, py, col);
      }
      // Shoulders
      for (let py = 4; py <= 8; py++) {
        drawPixel(2, py, col); drawPixel(3, py, col);
        drawPixel(12, py, darkCol); drawPixel(13, py, darkCol);
      }
      // Neck cutout
      drawPixel(7, 4, '#1e272e'); drawPixel(8, 4, '#1e272e');
    } else if (itemId === ItemId.IRON_LEGGINGS || itemId === ItemId.DIAMOND_LEGGINGS) {
      const col = itemId === ItemId.IRON_LEGGINGS ? '#e4e7eb' : '#00d2d3';
      const darkCol = itemId === ItemId.IRON_LEGGINGS ? '#8395a7' : '#01a3a4';
      // Waist
      for (let px = 4; px <= 11; px++) {
        drawPixel(px, 4, col); drawPixel(px, 5, col);
      }
      // Legs
      for (let py = 6; py <= 13; py++) {
        drawPixel(4, py, col); drawPixel(5, py, col); drawPixel(6, py, darkCol);
        drawPixel(9, py, col); drawPixel(10, py, col); drawPixel(11, py, darkCol);
      }
    } else if (itemId === ItemId.IRON_BOOTS || itemId === ItemId.DIAMOND_BOOTS) {
      const col = itemId === ItemId.IRON_BOOTS ? '#e4e7eb' : '#00d2d3';
      const darkCol = itemId === ItemId.IRON_BOOTS ? '#8395a7' : '#01a3a4';
      // Left and right boots
      for (let py = 8; py <= 12; py++) {
        drawPixel(3, py, col); drawPixel(4, py, col);
        drawPixel(10, py, col); drawPixel(11, py, col);
      }
      // Foot base
      for (let px = 2; px <= 5; px++) drawPixel(px, 12, darkCol);
      for (let px = 9; px <= 12; px++) drawPixel(px, 12, darkCol);
    } else if (itemId === ItemId.QUARTZ) {
      // Nether Quartz crystalline shard
      const white = '#ffffff';
      const paleBlue = '#dff9fb';
      const shadow = '#c7ecee';
      drawPixel(8, 4, white);
      drawPixel(7, 5, white); drawPixel(8, 5, paleBlue); drawPixel(9, 5, white);
      drawPixel(6, 6, paleBlue); drawPixel(7, 6, white); drawPixel(8, 6, white); drawPixel(9, 6, shadow);
      drawPixel(6, 7, paleBlue); drawPixel(7, 7, paleBlue); drawPixel(8, 7, shadow); drawPixel(9, 7, shadow);
      drawPixel(7, 8, shadow); drawPixel(8, 8, shadow);
      drawPixel(8, 9, '#95afc0');
    } else if (itemId === ItemId.GLOWSTONE_DUST) {
      // Sparkling golden powder
      const gold = '#f9ca24';
      const bright = '#fff200';
      const darkGold = '#f0932b';
      for (let px = 5; px <= 10; px++) {
        drawPixel(px, 10, darkGold);
      }
      for (let px = 6; px <= 9; px++) {
        drawPixel(px, 9, gold);
      }
      for (let px = 7; px <= 8; px++) {
        drawPixel(px, 8, bright);
      }
      drawPixel(6, 7, bright);
      drawPixel(10, 8, '#ffffff'); // Glint
    } else if (itemId === ItemId.BOOK) {
      // Leather bound book with parchment pages
      const leather = '#8b4513';
      const page = '#f7f1e3';
      const spine = '#5c2d0c';
      for (let px = 4; px <= 11; px++) {
        for (let py = 4; py <= 12; py++) {
          drawPixel(px, py, leather);
        }
      }
      // Spine
      for (let py = 4; py <= 12; py++) {
        drawPixel(4, py, spine);
      }
      // Pages
      for (let py = 5; py <= 11; py++) {
        drawPixel(11, py, page);
      }
      for (let px = 5; px <= 10; px++) {
        drawPixel(px, 12, page);
      }
      // Gold corner emblem
      drawPixel(6, 6, '#f1c40f');
      drawPixel(7, 7, '#f1c40f');
    } else if (itemId === ItemId.GOLD_NUGGET) {
      // Small shimmering golden nugget
      const gold = '#f1c40f';
      const bright = '#fff200';
      const dark = '#f39c12';
      drawPixel(7, 7, bright); drawPixel(8, 7, bright);
      drawPixel(6, 8, gold); drawPixel(7, 8, gold); drawPixel(8, 8, gold); drawPixel(9, 8, dark);
      drawPixel(7, 9, dark); drawPixel(8, 9, dark);
    } else if (itemId === ItemId.GHAST_TEAR) {
      // Mystical glowing teardrop
      const white = '#ffffff';
      const paleCyan = '#c7ecee';
      const shadow = '#7ed6df';
      drawPixel(7, 5, white);
      drawPixel(6, 6, white); drawPixel(7, 6, paleCyan); drawPixel(8, 6, shadow);
      drawPixel(6, 7, paleCyan); drawPixel(7, 7, paleCyan); drawPixel(8, 7, shadow);
      drawPixel(7, 8, shadow);
    } else if (itemId === ItemId.BLAZE_ROD) {
      // Radiant golden-orange fire rod
      const bright = '#fff200';
      const gold = '#f39c12';
      const fire = '#e67e22';
      for (let i = 4; i <= 11; i++) {
        drawPixel(i, 15 - i, bright);
        drawPixel(i + 1, 15 - i, gold);
        drawPixel(i + 1, 16 - i, fire);
      }
    } else if (itemId === ItemId.BLAZE_POWDER) {
      // Fiery glowing spark powder
      drawPixel(7, 6, '#fff200'); drawPixel(8, 6, '#f39c12');
      drawPixel(6, 7, '#f39c12'); drawPixel(7, 7, '#e67e22'); drawPixel(8, 7, '#d35400');
      drawPixel(7, 8, '#c0392b'); drawPixel(8, 8, '#d35400');
      drawPixel(9, 7, '#f1c40f');
    } else if (itemId === ItemId.NETHER_WART) {
      // Crimson nether wart bulb
      const red = '#c0392b';
      const darkRed = '#78281f';
      const brightRed = '#e74c3c';
      drawPixel(7, 6, brightRed); drawPixel(8, 6, brightRed);
      drawPixel(6, 7, red); drawPixel(7, 7, brightRed); drawPixel(8, 7, red); drawPixel(9, 7, darkRed);
      drawPixel(6, 8, red); drawPixel(7, 8, darkRed); drawPixel(8, 8, darkRed);
      drawPixel(7, 9, '#512e5f'); drawPixel(8, 9, '#512e5f'); // Root
    } else if (itemId === ItemId.GLASS_BOTTLE) {
      // Glass bottle with cork stopper
      drawPixel(7, 4, '#8b4513'); drawPixel(8, 4, '#8b4513'); // Cork
      drawPixel(7, 5, '#dfe6e9'); drawPixel(8, 5, '#dfe6e9'); // Neck
      // Bulb body
      drawPixel(6, 6, '#b2bec3'); drawPixel(9, 6, '#b2bec3');
      for (let py = 7; py <= 10; py++) {
        drawPixel(5, py, '#b2bec3');
        drawPixel(6, py, '#ffffff'); // Glint
        drawPixel(7, py, '#dfe6e9');
        drawPixel(8, py, '#dfe6e9');
        drawPixel(9, py, '#b2bec3');
      }
      for (let px = 6; px <= 8; px++) drawPixel(px, 11, '#b2bec3');
    } else if (
      itemId === ItemId.POTION_HEALING ||
      itemId === ItemId.POTION_SPEED ||
      itemId === ItemId.POTION_FIRE_RESISTANCE ||
      itemId === ItemId.POTION_NIGHT_VISION ||
      itemId === ItemId.POTION_STRENGTH
    ) {
      // Colored Potion Flasks
      let liquid = '#ff3838'; // Healing red
      let highlight = '#ff7675';
      if (itemId === ItemId.POTION_SPEED) { liquid = '#00d2d3'; highlight = '#54a0ff'; }
      else if (itemId === ItemId.POTION_FIRE_RESISTANCE) { liquid = '#ff9f43'; highlight = '#feca57'; }
      else if (itemId === ItemId.POTION_NIGHT_VISION) { liquid = '#10ac84'; highlight = '#1dd1a1'; }
      else if (itemId === ItemId.POTION_STRENGTH) { liquid = '#c0392b'; highlight = '#e74c3c'; }

      drawPixel(7, 4, '#8b4513'); drawPixel(8, 4, '#8b4513'); // Cork
      drawPixel(7, 5, '#dfe6e9'); drawPixel(8, 5, '#dfe6e9'); // Neck
      drawPixel(6, 6, '#b2bec3'); drawPixel(9, 6, '#b2bec3');
      for (let py = 7; py <= 10; py++) {
        drawPixel(5, py, '#b2bec3');
        drawPixel(6, py, highlight);
        drawPixel(7, py, liquid);
        drawPixel(8, py, liquid);
        drawPixel(9, py, '#b2bec3');
      }
      for (let px = 6; px <= 8; px++) drawPixel(px, 11, '#b2bec3');
    } else if (itemId === ItemId.RAW_FISH) {
      // Silvery cyan raw cod with fin and eye
      const body = '#688c96';
      const belly = '#9bb2b8';
      const fin = '#47636a';
      // Tail fin
      drawPixel(3, 7, fin); drawPixel(3, 9, fin); drawPixel(4, 8, fin);
      // Body
      for (let x = 5; x <= 11; x++) {
        drawPixel(x, 7, body);
        drawPixel(x, 8, belly);
      }
      drawPixel(7, 6, fin); drawPixel(8, 6, fin); // Dorsal fin
      drawPixel(10, 7, '#ffffff'); drawPixel(11, 7, '#111111'); // Eye
      drawPixel(12, 8, body); // Snout
    } else if (itemId === ItemId.COOKED_FISH) {
      // Golden brown cooked fish fillet
      const crust = '#8a5021';
      const meat = '#c4823f';
      const grill = '#4a2508';
      drawPixel(3, 7, crust); drawPixel(3, 9, crust); drawPixel(4, 8, crust);
      for (let x = 5; x <= 11; x++) {
        drawPixel(x, 7, (x % 3 === 0) ? grill : meat);
        drawPixel(x, 8, crust);
      }
      drawPixel(12, 8, crust);
    } else if (itemId === ItemId.REDSTONE_DUST) {
      // Pile of glowing redstone dust
      ctx.fillStyle = '#991111';
      ctx.fillRect(8, 14, 16, 8);
      ctx.fillStyle = '#ff2222';
      ctx.fillRect(10, 10, 12, 8);
      ctx.fillStyle = '#ff7777';
      ctx.fillRect(12, 8, 8, 4);
      ctx.fillRect(14, 6, 4, 3);
    } else if (itemId === ItemId.LAPIS_LAZULI) {
      // Royal blue lapis gem
      ctx.fillStyle = '#1e3799';
      ctx.fillRect(8, 8, 16, 16);
      ctx.fillStyle = '#4a69bd';
      ctx.fillRect(10, 10, 10, 10);
      ctx.fillStyle = '#f6b93b';
      ctx.fillRect(12, 12, 4, 4);
    } else if (
      itemId === ItemId.BUCKET ||
      itemId === ItemId.WATER_BUCKET ||
      itemId === ItemId.LAVA_BUCKET ||
      itemId === ItemId.MILK_BUCKET
    ) {
      // Metallic Iron Bucket
      const iron = '#bdc3c7';
      const darkIron = '#7f8c8d';
      const handle = '#57606f';

      // Arched handle
      drawPixel(5, 4, handle); drawPixel(6, 3, handle); drawPixel(7, 3, handle);
      drawPixel(8, 3, handle); drawPixel(9, 3, handle); drawPixel(10, 4, handle);

      // Bucket walls
      for (let py = 6; py <= 11; py++) {
        drawPixel(4, py, iron);
        drawPixel(11, py, darkIron);
      }
      for (let px = 5; px <= 10; px++) {
        drawPixel(px, 12, darkIron);
      }

      // Interior / Liquid
      let liquidCol = '#2c3e50'; // Empty bucket hollow dark interior
      if (itemId === ItemId.WATER_BUCKET) liquidCol = '#3498db';
      else if (itemId === ItemId.LAVA_BUCKET) liquidCol = '#e67e22';
      else if (itemId === ItemId.MILK_BUCKET) liquidCol = '#ffffff';

      for (let px = 5; px <= 10; px++) {
        for (let py = 6; py <= 11; py++) {
          drawPixel(px, py, liquidCol);
        }
      }

      if (itemId === ItemId.LAVA_BUCKET) {
        drawPixel(7, 8, '#f1c40f');
        drawPixel(8, 7, '#f1c40f');
      } else if (itemId === ItemId.WATER_BUCKET) {
        drawPixel(6, 7, '#64b5f6');
        drawPixel(7, 7, '#ffffff');
      }
    } else if (itemId === ItemId.WHEAT_SEEDS) {
      // Golden grain seed specks
      const seedCol = '#c8a064';
      const darkSeed = '#8d6e3f';
      drawPixel(6, 9, seedCol); drawPixel(7, 8, darkSeed);
      drawPixel(8, 10, seedCol); drawPixel(9, 9, darkSeed);
      drawPixel(10, 7, seedCol); drawPixel(11, 8, darkSeed);
      drawPixel(7, 11, seedCol); drawPixel(9, 11, darkSeed);
    } else if (
      itemId === ItemId.WOODEN_HOE ||
      itemId === ItemId.STONE_HOE ||
      itemId === ItemId.IRON_HOE ||
      itemId === ItemId.DIAMOND_HOE
    ) {
      let hoeMat = '#9e7c47';
      if (itemId === ItemId.STONE_HOE) hoeMat = '#757575';
      if (itemId === ItemId.IRON_HOE) hoeMat = '#e0e0e0';
      if (itemId === ItemId.DIAMOND_HOE) hoeMat = '#4dedf4';

      // Stick handle diagonal
      for (let i = 2; i <= 10; i++) {
        drawPixel(i, 16 - i, '#5c4028');
      }
      // Hoe blade extending right and down
      drawPixel(10, 4, hoeMat);
      drawPixel(11, 4, hoeMat);
      drawPixel(12, 4, hoeMat);
      drawPixel(13, 5, hoeMat);
      drawPixel(9, 5, hoeMat);
    } else if (itemId === ItemId.ENDER_PEARL) {
      // Shimmering dark teal pearl
      const tealDark = '#0b3b36';
      const tealMid = '#16695f';
      const tealLight = '#239b8c';
      const highlight = '#55efc4';
      for (let py = 4; py <= 12; py++) {
        for (let px = 4; px <= 12; px++) {
          const dx = px - 8;
          const dy = py - 8;
          if (dx * dx + dy * dy <= 18) {
            drawPixel(px, py, tealMid);
          }
        }
      }
      drawPixel(8, 5, highlight);
      drawPixel(7, 6, highlight);
      drawPixel(8, 6, tealLight);
      drawPixel(6, 7, highlight);
      drawPixel(10, 10, tealDark);
      drawPixel(9, 11, tealDark);
    } else if (itemId === ItemId.EYE_OF_ENDER) {
      // Glowing green/teal pearl with slit pupil and fiery flare
      for (let py = 4; py <= 12; py++) {
        for (let px = 4; px <= 12; px++) {
          const dx = px - 8;
          const dy = py - 8;
          if (dx * dx + dy * dy <= 18) {
            drawPixel(px, py, '#16695f');
          }
        }
      }
      // Fiery outer ring
      drawPixel(7, 6, '#fdcb6e');
      drawPixel(8, 6, '#00b894');
      drawPixel(9, 6, '#fdcb6e');
      // Bright iris
      drawPixel(7, 7, '#55efc4');
      drawPixel(9, 7, '#55efc4');
      drawPixel(7, 9, '#55efc4');
      drawPixel(9, 9, '#55efc4');
      // Dark vertical cat-like slit pupil
      drawPixel(8, 7, '#0a1012');
      drawPixel(8, 8, '#0a1012');
      drawPixel(8, 9, '#0a1012');
    }
  }
}
