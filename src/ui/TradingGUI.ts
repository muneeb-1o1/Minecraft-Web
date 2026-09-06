import { Player } from '../player/Player';
import { Inventory } from '../gameplay/Inventory';
import { TextureAtlas } from '../textures/TextureAtlas';
import { SoundManager } from '../audio/SoundManager';
import { ItemId, getItemName } from '../world/BlockTypes';
import { AdvancementManager } from '../gameplay/Advancements';

export interface VillagerTrade {
  inputId: number;
  inputCount: number;
  outputId: number;
  outputCount: number;
}

export class TradingGUI {
  public player: Player;
  public inventory: Inventory;
  public atlas: TextureAtlas;
  public sounds: SoundManager;
  public advancements?: AdvancementManager;

  public isOpen: boolean = false;

  private screenModal: HTMLElement;
  private tradeListEl: HTMLElement;
  private emeraldCountEl: HTMLElement;

  private trades: VillagerTrade[] = [
    { inputId: ItemId.WHEAT, inputCount: 16, outputId: ItemId.EMERALD, outputCount: 1 },
    { inputId: ItemId.EMERALD, inputCount: 1, outputId: ItemId.BREAD, outputCount: 4 },
    { inputId: ItemId.EMERALD, inputCount: 3, outputId: ItemId.IRON_SWORD, outputCount: 1 },
    { inputId: ItemId.EMERALD, inputCount: 2, outputId: ItemId.IRON_PICKAXE, outputCount: 1 },
    { inputId: ItemId.EMERALD, inputCount: 5, outputId: ItemId.DIAMOND, outputCount: 1 }
  ];

  constructor(player: Player, inventory: Inventory, atlas: TextureAtlas, sounds: SoundManager) {
    this.player = player;
    this.inventory = inventory;
    this.atlas = atlas;
    this.sounds = sounds;

    this.screenModal = document.getElementById('trading-screen')!;
    this.tradeListEl = document.getElementById('trading-list')!;
    this.emeraldCountEl = document.getElementById('trading-emerald-count')!;

    this.initEvents();
  }

  private initEvents() {
    document.getElementById('trading-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // Close on click outside window
    this.screenModal.addEventListener('click', (e) => {
      if (e.target === this.screenModal) {
        this.close();
      }
    });

    // Esc / E key handling
    window.addEventListener('keydown', (e) => {
      if (this.isOpen && (e.code === 'Escape' || e.code === 'KeyE')) {
        e.stopPropagation();
        this.close();
      }
    });
  }

  public open() {
    this.isOpen = true;
    this.screenModal.classList.remove('hidden');
    this.player.controls.unlockPointer();
    this.sounds.playVillager();
    this.render();
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.screenModal.classList.add('hidden');
    this.player.controls.lockPointer();
  }

  public render() {
    if (!this.isOpen) return;

    // Display player's current emerald and wheat count
    const emeralds = this.inventory.countItem(ItemId.EMERALD);
    const wheat = this.inventory.countItem(ItemId.WHEAT);
    if (this.emeraldCountEl) {
      this.emeraldCountEl.innerHTML = `Your Emeralds: <strong>${emeralds}</strong> | Wheat: <strong>${wheat}</strong>`;
    }

    this.tradeListEl.innerHTML = '';

    for (const trade of this.trades) {
      const canAfford = this.inventory.countItem(trade.inputId) >= trade.inputCount;

      const row = document.createElement('div');
      row.className = 'trade-row';

      // Input item box
      const inputSlot = document.createElement('div');
      inputSlot.className = 'trade-item-box';
      const inputIcon = document.createElement('img');
      inputIcon.className = 'slot-icon';
      inputIcon.src = this.atlas.getPixelIcon(trade.inputId);
      const inputLabel = document.createElement('div');
      inputLabel.className = 'trade-item-label';
      inputLabel.innerText = `${trade.inputCount}x ${getItemName(trade.inputId)}`;
      inputSlot.appendChild(inputIcon);
      inputSlot.appendChild(inputLabel);

      // Arrow
      const arrow = document.createElement('div');
      arrow.className = 'trade-arrow';
      arrow.innerHTML = '&rarr;';

      // Output item box
      const outputSlot = document.createElement('div');
      outputSlot.className = 'trade-item-box';
      const outputIcon = document.createElement('img');
      outputIcon.className = 'slot-icon';
      outputIcon.src = this.atlas.getPixelIcon(trade.outputId);
      const outputLabel = document.createElement('div');
      outputLabel.className = 'trade-item-label';
      outputLabel.innerText = `${trade.outputCount}x ${getItemName(trade.outputId)}`;
      outputSlot.appendChild(outputIcon);
      outputSlot.appendChild(outputLabel);

      // Trade action button
      const tradeBtn = document.createElement('button');
      tradeBtn.className = `mc-btn trade-btn ${canAfford ? 'trade-btn-active' : ''}`;
      tradeBtn.innerText = 'TRADE';
      tradeBtn.disabled = !canAfford;

      tradeBtn.onclick = () => {
        if (this.inventory.removeItem(trade.inputId, trade.inputCount)) {
          this.inventory.addItem(trade.outputId, trade.outputCount);
          this.sounds.playPop();
          this.sounds.playVillager();
          this.advancements?.award('what_a_deal');
          this.render();
        }
      };

      row.appendChild(inputSlot);
      row.appendChild(arrow);
      row.appendChild(outputSlot);
      row.appendChild(tradeBtn);

      this.tradeListEl.appendChild(row);
    }
  }
}
