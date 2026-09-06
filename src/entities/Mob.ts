import * as THREE from 'three';
import { World } from '../world/World';
import { SoundManager } from '../audio/SoundManager';
import { Block, BLOCK_DEFS, ItemId } from '../world/BlockTypes';

export enum MobType {
  COW = 'cow',
  PIG = 'pig',
  SHEEP = 'sheep',
  CHICKEN = 'chicken',
  VILLAGER = 'villager',
  ZOMBIE = 'zombie',
  CREEPER = 'creeper',
  ZOMBIE_PIGMAN = 'zombie_pigman',
  GHAST = 'ghast',
  BLAZE = 'blaze',
  FISH = 'fish',
  COD = 'cod',
  SALMON = 'salmon',
  IRON_GOLEM = 'iron_golem'
}

export interface MobDrop {
  id: number;
  count: number;
}

// Helper to create pixel-perfect procedural canvas textures for mob body parts
function createMobTexture(
  width: number,
  height: number,
  drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Texture generators for each mob type with authentic Minecraft pixel art shading
const MobTextures = {
  // --- COW ---
  cowHead: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Rich brown base with pixel shading
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#482e1b' : ((x * y) % 7 === 0 ? '#5a3b23' : '#51331e');
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // White forehead patch
    ctx.fillStyle = '#dedcd4';
    ctx.fillRect(10, 4, 12, 10);
    ctx.fillStyle = '#c8c6be';
    ctx.fillRect(12, 6, 8, 6);

    // Horns on top corners
    ctx.fillStyle = '#b8b4a4';
    ctx.fillRect(2, 0, 6, 6);
    ctx.fillRect(24, 0, 6, 6);
    ctx.fillStyle = '#7a7668';
    ctx.fillRect(4, 0, 2, 4);
    ctx.fillRect(26, 0, 2, 4);

    // Large dark cow eyes with white reflection
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 12, 6, 6);
    ctx.fillRect(22, 12, 6, 6);
    ctx.fillStyle = '#1e1008';
    ctx.fillRect(6, 14, 4, 4);
    ctx.fillRect(22, 14, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 14, 2, 2);
    ctx.fillRect(22, 14, 2, 2);

    // Pink muzzle with dark nostrils
    ctx.fillStyle = '#d3988e';
    ctx.fillRect(6, 20, 20, 12);
    ctx.fillStyle = '#b87c72';
    ctx.fillRect(6, 20, 20, 2);
    ctx.fillStyle = '#3a1a12';
    ctx.fillRect(9, 24, 4, 4);
    ctx.fillRect(19, 24, 4, 4);
  }),

  cowBody: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Base brown hide with shading
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#482e1b' : '#543621';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Distinct white hide patches
    ctx.fillStyle = '#dedcd4';
    ctx.fillRect(4, 4, 12, 12);
    ctx.fillRect(16, 16, 12, 12);
    ctx.fillRect(2, 22, 8, 8);
    ctx.fillStyle = '#c5c3ba';
    ctx.fillRect(6, 6, 8, 8);
    ctx.fillRect(18, 18, 8, 8);
  }),

  // --- PIG ---
  pigHead: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Multi-shade pink skin
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#ea8b7e' : '#f09689';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Eyes with white sclera and pupil
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 10, 6, 6);
    ctx.fillRect(24, 10, 6, 6);
    ctx.fillStyle = '#111111';
    ctx.fillRect(4, 12, 4, 4);
    ctx.fillRect(24, 12, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 12, 2, 2);
    ctx.fillRect(24, 12, 2, 2);

    // Snout with nostrils
    ctx.fillStyle = '#d9776b';
    ctx.fillRect(8, 18, 16, 10);
    ctx.fillStyle = '#b8584c';
    ctx.fillRect(8, 18, 16, 2);
    ctx.fillStyle = '#4c1812';
    ctx.fillRect(11, 21, 3, 4);
    ctx.fillRect(18, 21, 3, 4);
  }),

  pigBody: () => createMobTexture(32, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#ea8b7e' : ((x * y) % 7 === 0 ? '#df7c6e' : '#f09689');
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }),

  // --- SHEEP ---
  sheepHead: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Wool cap on top
    ctx.fillStyle = '#e4e1d6';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillStyle = '#cfccc0';
    ctx.fillRect(0, 8, w, 4);

    // Tan skin face
    ctx.fillStyle = '#c7ab8e';
    ctx.fillRect(0, 12, w, 20);
    ctx.fillStyle = '#b4987a';
    ctx.fillRect(0, 28, w, 4);

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 14, 6, 4);
    ctx.fillRect(24, 14, 6, 4);
    ctx.fillStyle = '#26160c';
    ctx.fillRect(4, 14, 4, 4);
    ctx.fillRect(24, 14, 4, 4);

    // Shaded nose
    ctx.fillStyle = '#9e795c';
    ctx.fillRect(12, 24, 8, 4);
  }),

  sheepFleece: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Rich textured fluffy wool with crevice shading
    ctx.fillStyle = '#e6e3d7';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d2cfc2';
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        if ((x + y) % 8 === 0) {
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }
    ctx.fillStyle = '#bfbbb0';
    for (let y = 2; y < h; y += 8) {
      for (let x = 2; x < w; x += 8) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }),

  // --- CHICKEN ---
  chickenHead: () => createMobTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(0, 12, w, 4);
    // Dark eyes
    ctx.fillStyle = '#111111';
    ctx.fillRect(1, 4, 3, 3);
    ctx.fillRect(12, 4, 3, 3);
    // Red comb
    ctx.fillStyle = '#c52424';
    ctx.fillRect(5, 0, 6, 3);
    // Yellow beak
    ctx.fillStyle = '#e69a23';
    ctx.fillRect(5, 7, 6, 4);
    // Red wattle
    ctx.fillStyle = '#c52424';
    ctx.fillRect(6, 11, 4, 4);
  }),

  // --- VILLAGER ---
  villagerHead: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Shaded tan skin
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#b67e52' : '#be885d';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Brown villager hood band at top
    ctx.fillStyle = '#4c301c';
    ctx.fillRect(0, 0, w, 6);

    // Thick unibrow
    ctx.fillStyle = '#3c2211';
    ctx.fillRect(4, 10, 24, 4);

    // Green emerald eyes with white sclera
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 14, 6, 4);
    ctx.fillRect(22, 14, 6, 4);
    ctx.fillStyle = '#267b32';
    ctx.fillRect(6, 14, 4, 4);
    ctx.fillRect(22, 14, 4, 4);
    ctx.fillStyle = '#174f1f';
    ctx.fillRect(6, 16, 2, 2);
    ctx.fillRect(22, 16, 2, 2);

    // Mouth
    ctx.fillStyle = '#552f16';
    ctx.fillRect(10, 26, 12, 3);
  }),
  villagerRobe: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Rich textured brown robe
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#482d1a' : '#563620';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Emerald green belt trim
    ctx.fillStyle = '#22772c';
    ctx.fillRect(0, 16, w, 4);
    ctx.fillStyle = '#14521c';
    ctx.fillRect(12, 16, 8, 4);
  }),

  // --- ZOMBIE ---
  zombieHead: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Rotting decayed skin noise
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#386328' : ((x * y) % 5 === 0 ? '#2c4e1f' : '#447532');
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Dark mossy hair
    ctx.fillStyle = '#223e17';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillRect(0, 6, 4, 4);
    ctx.fillRect(28, 6, 4, 4);

    // Hollow dark sunken eyes
    ctx.fillStyle = '#0f1f0a';
    ctx.fillRect(4, 12, 6, 6);
    ctx.fillRect(22, 12, 6, 6);
    ctx.fillStyle = '#060d04';
    ctx.fillRect(6, 14, 3, 3);
    ctx.fillRect(23, 14, 3, 3);

    // Mouth
    ctx.fillStyle = '#16290f';
    ctx.fillRect(10, 22, 12, 4);
  }),
  zombieShirt: () => createMobTexture(32, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#1f707d' : '#278b9b';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Collar & torn hem
    ctx.fillStyle = '#16555f';
    ctx.fillRect(10, 0, 12, 8);
    ctx.fillRect(0, 28, w, 4);
  }),
  zombiePants: () => createMobTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#252c54';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a1f3c';
    ctx.fillRect(0, 10, w, 6);
  }),

  // --- CREEPER ---
  creeperHead: () => createMobTexture(32, 32, (ctx, w, h) => {
    // 4-shade green camouflage noise grid
    const greens = ['#3d8a2d', '#4ba537', '#5db747', '#327224', '#55af3f'];
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = greens[(x * 7 + y * 13) % greens.length];
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Iconic pixel-perfect Creeper Face (pure black)
    ctx.fillStyle = '#0b1609';
    // Eyes (6x6 each)
    ctx.fillRect(4, 8, 6, 6);
    ctx.fillRect(22, 8, 6, 6);
    // Center nose block (8x8)
    ctx.fillRect(12, 14, 8, 8);
    // Mouth sides dropping down (4x10 each)
    ctx.fillRect(8, 18, 4, 10);
    ctx.fillRect(20, 18, 4, 10);
    // Mouth bottom horizontal bars
    ctx.fillRect(8, 24, 6, 4);
    ctx.fillRect(18, 24, 6, 4);
  }),
  creeperBody: () => createMobTexture(32, 32, (ctx, w, h) => {
    const greens = ['#3d8a2d', '#4ba537', '#5db747', '#327224', '#55af3f'];
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = greens[(x * 11 + y * 5) % greens.length];
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }),

  // --- ZOMBIE PIGMAN ---
  pigmanHead: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Left half: Pink pig skin (#f8a5c2)
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w / 2; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#f78fb3' : '#f8a5c2';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Right half: Rotting decayed green flesh (#386328)
    for (let y = 0; y < h; y += 4) {
      for (let x = w / 2; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#2c4e1f' : '#386328';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Pig snout
    ctx.fillStyle = '#e77f98';
    ctx.fillRect(4, 18, 8, 6);
    ctx.fillStyle = '#000000';
    ctx.fillRect(4, 12, 4, 4); // Eye left
    // Right rotting eye socket & bone
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(18, 10, 8, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, 12, 4, 4);
    // Exposed skull bone teeth
    ctx.fillStyle = '#f5f6fa';
    ctx.fillRect(18, 20, 10, 6);
  }),
  pigmanBody: () => createMobTexture(32, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = x < 16 ? '#386328' : '#f8a5c2';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Exposed ribs
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(6, 10, 20, 3);
    ctx.fillRect(6, 16, 20, 3);
    // Golden waist belt
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(0, 26, w, 4);
  }),
  pigmanLimb: () => createMobTexture(16, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = y < 16 ? '#386328' : '#f8a5c2';
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }),

  // --- GHAST ---
  ghastBody: (isCharging: boolean) => createMobTexture(64, 64, (ctx, w, h) => {
    // Pale ghostly white with soft noise
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#ebeff2' : '#f5f6fa';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    if (isCharging) {
      // Blazing furious glowing red eyes
      ctx.fillStyle = '#e84118';
      ctx.fillRect(12, 16, 12, 12);
      ctx.fillRect(40, 16, 12, 12);
      ctx.fillStyle = '#c23616';
      ctx.fillRect(14, 18, 8, 8);
      ctx.fillRect(42, 18, 8, 8);
      // Gaping round red mouth shooting fire
      ctx.fillStyle = '#8b0000';
      ctx.fillRect(22, 36, 20, 20);
      ctx.fillStyle = '#c23616';
      ctx.fillRect(26, 40, 12, 12);
    } else {
      // Sad closed sorrowful weeping eyes
      ctx.fillStyle = '#718093';
      ctx.fillRect(12, 22, 12, 4);
      ctx.fillRect(40, 22, 12, 4);
      // Tear trails
      ctx.fillStyle = '#a4b0be';
      ctx.fillRect(16, 26, 4, 12);
      ctx.fillRect(44, 26, 4, 12);
      // Small sad mouth
      ctx.fillStyle = '#718093';
      ctx.fillRect(28, 44, 8, 4);
    }
  }),
  ghastTentacle: () => createMobTexture(16, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x * y) % 6 === 0 ? '#dcdde1' : '#f5f6fa';
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }),

  // --- BLAZE ---
  blazeCore: () => createMobTexture(32, 32, (ctx, w, h) => {
    const fires = ['#f1c40f', '#e67e22', '#d35400', '#f39c12'];
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = fires[(x * 7 + y * 13) % fires.length];
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Intense glowing eyes
    ctx.fillStyle = '#fff200';
    ctx.fillRect(6, 12, 6, 6);
    ctx.fillRect(20, 12, 6, 6);
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(8, 14, 2, 2);
    ctx.fillRect(22, 14, 2, 2);
  }),
  blazeRod: () => createMobTexture(16, 32, (ctx, w, h) => {
    const rodColors = ['#f1c40f', '#f39c12', '#e67e22', '#d35400'];
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = rodColors[(x + y * 3) % rodColors.length];
        ctx.fillRect(x, y, 4, 4);
      }
    }
    ctx.fillStyle = '#fff200';
    ctx.fillRect(4, 4, 4, 24);
  }),
  // --- FISH (COD / SALMON / TROPICAL FISH) ---
  fishBody: () => createMobTexture(16, 16, (ctx, w, h) => {
    // Silvery cyan-gray cod body with gradient and scales
    ctx.fillStyle = '#6b8994';
    ctx.fillRect(0, 0, 16, 16);
    // Darker dorsal back
    ctx.fillStyle = '#4c646e';
    ctx.fillRect(0, 0, 16, 4);
    // Lighter belly
    ctx.fillStyle = '#9cb6bf';
    ctx.fillRect(0, 10, 16, 6);
    // Fish eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 4, 3, 3);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(3, 5, 2, 2);
    // Scale shading
    for (let y = 4; y < 10; y += 2) {
      for (let x = 4; x < 14; x += 3) {
        ctx.fillStyle = '#59747d';
        ctx.fillRect(x, y, 2, 1);
      }
    }
  }),
  fishTail: () => createMobTexture(16, 16, (ctx, w, h) => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#4c646e';
    ctx.fillRect(4, 2, 4, 12);
    ctx.fillStyle = '#6b8994';
    ctx.fillRect(8, 0, 6, 16);
    ctx.fillStyle = '#9cb6bf';
    ctx.fillRect(10, 4, 4, 8);
  }),
  salmonBody: () => createMobTexture(16, 16, (ctx, w, h) => {
    // Red-pink salmon with dark olive head
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, 0, 16, 16);
    // Olive green head
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(0, 0, 5, 16);
    // Pale salmon belly
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(5, 10, 11, 6);
    // Black eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 4, 3, 3);
    ctx.fillStyle = '#111111';
    ctx.fillRect(2, 5, 2, 2);
  }),
  salmonTail: () => createMobTexture(16, 16, (ctx, w, h) => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#1e824c';
    ctx.fillRect(4, 2, 4, 12);
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(8, 0, 6, 16);
  }),
  tropicalFishBody: () => createMobTexture(16, 16, (ctx, w, h) => {
    // Vibrant orange clownfish with bold white stripes
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(0, 0, 16, 16);
    // White vertical stripes with dark outlines
    ctx.fillStyle = '#111111';
    ctx.fillRect(4, 0, 4, 16);
    ctx.fillRect(10, 0, 4, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 0, 2, 16);
    ctx.fillRect(11, 0, 2, 16);
    // Eye
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1, 4, 3, 3);
    ctx.fillStyle = '#000000';
    ctx.fillRect(2, 5, 2, 2);
  }),
  tropicalFishTail: () => createMobTexture(16, 16, (ctx, w, h) => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#d35400';
    ctx.fillRect(4, 2, 4, 12);
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(8, 0, 6, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, 4, 4, 8);
  }),

  // --- IRON GOLEM ---
  ironGolemHead: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Pale weathered iron/stone
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#d2cec5' : ((x * y) % 6 === 0 ? '#b8b2a7' : '#c8c2b7');
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Heavy villager-style stone brow
    ctx.fillStyle = '#8e887d';
    ctx.fillRect(4, 8, 24, 4);
    // Red glowing irises with black pupils
    ctx.fillStyle = '#111111';
    ctx.fillRect(6, 12, 6, 4);
    ctx.fillRect(20, 12, 6, 4);
    ctx.fillStyle = '#d62424';
    ctx.fillRect(8, 12, 2, 4);
    ctx.fillRect(22, 12, 2, 4);
    // Stone mouth
    ctx.fillStyle = '#6e685f';
    ctx.fillRect(10, 24, 12, 2);
  }),
  ironGolemBody: () => createMobTexture(32, 32, (ctx, w, h) => {
    // Heavy layered iron armor plates
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? '#ccc8bf' : '#bcb6ab';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Trailing vine / moss tendrils on torso and shoulders
    ctx.fillStyle = '#3f722a';
    ctx.fillRect(4, 0, 4, 16);
    ctx.fillRect(8, 8, 4, 8);
    ctx.fillRect(20, 4, 4, 20);
    ctx.fillRect(24, 12, 4, 12);
    ctx.fillStyle = '#5c963e';
    ctx.fillRect(4, 4, 2, 8);
    ctx.fillRect(20, 8, 2, 10);
    // Metallic rivet bolts
    ctx.fillStyle = '#7a746a';
    ctx.fillRect(2, 2, 2, 2);
    ctx.fillRect(28, 2, 2, 2);
    ctx.fillRect(2, 28, 2, 2);
    ctx.fillRect(28, 28, 2, 2);
  }),
  ironGolemArm: () => createMobTexture(16, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 6 === 0 ? '#c5bfb4' : '#b2aba0';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Moss patch on shoulder
    ctx.fillStyle = '#3f722a';
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillRect(4, 8, 4, 6);
  }),
  ironGolemLeg: () => createMobTexture(16, 32, (ctx, w, h) => {
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 6 === 0 ? '#b8b2a6' : '#a7a195';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Anvil base
    ctx.fillStyle = '#6f695e';
    ctx.fillRect(0, 24, w, 8);
  })
};

export class Mob {
  public id: number;
  public type: MobType;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public rotationY: number = 0;
  public health: number;
  public maxHealth: number;

  public width: number;
  public height: number;
  public depth: number;

  public group: THREE.Group;
  public headGroup: THREE.Group;
  public bodyMesh!: THREE.Mesh;
  public legMeshes: THREE.Mesh[] = [];
  public armMeshes: THREE.Mesh[] = [];
  public materials: THREE.MeshLambertMaterial[] = [];

  public isAlive: boolean = true;
  public onGround: boolean = false;
  public inWater: boolean = false;

  public hurtTimer: number = 0;
  private soundTimer: number = 2 + Math.random() * 5;
  private aiTimer: number = 0;
  private walkCycle: number = 0;
  private moveSpeed: number = 2.2;
  private isMoving: boolean = false;
  private wanderDir: THREE.Vector3 = new THREE.Vector3();
  private panicTimer: number = 0;

  // Hostile mob specifics
  public isHostile: boolean = false;
  public attackCooldown: number = 0;
  public creeperFuseTimer: number = 0;
  public isHissing: boolean = false;

  // Nether mob specific state
  public isAngry: boolean = false;
  public onPigmanAggro?: (pos: THREE.Vector3) => void;
  public onSpawnFireball?: (pos: THREE.Vector3, dir: THREE.Vector3) => void;
  public tentacleMeshes: THREE.Mesh[] = [];
  public blazeRods: THREE.Mesh[] = [];
  public ghastAttackTimer: number = 0;
  public ghastCharging: boolean = false;
  public ghastBodyMesh?: THREE.Mesh;
  public ghastCalmMat?: THREE.MeshLambertMaterial;
  public ghastChargeMat?: THREE.MeshLambertMaterial;
  public swordMesh?: THREE.Group;
  public fishTailMesh?: THREE.Mesh;
  public fishFinMeshL?: THREE.Mesh;
  public fishFinMeshR?: THREE.Mesh;
  public fishVariant: 'cod' | 'salmon' = 'cod';
  public get isFish(): boolean {
    return this.type === MobType.FISH || this.type === MobType.COD || this.type === MobType.SALMON;
  }

  // Food Luring & Breeding
  public isLured: boolean = false;
  public inLove: number = 0;
  public isBaby: boolean = false;
  public growUpTimer: number = 0;
  public onSpawnHearts?: (pos: THREE.Vector3) => void;

  private scene: THREE.Scene;
  private sounds: SoundManager;

  constructor(id: number, type: MobType, pos: THREE.Vector3, scene: THREE.Scene, sounds: SoundManager) {
    this.id = id;
    this.type = type;
    this.position = pos.clone();
    this.velocity = new THREE.Vector3();
    this.scene = scene;
    this.sounds = sounds;

    this.group = new THREE.Group();
    this.headGroup = new THREE.Group();
    this.group.add(this.headGroup);

    // Default dimensions and health
    switch (type) {
      case MobType.COW:
        this.width = 0.9;
        this.height = 1.3;
        this.depth = 1.2;
        this.health = this.maxHealth = 10;
        this.buildCow();
        break;
      case MobType.PIG:
        this.width = 0.85;
        this.height = 0.9;
        this.depth = 1.1;
        this.health = this.maxHealth = 10;
        this.buildPig();
        break;
      case MobType.SHEEP:
        this.width = 0.9;
        this.height = 1.3;
        this.depth = 1.2;
        this.health = this.maxHealth = 8;
        this.buildSheep();
        break;
      case MobType.CHICKEN:
        this.width = 0.5;
        this.height = 0.7;
        this.depth = 0.5;
        this.health = this.maxHealth = 4;
        this.moveSpeed = 1.8;
        this.buildChicken();
        break;
      case MobType.VILLAGER:
        this.width = 0.6;
        this.height = 1.95;
        this.depth = 0.6;
        this.health = this.maxHealth = 20;
        this.buildVillager();
        break;
      case MobType.ZOMBIE:
        this.width = 0.6;
        this.height = 1.95;
        this.depth = 0.6;
        this.health = this.maxHealth = 20;
        this.isHostile = true;
        this.moveSpeed = 3.0;
        this.buildZombie();
        break;
      case MobType.CREEPER:
        this.width = 0.6;
        this.height = 1.7;
        this.depth = 0.6;
        this.health = this.maxHealth = 20;
        this.isHostile = true;
        this.moveSpeed = 2.8;
        this.buildCreeper();
        break;
      case MobType.ZOMBIE_PIGMAN:
        this.width = 0.6;
        this.height = 1.95;
        this.depth = 0.6;
        this.health = this.maxHealth = 20;
        this.isHostile = false; // Neutral until attacked!
        this.moveSpeed = 2.4;
        this.buildZombiePigman();
        break;
      case MobType.GHAST:
        this.width = 2.4;
        this.height = 2.4;
        this.depth = 2.4;
        this.health = this.maxHealth = 10;
        this.isHostile = true;
        this.moveSpeed = 3.2;
        this.buildGhast();
        break;
      case MobType.BLAZE:
        this.width = 0.8;
        this.height = 1.8;
        this.depth = 0.8;
        this.health = this.maxHealth = 20;
        this.isHostile = true;
        this.moveSpeed = 2.5;
        this.buildBlaze();
        break;
      case MobType.FISH:
      case MobType.COD:
      case MobType.SALMON:
        this.width = 0.35;
        this.height = 0.3;
        this.depth = 0.55;
        this.health = this.maxHealth = 6;
        this.isHostile = false;
        this.moveSpeed = 2.4;
        if (type === MobType.SALMON) {
          this.fishVariant = 'salmon';
        } else if (type === MobType.COD) {
          this.fishVariant = 'cod';
        } else {
          this.fishVariant = Math.random() < 0.5 ? 'cod' : 'salmon';
        }
        this.buildFish(this.fishVariant);
        break;
      case MobType.IRON_GOLEM:
        this.width = 1.4;
        this.height = 2.7;
        this.depth = 1.0;
        this.health = this.maxHealth = 50;
        this.isHostile = false;
        this.moveSpeed = 2.2;
        this.buildIronGolem();
        break;
    }

    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
      }
    });
    this.group.position.copy(this.position);
    this.scene.add(this.group);
  }

  // --- MOB 3D VOXEL MODEL BUILDERS ---

  private buildCow() {
    const headMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.cowHead() }));
    const bodyMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.cowBody() }));
    const legMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0x583b23 }));
    const hornMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xd9d5c5 }));
    const udderMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xdda096 }));

    // Body: horizontal box (w: 0.9, h: 0.85, d: 1.2)
    const bodyGeo = new THREE.BoxGeometry(0.85, 0.8, 1.2);
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.set(0, 0.85, 0);
    this.group.add(this.bodyMesh);

    // Udder
    const udder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.35), udderMat);
    udder.position.set(0, -0.4, 0.2);
    this.bodyMesh.add(udder);

    // Head
    const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0, 0);
    this.headGroup.position.set(0, 1.25, -0.65);
    this.headGroup.add(head);

    // Horns
    const hornL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), hornMat);
    hornL.position.set(-0.3, 0.3, 0);
    const hornR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), hornMat);
    hornR.position.set(0.3, 0.3, 0);
    this.headGroup.add(hornL, hornR);

    // 4 Legs
    const legGeo = new THREE.BoxGeometry(0.25, 0.65, 0.25);
    const legPositions = [
      [-0.28, 0.32, -0.38], // Front-Left
      [0.28, 0.32, -0.38],  // Front-Right
      [-0.28, 0.32, 0.38],  // Back-Left
      [0.28, 0.32, 0.38]    // Back-Right
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      this.group.add(leg);
      this.legMeshes.push(leg);
    }
  }

  private buildPig() {
    const headMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.pigHead() }));
    const bodyMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.pigBody() }));
    const legMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xe8978b }));
    const snoutMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xd97567 }));

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.8, 0.7, 1.05);
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.set(0, 0.65, 0);
    this.group.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const head = new THREE.Mesh(headGeo, headMat);
    this.headGroup.position.set(0, 0.85, -0.6);
    this.headGroup.add(head);

    // 3D Snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.12), snoutMat);
    snout.position.set(0, -0.1, -0.3);
    this.headGroup.add(snout);

    // 4 Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.45, 0.22);
    const legPositions = [
      [-0.25, 0.22, -0.35],
      [0.25, 0.22, -0.35],
      [-0.25, 0.22, 0.35],
      [0.25, 0.22, 0.35]
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      this.group.add(leg);
      this.legMeshes.push(leg);
    }
  }

  private buildSheep() {
    const headMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.sheepHead() }));
    const fleeceMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.sheepFleece() }));
    const legMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xcdb195 }));

    // Wool Body
    const bodyGeo = new THREE.BoxGeometry(0.9, 0.85, 1.2);
    this.bodyMesh = new THREE.Mesh(bodyGeo, fleeceMat);
    this.bodyMesh.position.set(0, 0.85, 0);
    this.group.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.5);
    const head = new THREE.Mesh(headGeo, headMat);
    this.headGroup.position.set(0, 1.25, -0.65);
    this.headGroup.add(head);

    // 4 Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.65, 0.22);
    const legPositions = [
      [-0.28, 0.32, -0.38],
      [0.28, 0.32, -0.38],
      [-0.28, 0.32, 0.38],
      [0.28, 0.32, 0.38]
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      this.group.add(leg);
      this.legMeshes.push(leg);
    }
  }

  private buildChicken() {
    const headMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.chickenHead() }));
    const bodyMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    const beakMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xdf9420 }));
    const wattleMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xc42020 }));
    const legMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xdf9420 }));

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.35, 0.45);
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.set(0, 0.4, 0);
    this.group.add(this.bodyMesh);

    // Wings
    const wingGeo = new THREE.BoxGeometry(0.06, 0.25, 0.35);
    const wingL = new THREE.Mesh(wingGeo, bodyMat);
    wingL.position.set(-0.23, 0.4, 0);
    const wingR = new THREE.Mesh(wingGeo, bodyMat);
    wingR.position.set(0.23, 0.4, 0);
    this.group.add(wingL, wingR);
    this.armMeshes.push(wingL, wingR);

    // Head
    const headGeo = new THREE.BoxGeometry(0.25, 0.35, 0.25);
    const head = new THREE.Mesh(headGeo, headMat);
    this.headGroup.position.set(0, 0.65, -0.22);
    this.headGroup.add(head);

    // Beak & Wattle
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.12), beakMat);
    beak.position.set(0, -0.05, -0.18);
    const wattle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), wattleMat);
    wattle.position.set(0, -0.14, -0.12);
    this.headGroup.add(beak, wattle);

    // 2 Legs
    const legGeo = new THREE.BoxGeometry(0.08, 0.28, 0.08);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.1, 0.14, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.1, 0.14, 0);
    this.group.add(legL, legR);
    this.legMeshes.push(legL, legR);
  }

  private buildVillager() {
    const headMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.villagerHead() }));
    const robeMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.villagerRobe() }));
    const noseMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xb57e53 }));
    const skinMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xbd875b }));
    const legMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0x482d1b }));

    // Torso / Robe
    const bodyGeo = new THREE.BoxGeometry(0.55, 0.9, 0.38);
    this.bodyMesh = new THREE.Mesh(bodyGeo, robeMat);
    this.bodyMesh.position.set(0, 1.05, 0);
    this.group.add(this.bodyMesh);

    // Folded arms sleeve across chest
    const armsGeo = new THREE.BoxGeometry(0.68, 0.3, 0.3);
    const armsMesh = new THREE.Mesh(armsGeo, robeMat);
    armsMesh.position.set(0, 1.0, -0.16);
    this.group.add(armsMesh);

    // Hands tucked inside sleeve
    const handGeo = new THREE.BoxGeometry(0.2, 0.18, 0.1);
    const handMesh = new THREE.Mesh(handGeo, skinMat);
    handMesh.position.set(0, 0.95, -0.28);
    this.group.add(handMesh);

    // Head
    const headGeo = new THREE.BoxGeometry(0.46, 0.58, 0.46);
    const head = new THREE.Mesh(headGeo, headMat);
    this.headGroup.position.set(0, 1.7, 0);
    this.headGroup.add(head);

    // Prominent Long Nose
    const noseGeo = new THREE.BoxGeometry(0.12, 0.22, 0.14);
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, -0.1, -0.28);
    this.headGroup.add(nose);

    // 2 Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.65, 0.22);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.14, 0.32, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.14, 0.32, 0);
    this.group.add(legL, legR);
    this.legMeshes.push(legL, legR);
  }

  private buildZombie() {
    const headMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.zombieHead() }));
    const shirtMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.zombieShirt() }));
    const pantsMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.zombiePants() }));
    const skinMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0x477c38 }));

    // Torso
    const bodyGeo = new THREE.BoxGeometry(0.55, 0.8, 0.35);
    this.bodyMesh = new THREE.Mesh(bodyGeo, shirtMat);
    this.bodyMesh.position.set(0, 1.05, 0);
    this.group.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
    const head = new THREE.Mesh(headGeo, headMat);
    this.headGroup.position.set(0, 1.68, 0);
    this.headGroup.add(head);

    // Outstretched forward arms (classic zombie posture!)
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
    const armL = new THREE.Mesh(armGeo, skinMat);
    armL.position.set(-0.36, 1.25, -0.3);
    armL.rotation.x = -Math.PI / 2; // Point straight forward
    const armR = new THREE.Mesh(armGeo, skinMat);
    armR.position.set(0.36, 1.25, -0.3);
    armR.rotation.x = -Math.PI / 2;
    this.group.add(armL, armR);
    this.armMeshes.push(armL, armR);

    // 2 Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.68, 0.22);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.14, 0.34, 0);
    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.14, 0.34, 0);
    this.group.add(legL, legR);
    this.legMeshes.push(legL, legR);
  }

  private buildCreeper() {
    const headMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.creeperHead() }));
    const bodyMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.creeperBody() }));
    const legMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0x479438 }));

    // Torso
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.8, 0.32);
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.set(0, 0.8, 0);
    this.group.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
    const head = new THREE.Mesh(headGeo, headMat);
    this.headGroup.position.set(0, 1.44, 0);
    this.headGroup.add(head);

    // 4 Stubby Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.4, 0.2);
    const legPositions = [
      [-0.18, 0.2, -0.16],
      [0.18, 0.2, -0.16],
      [-0.18, 0.2, 0.16],
      [0.18, 0.2, 0.16]
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      this.group.add(leg);
      this.legMeshes.push(leg);
    }
  }

  private buildZombiePigman() {
    const headMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.pigmanHead() }));
    const bodyMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.pigmanBody() }));
    const limbMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.pigmanLimb() }));
    const goldMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0xf1c40f }));

    // Torso
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.72, 0.3);
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.set(0, 1.04, 0);
    this.group.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
    const head = new THREE.Mesh(headGeo, headMat);
    this.headGroup.position.set(0, 1.68, 0);
    this.headGroup.add(head);

    // Left Arm
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
    const armL = new THREE.Mesh(armGeo, limbMat);
    armL.position.set(-0.36, 1.05, 0);
    this.group.add(armL);
    this.armMeshes.push(armL);

    // Right Arm holding Golden Sword
    const armRGroup = new THREE.Group();
    armRGroup.position.set(0.36, 1.35, 0);
    const armR = new THREE.Mesh(armGeo, limbMat);
    armR.position.set(0, -0.3, 0);
    armRGroup.add(armR);

    // Golden Sword
    const sword = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.04), goldMat);
    blade.position.set(0, 0.28, 0.15);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.06), goldMat);
    hilt.position.set(0, 0.02, 0.15);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), new THREE.MeshLambertMaterial({ color: 0x5a3b23 }));
    handle.position.set(0, -0.06, 0.15);
    sword.add(blade, hilt, handle);
    sword.position.set(0, -0.55, 0);
    armRGroup.add(sword);
    this.swordMesh = sword;

    this.group.add(armRGroup);
    this.armMeshes.push(armR);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.68, 0.22);
    const legL = new THREE.Mesh(legGeo, limbMat);
    legL.position.set(-0.14, 0.34, 0);
    const legR = new THREE.Mesh(legGeo, limbMat);
    legR.position.set(0.14, 0.34, 0);
    this.group.add(legL, legR);
    this.legMeshes.push(legL, legR);
  }

  private buildGhast() {
    this.ghastCalmMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.ghastBody(false) }));
    this.ghastChargeMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.ghastBody(true) }));
    const tentacleMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.ghastTentacle() }));

    // Giant 2.4m White Cube Body
    const bodyGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
    this.ghastBodyMesh = new THREE.Mesh(bodyGeo, this.ghastCalmMat);
    this.ghastBodyMesh.position.set(0, 1.6, 0);
    this.group.add(this.ghastBodyMesh);
    this.bodyMesh = this.ghastBodyMesh;

    // 9 Dangling Tentacles
    const tentacleGeo = new THREE.BoxGeometry(0.22, 1.1, 0.22);
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        const tentacle = new THREE.Mesh(tentacleGeo, tentacleMat);
        tentacle.position.set(col * 0.65, 0.4, row * 0.65);
        this.group.add(tentacle);
        this.tentacleMeshes.push(tentacle);
      }
    }
  }

  private buildBlaze() {
    const coreMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.blazeCore() }));
    const rodMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.blazeRod() }));

    // Central Floating Fiery Core
    const headGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46);
    const head = new THREE.Mesh(headGeo, coreMat);
    this.headGroup.position.set(0, 1.2, 0);
    this.headGroup.add(head);

    // Warm Orange Flame Light
    const light = new THREE.PointLight(0xff9900, 2.0, 8);
    this.headGroup.add(light);

    // 12 Orbiting Fire Rods in 3 Tiers
    const rodGeo = new THREE.BoxGeometry(0.12, 0.44, 0.12);
    for (let i = 0; i < 12; i++) {
      const rod = new THREE.Mesh(rodGeo, rodMat);
      this.group.add(rod);
      this.blazeRods.push(rod);
    }
  }

  private buildFish(variant: 'cod' | 'salmon' = this.fishVariant) {
    let bodyTex: THREE.CanvasTexture;
    let tailTex: THREE.CanvasTexture;
    let finColor = 0x5a7680;
    let bodyGeo = new THREE.BoxGeometry(0.2, 0.26, 0.52);
    let tailGeo = new THREE.PlaneGeometry(0.24, 0.28);
    let tailZ = 0.32;

    if (variant === 'salmon') {
      // Vivid Red-Pink Salmon with olive head
      bodyTex = MobTextures.salmonBody();
      tailTex = MobTextures.salmonTail();
      finColor = 0x27ae60;
      bodyGeo = new THREE.BoxGeometry(0.22, 0.28, 0.62);
      tailGeo = new THREE.PlaneGeometry(0.26, 0.32);
      tailZ = 0.38;
    } else {
      // Silvery Cyan-Gray Cod
      bodyTex = MobTextures.fishBody();
      tailTex = MobTextures.fishTail();
      finColor = 0x5a7680;
      bodyGeo = new THREE.BoxGeometry(0.2, 0.26, 0.52);
      tailGeo = new THREE.PlaneGeometry(0.24, 0.28);
      tailZ = 0.32;
    }

    const bodyMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: bodyTex }));
    const tailMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: tailTex, transparent: true, side: THREE.DoubleSide }));
    const finMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: finColor, side: THREE.DoubleSide }));

    // Tapered fish body
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.set(0, 0.15, 0);
    this.group.add(this.bodyMesh);

    // Wagging tail fin
    this.fishTailMesh = new THREE.Mesh(tailGeo, tailMat);
    this.fishTailMesh.position.set(0, 0, tailZ);
    this.bodyMesh.add(this.fishTailMesh);

    // Dorsal top fin
    const dorsalGeo = new THREE.PlaneGeometry(0.28, 0.14);
    const dorsal = new THREE.Mesh(dorsalGeo, finMat);
    dorsal.position.set(0, 0.18, 0.05);
    this.bodyMesh.add(dorsal);

    // Pectoral side fins
    const finGeo = new THREE.PlaneGeometry(0.12, 0.09);
    this.fishFinMeshL = new THREE.Mesh(finGeo, finMat);
    this.fishFinMeshL.position.set(-0.11, -0.04, -0.06);
    this.fishFinMeshL.rotation.y = -Math.PI / 4;
    this.bodyMesh.add(this.fishFinMeshL);

    this.fishFinMeshR = new THREE.Mesh(finGeo, finMat);
    this.fishFinMeshR.position.set(0.11, -0.04, -0.06);
    this.fishFinMeshR.rotation.y = Math.PI / 4;
    this.bodyMesh.add(this.fishFinMeshR);
  }

  private buildIronGolem() {
    const headMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.ironGolemHead() }));
    const bodyMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.ironGolemBody() }));
    const armMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.ironGolemArm() }));
    const legMat = this.addMaterial(new THREE.MeshLambertMaterial({ map: MobTextures.ironGolemLeg() }));
    const stoneMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0x9c968c }));
    const noseMat = this.addMaterial(new THREE.MeshLambertMaterial({ color: 0x8e887d }));

    // Heavy Upper Torso
    const bodyGeo = new THREE.BoxGeometry(0.9, 0.9, 0.6);
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.set(0, 1.7, 0);
    this.group.add(this.bodyMesh);

    // Lower Waist
    const waistGeo = new THREE.BoxGeometry(0.55, 0.35, 0.42);
    const waist = new THREE.Mesh(waistGeo, stoneMat);
    waist.position.set(0, 1.08, 0);
    this.group.add(waist);

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.65, 0.5);
    const head = new THREE.Mesh(headGeo, headMat);
    this.headGroup.position.set(0, 2.38, 0);
    this.headGroup.add(head);

    // Long Stone Nose
    const noseGeo = new THREE.BoxGeometry(0.12, 0.22, 0.14);
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, -0.12, -0.3);
    this.headGroup.add(nose);

    // 2 Heavy Hanging Arms (swing when walking & strike upward)
    const armGeo = new THREE.BoxGeometry(0.24, 1.35, 0.24);
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.64, 1.48, 0);
    const armR = new THREE.Mesh(armGeo, armMat);
    armR.position.set(0.64, 1.48, 0);
    this.group.add(armL, armR);
    this.armMeshes.push(armL, armR);

    // 2 Thick Legs
    const legGeo = new THREE.BoxGeometry(0.28, 0.85, 0.28);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.22, 0.42, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.22, 0.42, 0);
    this.group.add(legL, legR);
    this.legMeshes.push(legL, legR);
  }

  private addMaterial(mat: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
    this.materials.push(mat);
    return mat;
  }

  // --- DAMAGE, AUDIO & HURT FLASH ---

  public takeDamage(amount: number, knockbackDir: THREE.Vector3) {
    if (!this.isAlive) return;

    this.health = Math.max(0, this.health - amount);
    this.hurtTimer = 0.25;
    this.panicTimer = 4.0; // Passive mobs panic and sprint away

    // Knockback
    this.velocity.x += knockbackDir.x * 5.5;
    this.velocity.y = 3.5;
    this.velocity.z += knockbackDir.z * 5.5;

    // Audio
    if (this.type === MobType.IRON_GOLEM) {
      this.sounds.playIronGolemHit();
    } else {
      this.sounds.playMobHit();
      this.playAmbientSound();
    }

    if (this.health <= 0) {
      this.die();
    }

    // Zombie Pigman horde aggro mechanic
    if (this.type === MobType.ZOMBIE_PIGMAN && !this.isAngry) {
      this.isAngry = true;
      this.isHostile = true;
      this.moveSpeed = 4.2; // Sprints furiously towards player!
      this.sounds.playPigmanAngry();
      this.onPigmanAggro?.(this.position);
    }
  }

  public playAmbientSound() {
    switch (this.type) {
      case MobType.COW: this.sounds.playCow(); break;
      case MobType.PIG: this.sounds.playPig(); break;
      case MobType.SHEEP: this.sounds.playSheep(); break;
      case MobType.CHICKEN: this.sounds.playChicken(); break;
      case MobType.VILLAGER: this.sounds.playVillager(); break;
      case MobType.ZOMBIE: this.sounds.playZombie(); break;
      case MobType.CREEPER: this.sounds.playCreeperHiss(); break;
      case MobType.ZOMBIE_PIGMAN:
        if (this.isAngry) this.sounds.playPigmanAngry();
        else this.sounds.playPigmanGrunt();
        break;
      case MobType.GHAST: this.sounds.playGhastWeep(); break;
      case MobType.BLAZE: this.sounds.playBlazeBreathe(); break;
    }
  }

  public getDeathDrops(): MobDrop[] {
    switch (this.type) {
      case MobType.COW:
        return [
          { id: ItemId.RAW_BEEF, count: 1 + Math.floor(Math.random() * 3) },
          { id: ItemId.LEATHER, count: Math.floor(Math.random() * 2) }
        ];
      case MobType.PIG:
        return [{ id: ItemId.PORKCHOP, count: 1 + Math.floor(Math.random() * 2) }];
      case MobType.SHEEP:
        return [
          { id: ItemId.WOOL, count: 1 + Math.floor(Math.random() * 2) },
          { id: ItemId.RAW_BEEF, count: 1 }
        ];
      case MobType.CHICKEN:
        return [
          { id: ItemId.FEATHER, count: 1 + Math.floor(Math.random() * 2) },
          { id: ItemId.RAW_CHICKEN, count: 1 }
        ];
      case MobType.VILLAGER:
        return [{ id: ItemId.EMERALD, count: Math.random() < 0.5 ? 1 : 0 }];
      case MobType.ZOMBIE:
        return [{ id: ItemId.ROTTEN_FLESH, count: 1 + Math.floor(Math.random() * 2) }];
      case MobType.CREEPER:
        return [{ id: ItemId.GUNPOWDER, count: 1 + Math.floor(Math.random() * 2) }];
      case MobType.ZOMBIE_PIGMAN:
        return [
          { id: ItemId.GOLD_NUGGET, count: 1 + Math.floor(Math.random() * 3) },
          { id: ItemId.ROTTEN_FLESH, count: 1 + Math.floor(Math.random() * 2) },
          { id: ItemId.GOLD_INGOT, count: Math.random() < 0.2 ? 1 : 0 }
        ];
      case MobType.GHAST:
        return [
          { id: ItemId.GHAST_TEAR, count: 1 },
          { id: ItemId.GUNPOWDER, count: 1 + Math.floor(Math.random() * 2) }
        ];
      case MobType.BLAZE:
        return [
          { id: ItemId.BLAZE_ROD, count: 1 + Math.floor(Math.random() * 2) }
        ];
      case MobType.FISH:
      case MobType.COD:
      case MobType.SALMON:
        return [
          { id: ItemId.RAW_FISH, count: 1 + (Math.random() < 0.3 ? 1 : 0) }
        ];
      case MobType.IRON_GOLEM:
        return [
          { id: ItemId.IRON_INGOT, count: 3 + Math.floor(Math.random() * 3) }
        ];
      default:
        return [];
    }
  }

  // --- FOOD LURING & BREEDING HELPERS ---

  public getFavoredFoods(): number[] {
    switch (this.type) {
      case MobType.COW:
      case MobType.SHEEP:
        return [ItemId.WHEAT];
      case MobType.CHICKEN:
        return [ItemId.WHEAT_SEEDS];
      case MobType.PIG:
        return [ItemId.APPLE, ItemId.BREAD, (ItemId as any).CARROT || 174];
      default:
        return [];
    }
  }

  public isFavoredFood(itemId: number): boolean {
    if (!itemId) return false;
    return this.getFavoredFoods().includes(itemId);
  }

  public feed() {
    if (this.isBaby || this.inLove > 0) return;
    this.inLove = 30.0;
    this.onSpawnHearts?.(this.position);
  }

  public die() {
    this.isAlive = false;
    this.scene.remove(this.group);
  }

  // --- UPDATE & AI LOOP ---

  public update(
    dt: number,
    world: World,
    playerPos: THREE.Vector3,
    onPlayerDamage: (amt: number) => void,
    onExplosion: (pos: THREE.Vector3, radius: number) => void,
    allMobs?: Mob[],
    playerHeldItemId: number = 0
  ) {
    if (!this.isAlive) return;

    // Love timer and breeding hearts
    if (this.inLove > 0) {
      this.inLove -= dt;
      if (Math.random() < dt * 0.8) {
        this.onSpawnHearts?.(this.position);
      }
    }

    // Baby growth
    if (this.isBaby) {
      this.growUpTimer -= dt;
      if (this.growUpTimer <= 0) {
        this.isBaby = false;
        this.group.scale.set(1, 1, 1);
        this.health = this.maxHealth;
      }
    }

    // 1. Hurt flash timer
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      const rVal = 0.8 + 0.2 * Math.sin(this.hurtTimer * 30);
      for (const mat of this.materials) {
        mat.color.setRGB(1.0, 1.0 - rVal, 1.0 - rVal);
      }
      if (this.hurtTimer <= 0) {
        for (const mat of this.materials) {
          mat.color.setRGB(1, 1, 1);
        }
      }
    }

    // 2. Ambient sound timer
    this.soundTimer -= dt;
    if (this.soundTimer <= 0) {
      const distSq = this.position.distanceToSquared(playerPos);
      if (distSq < 22 * 22) {
        this.playAmbientSound();
      }
      this.soundTimer = 5 + Math.random() * 12;
    }

    // 3. AI & Behavior
    const distToPlayer = this.position.distanceTo(playerPos);
    this.isMoving = false;

    if (this.type === MobType.IRON_GOLEM) {
      this.updateIronGolemAI(dt, allMobs);
    } else if (this.isHostile) {
      this.updateHostileAI(dt, distToPlayer, playerPos, onPlayerDamage, onExplosion);
    } else {
      this.updatePassiveAI(dt, distToPlayer, playerPos, allMobs, playerHeldItemId);
    }

    // 4. Physics & Ground/Water Movement
    this.updatePhysics(dt, world);

    // 5. Walking and limb animation
    this.updateAnimations(dt);

    // 6. Update mesh position and rotation
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;

    // 7. Head tracking player if nearby
    if (distToPlayer < 10) {
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const targetAngle = Math.atan2(dx, dz) + Math.PI;
      const relativeAngle = THREE.MathUtils.euclideanModulo(targetAngle - this.rotationY + Math.PI, Math.PI * 2) - Math.PI;
      this.headGroup.rotation.y = THREE.MathUtils.clamp(relativeAngle, -Math.PI / 3, Math.PI / 3);
    } else {
      this.headGroup.rotation.y *= 0.9;
    }
  }

  private updateIronGolemAI(dt: number, allMobs?: Mob[]) {
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    let nearestMonster: Mob | null = null;
    let nearestDist = 16.0;

    if (allMobs) {
      for (const m of allMobs) {
        if (!m.isAlive || m === this) continue;
        if (m.type === MobType.ZOMBIE || m.type === MobType.CREEPER || (m.type === MobType.ZOMBIE_PIGMAN && m.isAngry)) {
          const d = this.position.distanceTo(m.position);
          if (d < nearestDist) {
            nearestDist = d;
            nearestMonster = m;
          }
        }
      }
    }

    if (nearestMonster) {
      // March toward threatening monster
      const dx = nearestMonster.position.x - this.position.x;
      const dz = nearestMonster.position.z - this.position.z;
      const angle = Math.atan2(dx, dz);
      this.rotationY = angle + Math.PI;
      this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
      this.isMoving = true;
      this.velocity.x = this.wanderDir.x * 3.0;
      this.velocity.z = this.wanderDir.z * 3.0;

      // Strike target monster if within melee reach
      if (nearestDist < 2.4 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.2;
        this.sounds.playIronGolemAttack();
        const knockback = this.wanderDir.clone().setY(0.7).normalize();
        nearestMonster.takeDamage(12, knockback);
        nearestMonster.velocity.y = 8.0; // Mighty uppercut launch into sky!
        for (const arm of this.armMeshes) {
          arm.rotation.x = -Math.PI / 1.5;
        }
      }
    } else {
      // Peaceful village patrol
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.aiTimer = 4 + Math.random() * 6;
        if (Math.random() < 0.6) {
          const angle = Math.random() * Math.PI * 2;
          this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle));
          this.rotationY = angle + Math.PI;
        } else {
          this.wanderDir.set(0, 0, 0);
        }
      }
      if (this.wanderDir.lengthSq() > 0.01) {
        this.isMoving = true;
        this.velocity.x = this.wanderDir.x * 1.8;
        this.velocity.z = this.wanderDir.z * 1.8;
      } else {
        this.velocity.x *= 0.85;
        this.velocity.z *= 0.85;
      }
    }
  }

  private updatePassiveAI(
    dt: number,
    distToPlayer: number,
    playerPos: THREE.Vector3,
    allMobs?: Mob[],
    playerHeldItemId: number = 0
  ) {
    if (this.isFish) {
      this.isMoving = true;
      this.aiTimer -= dt;

      // 1. Fleeing players when approached (within 5.5 blocks)
      if (distToPlayer < 5.5) {
        this.panicTimer = 3.0;
        const awayX = this.position.x - playerPos.x;
        const awayZ = this.position.z - playerPos.z;
        const distXZ = Math.hypot(awayX, awayZ) || 1;
        this.wanderDir.set(awayX / distXZ, 0, awayZ / distXZ).normalize();
        this.rotationY = Math.atan2(awayX, awayZ) + Math.PI;
        const sprintSpeed = this.moveSpeed * 2.0;
        this.velocity.x = this.wanderDir.x * sprintSpeed;
        this.velocity.z = this.wanderDir.z * sprintSpeed;
        this.walkCycle += dt * 5.0;
        return;
      }

      if (this.panicTimer > 0) {
        this.panicTimer -= dt;
        const sprintSpeed = this.moveSpeed * 1.8;
        this.velocity.x = this.wanderDir.x * sprintSpeed;
        this.velocity.z = this.wanderDir.z * sprintSpeed;
        this.walkCycle += dt * 4.5;
        return;
      }

      this.walkCycle += dt * 2.5;

      // 2. Schooling in small groups (Boids: alignment, cohesion, separation)
      if (this.aiTimer <= 0) {
        this.aiTimer = 2.5 + Math.random() * 3.5;

        let schoolCount = 0;
        const avgSchoolDir = new THREE.Vector3();
        const centerSchoolPos = new THREE.Vector3();
        const separateDir = new THREE.Vector3();

        if (allMobs) {
          for (const other of allMobs) {
            if (other === this || !other.isAlive || !other.isFish) continue;
            const d = this.position.distanceTo(other.position);
            if (d < 6.5) {
              schoolCount++;
              avgSchoolDir.add(other.wanderDir);
              centerSchoolPos.add(other.position);
              if (d < 1.4 && d > 0.01) {
                separateDir.add(this.position.clone().sub(other.position).divideScalar(d));
              }
            }
          }
        }

        if (schoolCount > 0 && Math.random() < 0.75) {
          centerSchoolPos.divideScalar(schoolCount);
          const toCenter = centerSchoolPos.sub(this.position).setY(0).normalize();
          avgSchoolDir.divideScalar(schoolCount).setY(0).normalize();

          this.wanderDir.copy(avgSchoolDir).multiplyScalar(0.45)
            .addScaledVector(toCenter, 0.4);
          if (separateDir.lengthSq() > 0.01) {
            this.wanderDir.addScaledVector(separateDir.normalize(), 0.35);
          }
          this.wanderDir.normalize();
        } else {
          // Smooth swim wander
          const angle = Math.random() * Math.PI * 2;
          this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
        }
        this.rotationY = Math.atan2(this.wanderDir.x, this.wanderDir.z) + Math.PI;
      }

      this.velocity.x = this.wanderDir.x * this.moveSpeed;
      this.velocity.z = this.wanderDir.z * this.moveSpeed;
      return;
    }

    this.aiTimer -= dt;

    if (this.panicTimer > 0) {
      this.panicTimer -= dt;
      // Sprint away in panic
      this.isMoving = true;
      this.isLured = false;
      const dx = this.position.x - playerPos.x;
      const dz = this.position.z - playerPos.z;
      const angle = Math.atan2(dx, dz);
      this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
      this.rotationY = angle + Math.PI;
      const speed = this.moveSpeed * 2.2;
      this.velocity.x = this.wanderDir.x * speed;
      this.velocity.z = this.wanderDir.z * speed;
      return;
    }

    // Mob Food Luring: Cows follow Wheat, Chickens follow Wheat Seeds, Pigs follow Apples/Bread
    const isHoldingFood = playerHeldItemId ? this.isFavoredFood(playerHeldItemId) : false;
    if (isHoldingFood && distToPlayer <= 8.0) {
      this.isLured = true;
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const angle = Math.atan2(dx, dz);
      this.rotationY = angle + Math.PI;

      if (distToPlayer > 1.9) {
        // Follow player holding favored food
        this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
        this.isMoving = true;
        this.velocity.x = this.wanderDir.x * (this.moveSpeed * 1.25);
        this.velocity.z = this.wanderDir.z * (this.moveSpeed * 1.25);
      } else {
        // Close enough: stop and look up attentively at player
        this.wanderDir.set(0, 0, 0);
        this.velocity.x *= 0.6;
        this.velocity.z *= 0.6;
        this.isMoving = false;
      }
      return;
    }
    this.isLured = false;

    if (this.aiTimer <= 0) {
      this.aiTimer = 3 + Math.random() * 5;
      // Ambient vocal sounds when near player
      if (distToPlayer < 16 && Math.random() < 0.22) {
        if (this.type === MobType.COW) this.sounds.playCowMoo();
        else if (this.type === MobType.PIG) this.sounds.playPigOink();
        else if (this.type === MobType.SHEEP) this.sounds.playSheepBaa();
      }

      if (Math.random() < 0.6) {
        // Pick new wandering direction
        const angle = Math.random() * Math.PI * 2;
        this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle));
        this.rotationY = angle + Math.PI;
      } else {
        // Stand still and graze
        this.wanderDir.set(0, 0, 0);
      }
    }

    if (this.wanderDir.lengthSq() > 0.01) {
      this.isMoving = true;
      this.velocity.x = this.wanderDir.x * this.moveSpeed;
      this.velocity.z = this.wanderDir.z * this.moveSpeed;
    } else {
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
    }
  }

  private updateHostileAI(
    dt: number,
    distToPlayer: number,
    playerPos: THREE.Vector3,
    onPlayerDamage: (amt: number) => void,
    onExplosion: (pos: THREE.Vector3, radius: number) => void
  ) {
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    if (this.type === MobType.ZOMBIE) {
      // Occasional groaning when near player
      if (distToPlayer < 15 && Math.random() < 0.008) {
        this.sounds.playZombieGroan();
      }

      // Zombie chases player if within 18 blocks
      if (distToPlayer < 18) {
        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        const angle = Math.atan2(dx, dz);
        this.rotationY = angle + Math.PI;
        this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
        this.isMoving = true;

        this.velocity.x = this.wanderDir.x * this.moveSpeed;
        this.velocity.z = this.wanderDir.z * this.moveSpeed;

        // Melee attack player
        if (distToPlayer < 1.3 && this.attackCooldown <= 0) {
          this.attackCooldown = 1.2;
          onPlayerDamage(3);
        }
      } else {
        // Idle wander
        this.updatePassiveAI(dt, distToPlayer, playerPos);
      }
    } else if (this.type === MobType.CREEPER) {
      // Creeper stalks player, hisses, and detonates!
      if (distToPlayer < 16) {
        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        const angle = Math.atan2(dx, dz);
        this.rotationY = angle + Math.PI;

        if (distToPlayer < 3.2) {
          // In fuse range! Stop and hiss
          this.velocity.x = 0;
          this.velocity.z = 0;
          this.isMoving = false;

          if (!this.isHissing) {
            this.isHissing = true;
            this.sounds.playCreeperHiss();
          }

          this.creeperFuseTimer += dt;

          // Inflate & flash white during fuse
          const fuseRatio = this.creeperFuseTimer / 1.5;
          const flash = Math.floor(fuseRatio * 16) % 2 === 0;
          for (const mat of this.materials) {
            if (flash) {
              mat.color.setRGB(1.4, 1.4, 1.4);
            } else {
              mat.color.setRGB(1, 1, 1);
            }
          }
          const scaleVal = 1 + fuseRatio * 0.2;
          this.group.scale.set(scaleVal, scaleVal, scaleVal);

          // Detonate!
          if (this.creeperFuseTimer >= 1.5) {
            this.sounds.playExplosion();
            onExplosion(this.position.clone(), 3.5);
            if (distToPlayer < 5.0) {
              const damage = Math.round(18 * (1 - distToPlayer / 5.0));
              onPlayerDamage(damage);
            }
            this.die();
            return;
          }
        } else {
          // Out of detonation range, pursue
          if (this.isHissing) {
            // Player escaped, reset fuse
            this.isHissing = false;
            this.creeperFuseTimer = 0;
            this.group.scale.set(1, 1, 1);
            for (const mat of this.materials) {
              mat.color.setRGB(1, 1, 1);
            }
          }

          this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
          this.isMoving = true;
          this.velocity.x = this.wanderDir.x * this.moveSpeed;
          this.velocity.z = this.wanderDir.z * this.moveSpeed;
        }
      } else {
        this.updatePassiveAI(dt, distToPlayer, playerPos);
      }
    } else if (this.type === MobType.ZOMBIE_PIGMAN) {
      if (this.isAngry) {
        if (distToPlayer < 24) {
          const dx = playerPos.x - this.position.x;
          const dz = playerPos.z - this.position.z;
          const angle = Math.atan2(dx, dz);
          this.rotationY = angle + Math.PI;
          this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
          this.isMoving = true;

          this.velocity.x = this.wanderDir.x * this.moveSpeed;
          this.velocity.z = this.wanderDir.z * this.moveSpeed;

          // Melee strike with golden sword
          if (distToPlayer < 1.4 && this.attackCooldown <= 0) {
            this.attackCooldown = 0.9;
            this.sounds.playMobHit();
            onPlayerDamage(5);
          }
        } else {
          this.updatePassiveAI(dt, distToPlayer, playerPos);
        }
      } else {
        this.updatePassiveAI(dt, distToPlayer, playerPos);
      }
    } else if (this.type === MobType.GHAST) {
      // Ghast flight & artillery AI
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const dy = (playerPos.y + 7.5) - this.position.y;
      const angle = Math.atan2(dx, dz);
      this.rotationY = angle + Math.PI;

      // Hover spacing (14 - 28 blocks)
      if (distToPlayer < 14) {
        this.velocity.x = -Math.sin(angle) * 3.2;
        this.velocity.z = -Math.cos(angle) * 3.2;
      } else if (distToPlayer > 26) {
        this.velocity.x = Math.sin(angle) * 3.2;
        this.velocity.z = Math.cos(angle) * 3.2;
      } else {
        this.velocity.x *= 0.92;
        this.velocity.z *= 0.92;
      }
      this.velocity.y = THREE.MathUtils.clamp(dy * 0.4, -2.2, 2.2);

      // Charge attack
      if (distToPlayer < 36) {
        this.ghastAttackTimer += dt;
        if (this.ghastAttackTimer > 1.8 && !this.ghastCharging) {
          this.ghastCharging = true;
          if (this.ghastBodyMesh && this.ghastChargeMat) {
            this.ghastBodyMesh.material = this.ghastChargeMat;
          }
          this.sounds.playGhastShoot();
        }

        if (this.ghastAttackTimer >= 3.0) {
          this.ghastAttackTimer = 0;
          this.ghastCharging = false;
          if (this.ghastBodyMesh && this.ghastCalmMat) {
            this.ghastBodyMesh.material = this.ghastCalmMat;
          }
          const startPos = this.position.clone().add(new THREE.Vector3(0, 0.4, 0));
          const aimDir = playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)).sub(startPos).normalize();
          this.onSpawnFireball?.(startPos, aimDir);
        }
      } else {
        this.ghastAttackTimer = 0;
        if (this.ghastCharging) {
          this.ghastCharging = false;
          if (this.ghastBodyMesh && this.ghastCalmMat) {
            this.ghastBodyMesh.material = this.ghastCalmMat;
          }
        }
      }
    } else if (this.type === MobType.BLAZE) {
      // Blaze hovering AI
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const angle = Math.atan2(dx, dz);
      this.rotationY = angle + Math.PI;

      if (distToPlayer < 20) {
        this.isMoving = true;
        this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
        this.velocity.x = this.wanderDir.x * this.moveSpeed;
        this.velocity.z = this.wanderDir.z * this.moveSpeed;

        this.attackCooldown -= dt;
        if (this.attackCooldown <= 0) {
          this.attackCooldown = 2.4;
          this.sounds.playBlazeShoot();
          const startPos = this.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          const aimDir = playerPos.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(startPos).normalize();
          this.onSpawnFireball?.(startPos, aimDir);
        }
      } else {
        this.updatePassiveAI(dt, distToPlayer, playerPos);
      }
    }
  }

  private updatePhysics(dt: number, world: World) {
    if (this.type === MobType.GHAST) {
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.z += this.velocity.z * dt;
      return;
    }
    if (this.type === MobType.BLAZE) {
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.z += this.velocity.z * dt;
      const footY = Math.floor(this.position.y);
      if (world.getBlock(Math.floor(this.position.x), footY, Math.floor(this.position.z)) !== Block.AIR) {
        this.position.y = footY + 1.6;
      }
      return;
    }

    // Fish specialized aquatic swimming physics
    if (this.isFish) {
      const bx = Math.floor(this.position.x);
      const by = Math.floor(this.position.y);
      const bz = Math.floor(this.position.z);
      const inWater = world.getBlock(bx, by, bz) === Block.WATER || world.getBlock(bx, by + 1, bz) === Block.WATER;

      if (inWater) {
        this.group.rotation.z = 0;
        this.velocity.y = Math.sin(this.walkCycle * 2) * 0.22;
        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;
        this.position.z += this.velocity.z * dt;

        // Steer away from solid obstacles
        const lookAheadX = Math.floor(this.position.x + (this.velocity.x > 0 ? 0.6 : -0.6));
        const lookAheadZ = Math.floor(this.position.z + (this.velocity.z > 0 ? 0.6 : -0.6));
        const forwardBlock = world.getBlock(lookAheadX, by, lookAheadZ);
        if (forwardBlock !== Block.WATER && forwardBlock !== Block.AIR) {
          this.wanderDir.negate();
          this.rotationY += Math.PI;
        }
        // Avoid jumping above surface
        if (world.getBlock(bx, by + 1, bz) === Block.AIR && this.position.y > by + 0.6) {
          this.velocity.y = -0.5;
        }
      } else {
        // Flop on dry land
        this.velocity.y -= 18.0 * dt;
        this.position.y += this.velocity.y * dt;
        const groundY = typeof world.getSafeSpawnHeight === 'function' ? world.getSafeSpawnHeight(bx, bz) : 4;
        if (this.position.y <= groundY) {
          this.position.y = groundY;
          this.velocity.y = 2.2 * Math.random();
          this.group.rotation.z = Math.PI / 2;
        }
      }
      return;
    }

    // Water check
    const blockAtPos = world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y),
      Math.floor(this.position.z)
    );
    this.inWater = blockAtPos === Block.WATER;

    if (this.inWater) {
      // Buoyancy in water
      this.velocity.y = Math.min(this.velocity.y + 14.0 * dt, 1.8);
      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;

      // Water current flow push on mobs
      if (world.fluidSimulator) {
        const flow = world.fluidSimulator.getFlowVector(this.position.x, this.position.y + 0.3, this.position.z);
        if (flow.lengthSq() > 0.001) {
          this.velocity.x += flow.x * 2.2 * dt;
          this.velocity.z += flow.z * 2.2 * dt;
          if (flow.y < 0) {
            this.velocity.y += flow.y * 2.8 * dt;
          }
        }
      }
    } else {
      // Normal Gravity
      this.velocity.y -= 18.0 * dt;
    }

    // Auto step-climbing (jump up 1-block steps smoothly like Minecraft mobs)
    if (this.isMoving && this.onGround && !this.inWater) {
      const stepX = this.position.x + (this.velocity.x > 0 ? 0.4 : -0.4);
      const stepZ = this.position.z + (this.velocity.z > 0 ? 0.4 : -0.4);
      const obstacleBlock = world.getBlock(Math.floor(stepX), Math.floor(this.position.y), Math.floor(stepZ));
      const overheadBlock = world.getBlock(Math.floor(stepX), Math.floor(this.position.y + 1.2), Math.floor(stepZ));

      if (obstacleBlock !== Block.AIR && obstacleBlock !== Block.WATER && BLOCK_DEFS[obstacleBlock]?.solid) {
        if (overheadBlock === Block.AIR || overheadBlock === Block.WATER || !BLOCK_DEFS[overheadBlock]?.solid) {
          this.velocity.y = 5.2; // Jump step!
          this.onGround = false;
        }
      }
    }

    // Move
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Ground block collision
    const footY = Math.floor(this.position.y);
    const groundBlock = world.getBlock(
      Math.floor(this.position.x),
      footY,
      Math.floor(this.position.z)
    );

    if (groundBlock !== Block.AIR && groundBlock !== Block.WATER && BLOCK_DEFS[groundBlock]?.solid) {
      this.position.y = footY + 1;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Drag
    if (this.onGround) {
      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;
    }
  }

  private updateAnimations(dt: number) {
    if (this.isMoving || (!this.onGround && !this.inWater)) {
      this.walkCycle += dt * 8.0;
    } else {
      this.walkCycle = 0;
    }

    const swing = Math.sin(this.walkCycle) * 0.55;

    // Four-legged mobs (Cow, Pig, Sheep, Creeper)
    if (this.legMeshes.length === 4) {
      this.legMeshes[0].rotation.x = swing;
      this.legMeshes[1].rotation.x = -swing;
      this.legMeshes[2].rotation.x = -swing;
      this.legMeshes[3].rotation.x = swing;
    } else if (this.legMeshes.length === 2) {
      // Two-legged mobs (Villager, Zombie, Chicken)
      this.legMeshes[0].rotation.x = swing;
      this.legMeshes[1].rotation.x = -swing;
    }

    // Chicken wing flap
    if (this.type === MobType.CHICKEN && this.armMeshes.length === 2) {
      const flap = Math.sin(this.walkCycle * 2) * 0.45;
      this.armMeshes[0].rotation.z = -flap;
      this.armMeshes[1].rotation.z = flap;
    }

    // Iron Golem heavy arm swinging
    if (this.type === MobType.IRON_GOLEM && this.armMeshes.length === 2 && this.attackCooldown <= 0.6) {
      this.armMeshes[0].rotation.x = -swing * 0.7;
      this.armMeshes[1].rotation.x = swing * 0.7;
    }

    // Ghast tentacles swaying in sine waves
    if (this.type === MobType.GHAST && this.tentacleMeshes.length > 0) {
      const time = performance.now() * 0.0025;
      for (let i = 0; i < this.tentacleMeshes.length; i++) {
        this.tentacleMeshes[i].rotation.x = Math.sin(time + i * 0.7) * 0.35;
        this.tentacleMeshes[i].rotation.z = Math.cos(time + i * 0.5) * 0.25;
      }
    }

    // Fish tail fin and pectoral fin swimming oscillation
    if (this.isFish) {
      const swimRate = this.panicTimer > 0 ? 14 : 7;
      const amp = this.panicTimer > 0 ? 0.6 : 0.42;
      if (this.fishTailMesh) {
        this.fishTailMesh.rotation.y = Math.sin(this.walkCycle * swimRate) * amp;
      }
      if (this.fishFinMeshL && this.fishFinMeshR) {
        this.fishFinMeshL.rotation.z = Math.sin(this.walkCycle * 6) * 0.3;
        this.fishFinMeshR.rotation.z = -Math.sin(this.walkCycle * 6) * 0.3;
      }
      this.group.rotation.x = THREE.MathUtils.clamp(-this.velocity.y * 0.6, -0.4, 0.4);
    }

    // Blaze orbiting fire rods in 3 tiers
    if (this.type === MobType.BLAZE && this.blazeRods.length === 12) {
      const time = performance.now() * 0.003;
      for (let i = 0; i < 4; i++) {
        const theta = time * 2.2 + (i * Math.PI) / 2;
        this.blazeRods[i].position.set(Math.cos(theta) * 0.48, 0.45 + Math.sin(time * 3 + i) * 0.06, Math.sin(theta) * 0.48);
        this.blazeRods[i].rotation.y = -theta;
      }
      for (let i = 4; i < 8; i++) {
        const theta = -time * 1.8 + ((i - 4) * Math.PI) / 2;
        this.blazeRods[i].position.set(Math.cos(theta) * 0.58, 0.0 + Math.sin(time * 3 + i) * 0.06, Math.sin(theta) * 0.58);
        this.blazeRods[i].rotation.y = -theta;
      }
      for (let i = 8; i < 12; i++) {
        const theta = time * 2.0 + ((i - 8) * Math.PI) / 2;
        this.blazeRods[i].position.set(Math.cos(theta) * 0.46, -0.45 + Math.sin(time * 3 + i) * 0.06, Math.sin(theta) * 0.46);
        this.blazeRods[i].rotation.y = -theta;
      }
    }
  }

  public dispose() {
    this.scene.remove(this.group);
    for (const mat of this.materials) {
      mat.dispose();
    }
  }
}
