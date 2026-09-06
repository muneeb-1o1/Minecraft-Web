import { Player } from '../player/Player';
import { Inventory } from '../gameplay/Inventory';
import { TextureAtlas } from '../textures/TextureAtlas';
import { getItemName, ItemId, Block } from '../world/BlockTypes';

export class HUD {
  public player: Player;
  public inventory: Inventory;
  public atlas: TextureAtlas;

  private hudElement: HTMLElement;
  private hotbarSlots: HTMLElement[] = [];
  private itemLabel: HTMLElement;
  private armorBar: HTMLElement;
  private healthBar: HTMLElement;
  private hungerBar: HTMLElement;
  private airBar: HTMLElement;
  private expBarFill: HTMLElement;
  private expLevel: HTMLElement;

  private itemLabelTimer: number | null = null;
  private lastSelectedSlot: number = -1;

  constructor(player: Player, inventory: Inventory, atlas: TextureAtlas) {
    this.player = player;
    this.inventory = inventory;
    this.atlas = atlas;

    this.hudElement = document.getElementById('hud')!;
    this.itemLabel = document.getElementById('item-label')!;
    this.armorBar = document.getElementById('armor-bar')!;
    this.healthBar = document.getElementById('health-bar')!;
    this.hungerBar = document.getElementById('hunger-bar')!;
    this.airBar = document.getElementById('air-bar')!;
    this.expBarFill = document.getElementById('exp-bar-fill')!;
    this.expLevel = document.getElementById('exp-level')!;

    this.initHotbar();
    this.inventory.onChange = () => this.updateHotbar();
  }

  public show() {
    this.hudElement.classList.remove('hidden');
    this.update();
  }

  public hide() {
    this.hudElement.classList.add('hidden');
  }

  private initHotbar() {
    const slots = document.querySelectorAll('.hotbar-slot');
    this.hotbarSlots = Array.from(slots) as HTMLElement[];

    this.hotbarSlots.forEach((slot, idx) => {
      const selectSlot = (e: Event) => {
        e.stopPropagation();
        this.inventory.setSelectedSlot(idx);
        this.player.sounds.playClick();
      };
      slot.addEventListener('click', selectSlot);
      slot.addEventListener('touchstart', selectSlot, { passive: true });
    });

    this.updateHotbar();
  }

  public updateHotbar() {
    const selectedIdx = this.inventory.getSelectedSlot();

    for (let i = 0; i < 9; i++) {
      const slotEl = this.hotbarSlots[i];
      if (!slotEl) continue;

      if (i === selectedIdx) {
        slotEl.classList.add('active');
      } else {
        slotEl.classList.remove('active');
      }

      slotEl.innerHTML = '';
      const stack = this.inventory.getSlot(i);
      if (stack) {
        const iconUrl = this.atlas.getItemIconDataUrl(stack.id);
        const img = document.createElement('img');
        img.className = 'slot-icon';
        img.src = iconUrl;
        img.alt = getItemName(stack.id);
        slotEl.appendChild(img);

        if (stack.count > 1) {
          const countSpan = document.createElement('span');
          countSpan.className = 'slot-count';
          countSpan.textContent = stack.count.toString();
          slotEl.appendChild(countSpan);
        }

        if (stack.durability !== undefined && stack.maxDurability !== undefined && stack.durability < stack.maxDurability) {
          const durPercent = Math.max(0, Math.min(1, stack.durability / stack.maxDurability));
          const durBarContainer = document.createElement('div');
          durBarContainer.className = 'durability-bar-container';
          const durBarFill = document.createElement('div');
          durBarFill.className = 'durability-bar-fill';
          durBarFill.style.width = `${durPercent * 100}%`;
          if (durPercent > 0.5) durBarFill.style.backgroundColor = '#55ff55';
          else if (durPercent > 0.2) durBarFill.style.backgroundColor = '#ffff55';
          else durBarFill.style.backgroundColor = '#ff5555';
          durBarContainer.appendChild(durBarFill);
          slotEl.appendChild(durBarContainer);
        }
      }
    }

    // If selected slot or held item changed, update player's 3D held item and popup label
    const stack = this.inventory.getSelectedItem();
    const itemId = stack ? stack.id : 0;
    if (selectedIdx !== this.lastSelectedSlot || itemId !== this.player.currentHeldItemId) {
      const slotChanged = selectedIdx !== this.lastSelectedSlot;
      this.lastSelectedSlot = selectedIdx;
      this.player.setHeldItem(itemId);

      // Popup label on slot change
      if (slotChanged) {
        if (stack) {
          this.showItemLabel(getItemName(stack.id));
        } else {
          this.hideItemLabel();
        }
      }
    }
  }

  public showItemLabel(name: string) {
    this.itemLabel.textContent = name;
    this.itemLabel.classList.add('show');

    if (this.itemLabelTimer !== null) {
      clearTimeout(this.itemLabelTimer);
    }
    this.itemLabelTimer = window.setTimeout(() => {
      this.hideItemLabel();
    }, 2000);
  }

  public hideItemLabel() {
    this.itemLabel.classList.remove('show');
  }

  public update() {
    this.updateStatusBars();
    this.updateHotbar();
  }

  // Render 10 hearts, 10 drumsticks, 10 bubbles
  private updateStatusBars() {
    if (this.player.gameMode === 'creative') {
      this.armorBar.classList.add('hidden');
      this.healthBar.innerHTML = '';
      this.hungerBar.innerHTML = '';
      this.airBar.classList.add('hidden');
      return;
    }

    // Armor: 20 points (10 shields)
    const armorDefense = this.inventory.getArmorDefense();
    if (armorDefense > 0) {
      this.armorBar.classList.remove('hidden');
      let armorHtml = '';
      for (let i = 0; i < 10; i++) {
        const val = i * 2;
        let icon = '🛡️';
        if (armorDefense <= val) {
          icon = '◽';
        } else if (armorDefense === val + 1) {
          icon = '🔰'; // Half shield
        }
        armorHtml += `<span class="stat-icon-char">${icon}</span>`;
      }
      this.armorBar.innerHTML = armorHtml;
    } else {
      this.armorBar.classList.add('hidden');
    }

    // Health: 20 points (10 hearts)
    let healthHtml = '';
    const currentHealth = Math.round(this.player.health);
    for (let i = 0; i < 10; i++) {
      const heartValue = i * 2;
      let heartIcon = '❤️'; // Full heart
      if (currentHealth <= heartValue) {
        heartIcon = '🖤'; // Empty heart
      } else if (currentHealth === heartValue + 1) {
        heartIcon = '💔'; // Half heart
      }
      healthHtml += `<span class="stat-icon-char">${heartIcon}</span>`;
    }
    this.healthBar.innerHTML = healthHtml;

    // Hunger: 20 points (10 drumsticks)
    let hungerHtml = '';
    const currentHunger = Math.round(this.player.hunger);
    for (let i = 0; i < 10; i++) {
      const val = i * 2;
      let icon = '🍗';
      if (currentHunger <= val) {
        icon = '🦴';
      }
      hungerHtml += `<span class="stat-icon-char">${icon}</span>`;
    }
    this.hungerBar.innerHTML = hungerHtml;

    // Air: show bubbles whenever head is underwater or while air is recovering back to full
    if (this.player.isHeadUnderwater || this.player.air < this.player.maxAir) {
      this.airBar.classList.remove('hidden');
      let airHtml = '';
      const bubbles = Math.ceil((this.player.air / this.player.maxAir) * 10);
      for (let i = 0; i < 10; i++) {
        airHtml += `<span class="stat-icon-char">${i < bubbles ? '🫧' : '⚪'}</span>`;
      }
      this.airBar.innerHTML = airHtml;
    } else {
      this.airBar.classList.add('hidden');
    }

    // Exp bar
    this.expBarFill.style.width = `${(this.player.xp % 100)}%`;
    this.expLevel.textContent = this.player.level.toString();
  }
}
