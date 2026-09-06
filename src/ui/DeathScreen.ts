import { SoundManager } from '../audio/SoundManager';

export class DeathScreen {
  private element: HTMLElement | null = null;
  private scoreEl: HTMLElement | null = null;
  private respawnBtn: HTMLButtonElement | null = null;
  private titleBtn: HTMLButtonElement | null = null;
  private sounds: SoundManager;

  public isOpen: boolean = false;
  public onRespawn?: () => void;
  public onQuitToTitle?: () => void;

  constructor(sounds: SoundManager) {
    this.sounds = sounds;
    this.initDOM();
  }

  private initDOM() {
    this.element = document.getElementById('death-screen');
    this.scoreEl = document.getElementById('death-score');
    this.respawnBtn = document.getElementById('respawn-btn') as HTMLButtonElement;
    this.titleBtn = document.getElementById('death-title-btn') as HTMLButtonElement;

    this.respawnBtn?.addEventListener('click', () => {
      this.sounds.playClick();
      this.hide();
      this.onRespawn?.();
    });

    this.titleBtn?.addEventListener('click', () => {
      this.sounds.playClick();
      this.hide();
      this.onQuitToTitle?.();
    });
  }

  public show(score: number) {
    if (!this.element) this.initDOM();
    if (this.scoreEl) {
      this.scoreEl.textContent = `Score: ${score}`;
    }
    if (this.element) {
      this.element.classList.remove('hidden');
    }
    this.isOpen = true;
  }

  public hide() {
    if (this.element) {
      this.element.classList.add('hidden');
    }
    this.isOpen = false;
  }
}
