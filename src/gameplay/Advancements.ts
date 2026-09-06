import { SoundManager } from '../audio/SoundManager';

export interface AdvancementDef {
  id: string;
  title: string;
  description: string;
  iconChar: string;
  iconBg: string;
}

export const ADVANCEMENTS: Record<string, AdvancementDef> = {
  taking_inventory: {
    id: 'taking_inventory',
    title: 'Taking Inventory',
    description: 'Press \'E\' to open your inventory',
    iconChar: '📦',
    iconBg: '#5a3d28'
  },
  getting_wood: {
    id: 'getting_wood',
    title: 'Getting Wood',
    description: 'Punch a tree until a block of wood pops out',
    iconChar: '🪵',
    iconBg: '#6b5335'
  },
  benchmarking: {
    id: 'benchmarking',
    title: 'Benchmarking',
    description: 'Craft a crafting table with four wooden planks',
    iconChar: '🔨',
    iconBg: '#bc9862'
  },
  time_to_mine: {
    id: 'time_to_mine',
    title: 'Time to Mine!',
    description: 'Use planks and sticks to make a pickaxe',
    iconChar: '⛏️',
    iconBg: '#757575'
  },
  hot_topic: {
    id: 'hot_topic',
    title: 'Hot Topic',
    description: 'Construct or examine a cobblestone furnace',
    iconChar: '🔥',
    iconBg: '#444444'
  },
  acquire_hardware: {
    id: 'acquire_hardware',
    title: 'Acquire Hardware',
    description: 'Smelt or collect an iron ingot',
    iconChar: '🛡️',
    iconBg: '#dcdcdc'
  },
  time_to_strike: {
    id: 'time_to_strike',
    title: 'Time to Strike!',
    description: 'Craft a sturdy sword to defend yourself',
    iconChar: '🗡️',
    iconBg: '#3a7d44'
  },
  into_the_nether: {
    id: 'into_the_nether',
    title: 'We Need to Go Deeper',
    description: 'Build, ignite, and enter an obsidian Nether portal',
    iconChar: '🔮',
    iconBg: '#4b1e5f'
  },
  monster_hunter: {
    id: 'monster_hunter',
    title: 'Monster Hunter',
    description: 'Attack and defeat a dangerous underground creature',
    iconChar: '💀',
    iconBg: '#2d4a22'
  },
  what_a_deal: {
    id: 'what_a_deal',
    title: 'What a Deal!',
    description: 'Successfully barter emeralds with a village merchant',
    iconChar: '💎',
    iconBg: '#1f7a46'
  },
  aqua_voyager: {
    id: 'aqua_voyager',
    title: 'Deep Sea Voyager',
    description: 'Explore vibrant ocean coral reefs and swim with fish',
    iconChar: '🐠',
    iconBg: '#1b4d89'
  },
  sweet_dreams: {
    id: 'sweet_dreams',
    title: 'Sweet Dreams',
    description: 'Sleep in a comfortable bed to pass the night safely',
    iconChar: '🛏️',
    iconBg: '#a82c2c'
  },
  the_parrots_and_the_bats: {
    id: 'the_parrots_and_the_bats',
    title: 'The Parrots and the Bats',
    description: 'Breed two animals together with their favored food',
    iconChar: '❤️',
    iconBg: '#c2185b'
  }
};

export class AdvancementManager {
  private completed: Set<string> = new Set();
  private sounds: SoundManager;
  private container: HTMLElement | null = null;
  private toastTimer: number | null = null;

  constructor(sounds: SoundManager) {
    this.sounds = sounds;
    this.initDOM();
  }

  private initDOM() {
    let el = document.getElementById('advancement-toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'advancement-toast-container';
      document.body.appendChild(el);
    }
    this.container = el;
  }

  public hasAdvancement(id: string): boolean {
    return this.completed.has(id);
  }

  public award(id: string) {
    if (this.completed.has(id)) return;
    const def = ADVANCEMENTS[id];
    if (!def) return;

    this.completed.add(id);
    this.sounds.playLevelUp();
    this.showToast(def);
  }

  private showToast(def: AdvancementDef) {
    if (!this.container) this.initDOM();
    if (!this.container) return;

    // Clear any existing toast
    this.container.innerHTML = '';
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    const toast = document.createElement('div');
    toast.className = 'advancement-toast';
    toast.innerHTML = `
      <div class="adv-icon" style="background: ${def.iconBg};">${def.iconChar}</div>
      <div class="adv-content">
        <div class="adv-header">Advancement Made!</div>
        <div class="adv-title">${def.title}</div>
        <div class="adv-desc">${def.description}</div>
      </div>
    `;

    this.container.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => {
        if (toast.parentElement === this.container) {
          this.container?.removeChild(toast);
        }
      }, 400);
    }, 4800);
  }

  public reset() {
    this.completed.clear();
  }
}
