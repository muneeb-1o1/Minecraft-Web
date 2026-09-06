import { Player } from '../player/Player';
import { World } from '../world/World';

export class DebugScreen {
  public player: Player;
  public world: World;
  public isVisible: boolean = false;

  private debugContainer: HTMLElement;
  private leftEl: HTMLElement;
  private rightEl: HTMLElement;

  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private fps: number = 60;

  public preset: string = '1080p';
  public renderScale: number = 1.0;
  public bufferWidth: number = 1920;
  public bufferHeight: number = 1080;

  constructor(player: Player, world: World) {
    this.player = player;
    this.world = world;

    this.debugContainer = document.getElementById('debug-screen')!;
    this.leftEl = document.getElementById('debug-info-left')!;
    this.rightEl = document.getElementById('debug-info-right')!;
  }

  public setResolutionInfo(preset: string, scale: number, width: number, height: number) {
    this.preset = preset;
    this.renderScale = scale;
    this.bufferWidth = width;
    this.bufferHeight = height;
  }

  public toggle() {
    this.isVisible = !this.isVisible;
    if (this.isVisible) {
      this.debugContainer.classList.remove('hidden');
    } else {
      this.debugContainer.classList.add('hidden');
    }
  }

  public update(now: number) {
    if (!this.isVisible) return;

    // Calculate FPS
    this.frameCount++;
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    const pos = this.player.position;
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);

    const { cx, cz, lx, lz } = this.world.worldToChunkCoords(bx, bz);
    const biome = this.world.generator.getBiome(bx, bz);

    // Calculate facing direction based on yaw
    // Normalize yaw to [0, 2*PI]
    let normalizedYaw = this.player.yaw % (Math.PI * 2);
    if (normalizedYaw < 0) normalizedYaw += Math.PI * 2;

    let facing = 'south (towards +Z)';
    if (normalizedYaw >= Math.PI * 0.25 && normalizedYaw < Math.PI * 0.75) {
      facing = 'west (towards -X)';
    } else if (normalizedYaw >= Math.PI * 0.75 && normalizedYaw < Math.PI * 1.25) {
      facing = 'north (towards -Z)';
    } else if (normalizedYaw >= Math.PI * 1.25 && normalizedYaw < Math.PI * 1.75) {
      facing = 'east (towards +X)';
    }

    const dprNum = window.devicePixelRatio || 1;
    const dpr = dprNum.toFixed(2);
    const physW = Math.round(window.innerWidth * dprNum);
    const physH = Math.round(window.innerHeight * dprNum);

    // Left info panel
    this.leftEl.innerHTML = `
      <strong>Minecraft Web Edition 1.20</strong><br>
      ${this.fps} fps, vsync on<br>
      <br>
      XYZ: ${pos.x.toFixed(3)} / ${pos.y.toFixed(5)} / ${pos.z.toFixed(3)}<br>
      Block: ${bx} ${by} ${bz}<br>
      Chunk: ${lx} ${by} ${lz} in ${cx} 0 ${cz}<br>
      Facing: ${facing}<br>
      Biome: ${biome}<br>
      Light: 15 (15 sky, 0 block)
    `;

    const screenPhysW = Math.round(window.screen.width * dprNum);
    const screenPhysH = Math.round(window.screen.height * dprNum);

    // Right info panel
    this.rightEl.innerHTML = `
      Display: ${screenPhysW}x${screenPhysH} (${window.screen.width}x${window.screen.height} @ ${dpr}x DPR)<br>
      Window: ${window.innerWidth}x${window.innerHeight} (${physW}x${physH} Px)<br>
      Render Buffer: ${this.bufferWidth}x${this.bufferHeight} (${this.preset.toUpperCase()} @ ${Math.round(this.renderScale * 100)}%)<br>
      Renderer: WebGL (Three.js)<br>
      Dimension: ${this.world.currentDimension.toUpperCase()}<br>
      Camera: ${this.player.perspective === 0 ? 'FIRST_PERSON' : (this.player.perspective === 1 ? 'THIRD_PERSON_BACK' : (this.player.perspective === 2 ? 'THIRD_PERSON_FRONT' : 'THIRD_PERSON_ISOMETRIC'))}<br>
      Loaded Chunks: ${this.world.chunks.size}<br>
      Render Distance: ${this.world.renderDistance} chunks<br>
      Gamemode: ${this.player.gameMode.toUpperCase()}
    `;
  }
}
