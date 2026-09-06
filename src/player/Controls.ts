export class Controls {
  public keys: Map<string, boolean> = new Map();
  public mouseLook: { dx: number; dy: number } = { dx: 0, dy: 0 };
  public isLocked: boolean = false;
  public mouseLeftDown: boolean = false;
  public mouseRightDown: boolean = false;
  public onLeftClick?: () => void;
  public onRightClick?: () => void;
  public onRightClickUp?: () => void;
  public onSlotSelect?: (slotIndex: number) => void;
  public onZoom?: (delta: number) => boolean | void;
  public onToggleInventory?: () => void;
  public onTogglePause?: () => void;
  public onToggleFly?: () => void;
  public onToggleDebug?: () => void;
  public onTogglePerspective?: () => void;
  public onOpenChat?: () => void;
  public onDropItem?: () => void;
  public onPointerLock?: () => void;
  public onPointerUnlock?: () => void;

  // Touch screen controls settings
  public touchEnabled: boolean = true;
  public touchSensitivity: number = 1.0;
  public touchInvertPitch: boolean = false;
  public touchTapMode: 'place' | 'mine' = 'place';
  public touchPinchZoom: boolean = true;

  // Touch tracking internal state
  private activeTouchId: number | null = null;
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private lastTouchX: number = 0;
  private lastTouchY: number = 0;
  private touchStartTime: number = 0;
  private isTouchDragging: boolean = false;
  private touchHoldTriggered: boolean = false;
  private touchHoldTimer: number | null = null;
  private isPinching: boolean = false;
  private lastPinchDist: number = 0;

  private canvas: HTMLCanvasElement;
  private lastSpaceTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initEvents();
    this.initTouchListeners();
    this.initTouchDpad();
  }

  private initEvents() {
    // Pointer lock change listener
    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.isLocked;
      this.isLocked = document.pointerLockElement === this.canvas;
      if (this.isLocked) {
        this.canvas.focus();
        this.onPointerLock?.();
      } else {
        this.keys.clear();
        this.mouseLeftDown = false;
        this.mouseRightDown = false;
        if (wasLocked) {
          this.onPointerUnlock?.();
        }
      }
    });

    // Click canvas to automatically lock pointer and focus game
    this.canvas.addEventListener('click', () => {
      if (!this.isLocked) {
        this.lockPointer();
      }
    });

    // Reset keys when window loses focus to prevent key jamming / stuck keys
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
      this.mouseLook.dx = 0;
      this.mouseLook.dy = 0;
    });

    // Mouse movement
    window.addEventListener('mousemove', (e) => {
      if (this.isLocked) {
        this.mouseLook.dx += e.movementX;
        this.mouseLook.dy += e.movementY;
      }
    });

    // Mouse buttons
    window.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;
      if (e.button === 0) {
        this.mouseLeftDown = true;
        this.onLeftClick?.();
      } else if (e.button === 2) {
        this.mouseRightDown = true;
        this.onRightClick?.();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeftDown = false;
      if (e.button === 2) {
        this.mouseRightDown = false;
        this.onRightClickUp?.();
      }
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Mouse wheel for hotbar selection (or zoom when in isometric/third person or when Shift is held)
    window.addEventListener('wheel', (e) => {
      if (!this.isLocked) return;
      const delta = Math.sign(e.deltaY);
      let consumed = false;
      if (this.onZoom) {
        const res = this.onZoom(delta);
        if (res === true) {
          consumed = true;
        }
      }
      if (!consumed && this.onSlotSelect) {
        // Delta > 0 moves right, delta < 0 moves left
        this.onSlotSelect(delta);
      }
    }, { passive: true });

    // Keyboard events
    window.addEventListener('keydown', (e) => {
      // Chat input handling
      const chatInput = document.getElementById('chat-input') as HTMLInputElement;
      if (document.activeElement === chatInput) {
        if (e.code === 'Escape') {
          chatInput.blur();
          chatInput.value = '';
          document.getElementById('chat-container')?.classList.add('hidden');
        }
        return;
      }

      this.keys.set(e.code, true);

      // Number keys 1-9
      if (e.code.startsWith('Digit')) {
        const digit = parseInt(e.code.replace('Digit', ''), 10);
        if (digit >= 1 && digit <= 9) {
          this.onSlotSelect?.(digit - 1);
        }
      }

      // Space double-tap for creative flight toggle
      if (e.code === 'Space') {
        const now = performance.now();
        if (now - this.lastSpaceTime < 300) {
          this.onToggleFly?.();
        }
        this.lastSpaceTime = now;
      }

      // Hotkeys
      if (e.code === 'KeyE') {
        this.onToggleInventory?.();
      } else if (e.code === 'KeyF') {
        this.onToggleFly?.();
      } else if (e.code === 'KeyQ') {
        this.onDropItem?.();
      } else if (e.code === 'F3') {
        e.preventDefault();
        this.onToggleDebug?.();
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        this.onTogglePerspective?.();
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'BracketLeft') {
        this.onZoom?.(1); // Zoom out
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'BracketRight') {
        this.onZoom?.(-1); // Zoom in
      } else if (e.code === 'KeyT' || e.code === 'Slash') {
        if (this.isLocked) {
          e.preventDefault();
          this.onOpenChat?.();
        }
      } else if (e.code === 'Escape') {
        this.onTogglePause?.();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.set(e.code, false);
    });
  }

  private initTouchListeners() {
    if ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)) {
      document.body.classList.add('has-touch');
    }
    window.addEventListener('touchstart', () => {
      document.body.classList.add('has-touch');
    }, { once: true, passive: true });

    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      if (!this.touchEnabled) return;
      // If a modal or title screen is open, do not intercept
      if (document.querySelector('.screen-modal:not(.hidden), #title-screen:not(.hidden)')) {
        return;
      }
      e.preventDefault();

      // 3-finger tap = Pause game
      if (e.targetTouches.length === 3) {
        this.onTogglePause?.();
        return;
      }

      // 2-finger pinch zoom
      if (e.targetTouches.length === 2 && this.touchPinchZoom) {
        if (this.touchHoldTimer !== null) {
          clearTimeout(this.touchHoldTimer);
          this.touchHoldTimer = null;
        }
        if (this.mouseLeftDown) this.mouseLeftDown = false;
        if (this.mouseRightDown) {
          this.mouseRightDown = false;
          this.onRightClickUp?.();
        }
        this.isPinching = true;
        const t0 = e.targetTouches[0];
        const t1 = e.targetTouches[1];
        this.lastPinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        return;
      }

      if (e.targetTouches.length === 1) {
        const touch = e.targetTouches[0];
        this.activeTouchId = touch.identifier;
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.lastTouchX = touch.clientX;
        this.lastTouchY = touch.clientY;
        this.touchStartTime = performance.now();
        this.isTouchDragging = false;
        this.touchHoldTriggered = false;

        if (this.touchHoldTimer !== null) {
          clearTimeout(this.touchHoldTimer);
        }

        // Long press / Hold timer for mining/breaking block (~260ms)
        this.touchHoldTimer = window.setTimeout(() => {
          if (!this.isTouchDragging && this.activeTouchId !== null) {
            this.touchHoldTriggered = true;
            if (this.touchTapMode === 'place') {
              this.mouseLeftDown = true;
              this.onLeftClick?.();
            } else {
              this.mouseRightDown = true;
              this.onRightClick?.();
            }
            try {
              if (navigator.vibrate) {
                navigator.vibrate(25);
              }
            } catch (_) {}
          }
        }, 260);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.touchEnabled) return;
      e.preventDefault();

      // Multi-finger pinch zoom
      if (this.isPinching && e.targetTouches.length >= 2 && this.touchPinchZoom) {
        const t0 = e.targetTouches[0];
        const t1 = e.targetTouches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const diff = dist - this.lastPinchDist;
        if (Math.abs(diff) > 12) {
          // Pinch out = zoom in (delta < 0), pinch in = zoom out (delta > 0)
          const zoomDelta = diff > 0 ? -1 : 1;
          this.onZoom?.(zoomDelta);
          this.lastPinchDist = dist;
        }
        return;
      }

      // Single-finger look & orbit
      if (this.activeTouchId !== null) {
        let touch: Touch | null = null;
        for (let i = 0; i < e.targetTouches.length; i++) {
          if (e.targetTouches[i].identifier === this.activeTouchId) {
            touch = e.targetTouches[i];
            break;
          }
        }
        if (!touch) return;

        const dx = touch.clientX - this.lastTouchX;
        const dy = touch.clientY - this.lastTouchY;
        const travel = Math.hypot(touch.clientX - this.touchStartX, touch.clientY - this.touchStartY);

        if (travel > 8) {
          this.isTouchDragging = true;
          if (!this.touchHoldTriggered && this.touchHoldTimer !== null) {
            clearTimeout(this.touchHoldTimer);
            this.touchHoldTimer = null;
          }
        }

        const sens = this.touchSensitivity * 1.5;
        this.mouseLook.dx += dx * sens;
        this.mouseLook.dy += (this.touchInvertPitch ? -dy : dy) * sens;

        this.lastTouchX = touch.clientX;
        this.lastTouchY = touch.clientY;
      }
    }, { passive: false });

    const handleTouchEnd = (e: TouchEvent) => {
      if (this.touchHoldTimer !== null) {
        clearTimeout(this.touchHoldTimer);
        this.touchHoldTimer = null;
      }

      if (this.isPinching) {
        if (e.targetTouches.length < 2) {
          this.isPinching = false;
          this.lastPinchDist = 0;
        }
        return;
      }

      if (this.touchHoldTriggered) {
        if (this.mouseLeftDown) {
          this.mouseLeftDown = false;
        }
        if (this.mouseRightDown) {
          this.mouseRightDown = false;
          this.onRightClickUp?.();
        }
      } else if (!this.isTouchDragging && (performance.now() - this.touchStartTime < 300)) {
        // Quick tap: place or interact
        if (this.touchTapMode === 'place') {
          this.onRightClick?.();
          this.onRightClickUp?.();
        } else {
          this.onLeftClick?.();
        }
      }

      this.activeTouchId = null;
      this.isTouchDragging = false;
      this.touchHoldTriggered = false;
    };

    this.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
  }

  private initTouchDpad() {
    const bindBtn = (id: string, code: string) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.keys.set(code, true);
        btn.classList.add('pressed');
        if (code === 'Space') {
          const now = performance.now();
          if (now - this.lastSpaceTime < 350) {
            this.onToggleFly?.();
          }
          this.lastSpaceTime = now;
        }
      }, { passive: false });

      const release = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.keys.set(code, false);
        btn.classList.remove('pressed');
      };
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
    };

    bindBtn('touch-btn-up', 'KeyW');
    bindBtn('touch-btn-left', 'KeyA');
    bindBtn('touch-btn-down', 'KeyS');
    bindBtn('touch-btn-right', 'KeyD');
    bindBtn('touch-btn-jump', 'Space');

    // Corner touch action buttons
    document.getElementById('touch-btn-pause')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onTogglePause?.();
    });
    document.getElementById('touch-btn-view')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onTogglePerspective?.();
    });
    document.getElementById('touch-btn-inv')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onToggleInventory?.();
    });
  }

  public setTouchEnabled(enabled: boolean) {
    this.touchEnabled = enabled;
  }

  public setTouchSensitivity(multiplier: number) {
    this.touchSensitivity = multiplier;
  }

  public setTouchInvertPitch(invert: boolean) {
    this.touchInvertPitch = invert;
  }

  public setTouchTapMode(mode: 'place' | 'mine') {
    this.touchTapMode = mode;
  }

  public setTouchPinchZoom(enabled: boolean) {
    this.touchPinchZoom = enabled;
  }

  public lockPointer() {
    try {
      this.canvas.requestPointerLock?.();
    } catch (_) {}
  }

  public unlockPointer() {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  public isKeyDown(code: string): boolean {
    return this.keys.get(code) === true;
  }

  public consumeMouseLook(): { dx: number; dy: number } {
    const res = { dx: this.mouseLook.dx, dy: this.mouseLook.dy };
    this.mouseLook.dx = 0;
    this.mouseLook.dy = 0;
    return res;
  }
}
