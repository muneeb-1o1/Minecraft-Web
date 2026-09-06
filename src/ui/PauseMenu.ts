import { Player } from '../player/Player';
import { SoundManager } from '../audio/SoundManager';

export class PauseMenu {
  public player: Player;
  public sounds: SoundManager;
  public isPaused: boolean = false;

  private pauseMenuEl: HTMLElement;
  private gamemodeBtn: HTMLElement;

  public onResume?: () => void;
  public onQuitToTitle?: () => void;

  constructor(player: Player, sounds: SoundManager) {
    this.player = player;
    this.sounds = sounds;

    this.pauseMenuEl = document.getElementById('pause-menu')!;
    this.gamemodeBtn = document.getElementById('switch-gamemode-btn')!;

    this.initButtons();
  }

  private initButtons() {
    // Clicking menu backdrop resumes immediately
    this.pauseMenuEl.addEventListener('click', (e) => {
      if (e.target === this.pauseMenuEl) {
        this.resume();
      }
    });

    // Back to Game
    document.getElementById('resume-game-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.resume();
    });

    // Options in pause
    document.getElementById('options-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      document.getElementById('options-screen')?.classList.remove('hidden');
    });

    // Controls in pause
    document.getElementById('controls-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      document.getElementById('controls-screen')?.classList.remove('hidden');
    });

    // Switch gamemode
    this.gamemodeBtn.addEventListener('click', () => {
      this.sounds.playClick();
      if (this.player.gameMode === 'survival') {
        this.player.gameMode = 'creative';
        this.player.isFlying = true;
        this.gamemodeBtn.textContent = 'Gamemode: Creative';
      } else {
        this.player.gameMode = 'survival';
        this.player.isFlying = false;
        this.gamemodeBtn.textContent = 'Gamemode: Survival';
      }
    });

    // Save and Quit
    document.getElementById('save-quit-btn')?.addEventListener('click', () => {
      this.sounds.playClick();
      this.close();
      this.onQuitToTitle?.();
    });
  }

  public open() {
    this.isPaused = true;
    this.player.controls.unlockPointer();
    this.gamemodeBtn.textContent = `Gamemode: ${this.player.gameMode.toUpperCase()}`;
    this.pauseMenuEl.classList.remove('hidden');
  }

  public close() {
    this.isPaused = false;
    this.pauseMenuEl.classList.add('hidden');
  }

  public resume() {
    this.close();
    this.player.controls.lockPointer();
    this.onResume?.();
  }

  public toggle() {
    if (this.isPaused) {
      this.resume();
    } else {
      this.open();
    }
  }
}
