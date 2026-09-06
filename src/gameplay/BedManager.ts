import * as THREE from 'three';
import { Player } from '../player/Player';
import { DayNightCycle } from './DayNightCycle';
import { SoundManager } from '../audio/SoundManager';
import { Chat } from './Chat';
import { AdvancementManager } from './Advancements';

export class BedManager {
  public player: Player;
  public dayNightCycle: DayNightCycle;
  public sounds: SoundManager;
  public chat?: Chat;
  public advancements?: AdvancementManager;

  public isSleeping: boolean = false;
  private sleepTimer: number = 0;
  private bedPosition: THREE.Vector3 | null = null;
  private sleepOverlay: HTMLElement | null = null;

  constructor(player: Player, dayNightCycle: DayNightCycle, sounds: SoundManager, chat?: Chat) {
    this.player = player;
    this.dayNightCycle = dayNightCycle;
    this.sounds = sounds;
    this.chat = chat;

    this.initOverlay();
  }

  private initOverlay() {
    let overlay = document.getElementById('sleep-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sleep-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.backgroundColor = '#000000';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      overlay.style.transition = 'opacity 1.2s ease-in-out';
      overlay.style.zIndex = '900';
      document.body.appendChild(overlay);
    }
    this.sleepOverlay = overlay;
  }

  // Attempt to sleep in bed at coordinates
  public trySleep(pos: THREE.Vector3): boolean {
    if (this.isSleeping) return false;

    const currentTime = this.dayNightCycle.getTime();
    // In Minecraft, night is between 12541 and 23458 ticks
    const isNight = currentTime >= 12500 || currentTime < 1000;

    if (!isNight) {
      this.chat?.addMessage('§cYou can only sleep at night or during thunderstorms');
      this.sounds.playClick();
      return false;
    }

    // Begin sleeping sequence
    this.isSleeping = true;
    this.sleepTimer = 0;
    this.bedPosition = pos.clone();

    // Set player spawn to bed
    this.player.setPosition(pos.x + 0.5, pos.y + 1.0, pos.z + 0.5);

    if (this.sleepOverlay) {
      this.sleepOverlay.style.opacity = '1';
    }

    this.chat?.addMessage('§eEntering bed... Good night!');
    return true;
  }

  public update(dt: number) {
    if (!this.isSleeping) return;

    this.sleepTimer += dt;

    // After 1.4s of black screen, advance time to 1000 (Sunrise)
    if (this.sleepTimer >= 1.4 && this.sleepTimer - dt < 1.4) {
      this.dayNightCycle.setTime(1000);
      // Restore health
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 4);
      this.advancements?.award('sweet_dreams');
    }

    // Wake up after 2.8s
    if (this.sleepTimer >= 2.8) {
      this.wakeUp();
    }
  }

  public wakeUp() {
    if (!this.isSleeping) return;
    this.isSleeping = false;
    this.sleepTimer = 0;

    if (this.sleepOverlay) {
      this.sleepOverlay.style.opacity = '0';
    }

    this.sounds.playLevelUp();
    this.chat?.addMessage('§aGood morning! You feel refreshed and energized.');
  }
}
