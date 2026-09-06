import { Player } from '../player/Player';
import { Inventory } from './Inventory';
import { DayNightCycle } from './DayNightCycle';
import { Block, ItemId, getItemName } from '../world/BlockTypes';
import { WeatherSystem } from './WeatherSystem';

export class Chat {
  public player: Player;
  public inventory: Inventory;
  public dayNight: DayNightCycle;
  public weatherSystem?: WeatherSystem;

  private containerEl: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLInputElement;
  public isOpen: boolean = false;

  constructor(player: Player, inventory: Inventory, dayNight: DayNightCycle) {
    this.player = player;
    this.inventory = inventory;
    this.dayNight = dayNight;

    this.containerEl = document.getElementById('chat-container')!;
    this.messagesEl = document.getElementById('chat-messages')!;
    this.inputEl = document.getElementById('chat-input') as HTMLInputElement;

    this.initEvents();
  }

  private initEvents() {
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = this.inputEl.value.trim();
        if (text) {
          if (text.startsWith('/')) {
            this.handleCommand(text);
          } else {
            this.addMessage(`<Player> ${text}`);
          }
        }
        this.close();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  public open(startWithSlash: boolean = false) {
    this.isOpen = true;
    this.player.controls.unlockPointer();
    this.containerEl.classList.remove('hidden');
    this.inputEl.value = startWithSlash ? '/' : '';
    this.inputEl.focus();
  }

  public close() {
    this.isOpen = false;
    this.inputEl.value = '';
    this.inputEl.blur();
    this.containerEl.classList.add('hidden');
    this.player.controls.lockPointer();
  }

  public addMessage(msg: string, isSystem: boolean = false) {
    const el = document.createElement('div');
    el.className = isSystem ? 'chat-msg system' : 'chat-msg';
    el.textContent = msg;
    this.messagesEl.appendChild(el);

    if (this.messagesEl.children.length > 20) {
      this.messagesEl.removeChild(this.messagesEl.children[0]);
    }
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private handleCommand(cmdText: string) {
    const parts = cmdText.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'gamemode':
      case 'gm': {
        const mode = args[0]?.toLowerCase();
        if (mode === 'c' || mode === 'creative' || mode === '1') {
          this.player.gameMode = 'creative';
          this.player.isFlying = true;
          this.addMessage('Set game mode to Creative Mode', true);
        } else if (mode === 's' || mode === 'survival' || mode === '0') {
          this.player.gameMode = 'survival';
          this.player.isFlying = false;
          this.addMessage('Set game mode to Survival Mode', true);
        } else {
          this.addMessage('Usage: /gamemode <survival|creative>', true);
        }
        break;
      }

      case 'time': {
        if (args[0] === 'set') {
          const timeArg = args[1]?.toLowerCase();
          if (timeArg === 'day') {
            this.dayNight.setTimeOfDay('day');
            this.addMessage('Set the time to 1000', true);
          } else if (timeArg === 'night') {
            this.dayNight.setTimeOfDay('night');
            this.addMessage('Set the time to 18000', true);
          } else if (timeArg === 'noon') {
            this.dayNight.setTimeOfDay('noon');
            this.addMessage('Set the time to 6000', true);
          } else if (timeArg === 'sunset') {
            this.dayNight.setTimeOfDay('sunset');
            this.addMessage('Set the time to 12000', true);
          } else {
            const num = parseInt(timeArg, 10);
            if (!isNaN(num)) {
              this.dayNight.time = num % 24000;
              this.addMessage(`Set the time to ${num}`, true);
            }
          }
        } else {
          this.addMessage('Usage: /time set <day|night|noon|sunset|<number>>', true);
        }
        break;
      }

      case 'tp': {
        if (args.length >= 3) {
          const x = parseFloat(args[0]);
          const y = parseFloat(args[1]);
          const z = parseFloat(args[2]);
          if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
            this.player.setPosition(x, y, z);
            this.addMessage(`Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`, true);
          }
        } else {
          this.addMessage('Usage: /tp <x> <y> <z>', true);
        }
        break;
      }

      case 'give': {
        const itemArg = args[0];
        const count = parseInt(args[1] || '64', 10);
        let itemId: number | null = null;

        // Try numeric
        const parsed = parseInt(itemArg, 10);
        if (!isNaN(parsed)) itemId = parsed;
        else if (itemArg) {
          // Name search
          const lower = itemArg.toLowerCase();
          if (lower.includes('diamond_pick')) itemId = ItemId.DIAMOND_PICKAXE;
          else if (lower.includes('diamond_sword')) itemId = ItemId.DIAMOND_SWORD;
          else if (lower.includes('diamond')) itemId = Block.DIAMOND_ORE;
          else if (lower.includes('wood') || lower.includes('log')) itemId = Block.OAK_LOG;
          else if (lower.includes('plank')) itemId = Block.OAK_PLANKS;
          else if (lower.includes('stone')) itemId = Block.STONE;
          else if (lower.includes('torch')) itemId = Block.TORCH;
          else if (lower.includes('apple')) itemId = ItemId.APPLE;
          else if (lower.includes('tnt')) itemId = Block.TNT;
          else if (lower.includes('brick')) itemId = Block.BRICKS;
          else if (lower.includes('glass')) itemId = Block.GLASS;
        }

        if (itemId !== null) {
          this.inventory.addItem(itemId, count);
          this.addMessage(`Gave ${count} [${getItemName(itemId)}] to Player`, true);
        } else {
          this.addMessage(`Unknown item: ${itemArg}`, true);
        }
        break;
      }

      case 'weather': {
        const type = args[0]?.toLowerCase();
        if (type === 'clear' || type === 'sun') {
          this.weatherSystem?.setWeather('clear');
          this.addMessage('Set the weather to clear', true);
        } else if (type === 'rain') {
          this.weatherSystem?.setWeather('rain');
          this.addMessage('Set the weather to rain', true);
        } else if (type === 'thunder' || type === 'storm') {
          this.weatherSystem?.setWeather('thunder');
          this.addMessage('Set the weather to thunderstorm', true);
        } else {
          this.addMessage('Usage: /weather <clear|rain|thunder>', true);
        }
        break;
      }

      case 'kill': {
        this.player.takeDamage(100);
        this.addMessage('Ouch! That look like it hurt.', true);
        break;
      }

      case 'help': {
        this.addMessage('Commands: /gamemode, /time set, /weather, /tp, /give, /kill, /help', true);
        break;
      }

      default:
        this.addMessage(`Unknown command: /${cmd}. Type /help for help.`, true);
        break;
    }
  }
}
