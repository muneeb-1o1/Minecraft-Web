import { SoundManager } from '../audio/SoundManager';

export interface WorldSaveMetadata {
  id: string;
  name: string;
  seed: number;
  gameMode: 'survival' | 'creative';
  worldType: 'default' | 'flat' | 'amplified';
  lastPlayed: number;
}

export class MainMenu {
  public sounds: SoundManager;

  private titleScreenEl: HTMLElement;
  private splashTextEl: HTMLElement;

  private worldSelectScreenEl: HTMLElement;
  private worldListEl: HTMLElement;
  private createWorldScreenEl: HTMLElement;
  private optionsScreenEl: HTMLElement;
  private controlsScreenEl: HTMLElement;
  private howToPlayScreenEl: HTMLElement;
  private loadingScreenEl: HTMLElement;
  private loadingBarFill: HTMLElement;
  private loadingStatus: HTMLElement;

  private selectedWorldId: string | null = null;
  public onStartWorld?: (meta: WorldSaveMetadata) => void;

  private splashes = [
    '100% Pure WebGL!',
    'Also try Terraria!',
    'Don\'t dig straight down!',
    'Creeper? Aw man!',
    'Voxel paradise!',
    'Made with Three.js!',
    'Procedural worlds!',
    'Smooth 60 FPS!',
    'Mining and crafting!'
  ];

  constructor(sounds: SoundManager) {
    this.sounds = sounds;

    this.titleScreenEl = document.getElementById('title-screen')!;
    this.splashTextEl = document.getElementById('splash-text')!;
    this.worldSelectScreenEl = document.getElementById('world-select-screen')!;
    this.worldListEl = document.getElementById('world-list')!;
    this.createWorldScreenEl = document.getElementById('create-world-screen')!;
    this.optionsScreenEl = document.getElementById('options-screen')!;
    this.controlsScreenEl = document.getElementById('controls-screen')!;
    this.howToPlayScreenEl = document.getElementById('how-to-play-screen')!;
    this.loadingScreenEl = document.getElementById('loading-screen')!;
    this.loadingBarFill = document.getElementById('loading-bar-fill')!;
    this.loadingStatus = document.getElementById('loading-status')!;

    this.initSplashText();
    this.initButtons();
  }

  private initSplashText() {
    const splash = this.splashes[Math.floor(Math.random() * this.splashes.length)];
    this.splashTextEl.textContent = splash;
  }

  private initButtons() {
    // 1. Singleplayer
    document.getElementById('singleplayer-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.openWorldSelect();
    });

    // 2. Options
    document.getElementById('title-options-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.optionsScreenEl.classList.remove('hidden');
    });

    // 3. Controls
    document.getElementById('title-controls-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.controlsScreenEl.classList.remove('hidden');
    });

    // 4. How To Play
    document.getElementById('instructions-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.howToPlayScreenEl.classList.remove('hidden');
    });

    document.getElementById('close-how-to-play-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.howToPlayScreenEl.classList.add('hidden');
    });

    // Options Done
    document.getElementById('options-done-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.optionsScreenEl.classList.add('hidden');
    });

    // Controls Done
    document.getElementById('controls-done-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.controlsScreenEl.classList.add('hidden');
    });

    // World Select Buttons
    document.getElementById('create-new-world-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.worldSelectScreenEl.classList.add('hidden');
      this.createWorldScreenEl.classList.remove('hidden');
    });

    document.getElementById('cancel-world-select-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.worldSelectScreenEl.classList.add('hidden');
      this.titleScreenEl.classList.remove('hidden');
    });

    document.getElementById('play-selected-world-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      if (this.selectedWorldId) {
        const worlds = this.loadWorldsFromStorage();
        const world = worlds.find(w => w.id === this.selectedWorldId);
        if (world) {
          this.worldSelectScreenEl.classList.add('hidden');
          this.launchWorld(world);
        }
      }
    });

    // Create World Screen
    let createGamemode: 'survival' | 'creative' = 'survival';
    let createWorldType: 'default' | 'flat' | 'amplified' = 'default';

    const gmBtn = document.getElementById('gamemode-toggle-btn');
    const gmHint = document.getElementById('gamemode-hint');
    gmBtn?.addEventListener('click', () => {
      this.sounds.playClick();
      if (createGamemode === 'survival') {
        createGamemode = 'creative';
        gmBtn.textContent = 'Game Mode: Creative';
        if (gmHint) gmHint.textContent = 'Unlimited resources, free flying, and destroy blocks instantly.';
      } else {
        createGamemode = 'survival';
        gmBtn.textContent = 'Game Mode: Survival';
        if (gmHint) gmHint.textContent = 'Search for resources, craft, gain levels, health and hunger.';
      }
    });

    const wtBtn = document.getElementById('worldtype-toggle-btn');
    wtBtn?.addEventListener('click', () => {
      this.sounds.playClick();
      if (createWorldType === 'default') {
        createWorldType = 'flat';
        wtBtn.textContent = 'World Type: Superflat';
      } else if (createWorldType === 'flat') {
        createWorldType = 'amplified';
        wtBtn.textContent = 'World Type: Amplified';
      } else {
        createWorldType = 'default';
        wtBtn.textContent = 'World Type: Default';
      }
    });

    document.getElementById('cancel-create-world-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.createWorldScreenEl.classList.add('hidden');
      this.worldSelectScreenEl.classList.remove('hidden');
    });

    document.getElementById('confirm-create-world-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      const nameInput = document.getElementById('new-world-name') as HTMLInputElement;
      const seedInput = document.getElementById('new-world-seed') as HTMLInputElement;

      const worldName = nameInput.value.trim() || 'New World';
      let seed = Math.floor(Math.random() * 1000000);
      if (seedInput.value.trim()) {
        const parsed = parseInt(seedInput.value.trim(), 10);
        if (!isNaN(parsed)) seed = parsed;
        else {
          // Hash string to number
          let h = 0;
          for (let i = 0; i < seedInput.value.length; i++) {
            h = (h << 5) - h + seedInput.value.charCodeAt(i);
            h |= 0;
          }
          seed = Math.abs(h);
        }
      }

      const meta: WorldSaveMetadata = {
        id: `world_${Date.now()}`,
        name: worldName,
        seed,
        gameMode: createGamemode,
        worldType: createWorldType,
        lastPlayed: Date.now()
      };

      this.saveWorldToStorage(meta);
      this.createWorldScreenEl.classList.add('hidden');
      this.launchWorld(meta);
    });
  }

  public openWorldSelect() {
    this.titleScreenEl.classList.add('hidden');
    this.worldSelectScreenEl.classList.remove('hidden');
    this.renderWorldList();
  }

  private renderWorldList() {
    const worlds = this.loadWorldsFromStorage();
    this.worldListEl.innerHTML = '';

    const playBtn = document.getElementById('play-selected-world-btn') as HTMLButtonElement;
    if (playBtn) playBtn.disabled = true;
    this.selectedWorldId = null;

    if (worlds.length === 0) {
      this.worldListEl.innerHTML = '<div style="color: #888; padding: 12px; text-align: center;">No worlds found. Create one!</div>';
      return;
    }

    worlds.forEach(w => {
      const item = document.createElement('div');
      item.className = 'world-item';
      item.innerHTML = `
        <div>
          <div style="font-weight: bold; color: #fff;">${w.name}</div>
          <div style="font-size: 10px; color: #aaa;">${w.gameMode.toUpperCase()} &bull; Seed: ${w.seed}</div>
        </div>
        <div style="font-size: 10px; color: #888;">${new Date(w.lastPlayed).toLocaleDateString()}</div>
      `;

      item.addEventListener('click', () => {
        this.sounds.playClick();
        this.worldListEl.querySelectorAll('.world-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        this.selectedWorldId = w.id;
        if (playBtn) playBtn.disabled = false;
      });

      this.worldListEl.appendChild(item);
    });
  }

  private loadWorldsFromStorage(): WorldSaveMetadata[] {
    try {
      const data = localStorage.getItem('minecraft_worlds');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveWorldToStorage(meta: WorldSaveMetadata) {
    const worlds = this.loadWorldsFromStorage();
    const existingIdx = worlds.findIndex(w => w.id === meta.id);
    if (existingIdx >= 0) {
      worlds[existingIdx] = meta;
    } else {
      worlds.unshift(meta);
    }
    localStorage.setItem('minecraft_worlds', JSON.stringify(worlds));
  }

  public launchWorld(meta: WorldSaveMetadata) {
    // Hide Title Screen
    this.titleScreenEl.classList.add('hidden');
    this.loadingScreenEl.classList.remove('hidden');

    this.loadingBarFill.style.width = '30%';
    this.loadingStatus.textContent = 'Generating Terrain...';

    setTimeout(() => {
      this.loadingBarFill.style.width = '75%';
      this.loadingStatus.textContent = 'Building World Chunks...';

      setTimeout(() => {
        this.loadingBarFill.style.width = '100%';
        this.loadingStatus.textContent = 'Spawning Player...';

        setTimeout(() => {
          this.loadingScreenEl.classList.add('hidden');
          this.onStartWorld?.(meta);
        }, 300);
      }, 350);
    }, 300);
  }

  public showTitleScreen() {
    this.titleScreenEl.classList.remove('hidden');
  }

  public hideTitleScreen() {
    this.titleScreenEl.classList.add('hidden');
  }
}
