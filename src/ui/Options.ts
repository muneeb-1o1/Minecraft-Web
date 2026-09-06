import { Player } from '../player/Player';
import { World } from '../world/World';
import { SoundManager } from '../audio/SoundManager';
import { DayNightCycle, CloudQuality } from '../gameplay/DayNightCycle';
import { DebugScreen } from './DebugScreen';
import { WeatherSystem } from '../gameplay/WeatherSystem';

export interface GameSettingsCallback {
  applyResolution: (preset: string, scale: number) => { width: number; height: number };
  setGraphicsPreset: (preset: 'retro' | 'fancy' | 'rtx') => void;
  setExposure: (val: number) => void;
  setToneMapping: (mode: 'aces' | 'reinhard' | 'off') => void;
  setTargetFps: (fps: number) => void;
  toggleFullscreen: () => void;
  toggleGodRays: () => boolean;
  toggleBloom: () => boolean;
}

export class OptionsManager {
  public player: Player;
  public world: World;
  public sounds: SoundManager;
  public dayNight: DayNightCycle;
  public debugScreen: DebugScreen;
  public gameCallbacks?: GameSettingsCallback;
  public weatherSystem?: WeatherSystem;

  // DOM Elements
  private resolutionSelect: HTMLSelectElement;
  private activeResBadge: HTMLElement | null;
  private renderScaleSlider: HTMLInputElement;
  private renderScaleVal: HTMLElement;
  private fovSlider: HTMLInputElement;
  private fovVal: HTMLElement;
  private renderSlider: HTMLInputElement;
  private renderVal: HTMLElement;
  private fpsLimitSelect: HTMLSelectElement;
  private toggleFullscreenBtn: HTMLButtonElement;

  private graphicsPresetBtn: HTMLButtonElement;
  private shadowQualityBtn: HTMLButtonElement;
  private toggleGodRaysBtn: HTMLButtonElement;
  private toggleBloomBtn: HTMLButtonElement;
  private toneMappingBtn: HTMLButtonElement;
  private exposureSlider: HTMLInputElement;
  private exposureVal: HTMLElement;
  private toggleAoBtn: HTMLButtonElement;
  private toggleWaterReflBtn: HTMLButtonElement;

  private weatherSelectBtn: HTMLButtonElement;
  private cloudQualityBtn: HTMLButtonElement;
  private dayLengthBtn: HTMLButtonElement;
  private fastNightsBtn: HTMLButtonElement;
  private volumeSlider: HTMLInputElement;
  private volumeVal: HTMLElement;
  private musicVolumeSlider: HTMLInputElement;
  private musicVolumeVal: HTMLElement;
  private sfxVolumeSlider: HTMLInputElement;
  private sfxVolumeVal: HTMLElement;
  private weatherVolumeSlider: HTMLInputElement;
  private weatherVolumeVal: HTMLElement;
  private toggleFpsBtn: HTMLButtonElement;
  private resetOptionsBtn: HTMLButtonElement;

  // Touch Screen Elements
  private touchControlsBtn: HTMLButtonElement | null;
  private touchSensitivitySlider: HTMLInputElement | null;
  private touchSensitivityVal: HTMLElement | null;
  private touchInvertPitchBtn: HTMLButtonElement | null;
  private touchTapModeBtn: HTMLButtonElement | null;
  private touchPinchZoomBtn: HTMLButtonElement | null;
  private touchVirtualPadBtn: HTMLButtonElement | null;
  private touchMovementOverlay: HTMLElement | null;

  // State
  public currentResolution: string = '1080p';
  public currentRenderScale: number = 1.0;
  public currentGraphicsPreset: 'rtx' | 'fancy' | 'retro' = 'rtx';
  public currentShadowRes: number = 2048;
  public currentToneMapping: 'aces' | 'reinhard' | 'off' = 'aces';
  public godRaysEnabled: boolean = true;
  public bloomEnabled: boolean = true;
  public smoothLighting: boolean = true;
  public waterShimmer: boolean = true;
  public showFps: boolean = true;
  public dayLengthMinutes: number = 20;

  // Touch State
  public touchControlsEnabled: boolean = true;
  public touchSensitivityPercent: number = 100;
  public touchInvertPitch: boolean = false;
  public touchTapMode: 'place' | 'mine' = 'place';
  public touchPinchZoom: boolean = true;
  public touchVirtualPadEnabled: boolean = false;

  constructor(
    player: Player,
    world: World,
    sounds: SoundManager,
    dayNight: DayNightCycle,
    debugScreen: DebugScreen,
    callbacks?: GameSettingsCallback,
    weatherSystem?: WeatherSystem
  ) {
    this.player = player;
    this.world = world;
    this.sounds = sounds;
    this.dayNight = dayNight;
    this.debugScreen = debugScreen;
    this.gameCallbacks = callbacks;
    this.weatherSystem = weatherSystem;

    // Display
    this.resolutionSelect = document.getElementById('resolution-select') as HTMLSelectElement;
    this.activeResBadge = document.getElementById('active-res-badge');
    this.renderScaleSlider = document.getElementById('render-scale-slider') as HTMLInputElement;
    this.renderScaleVal = document.getElementById('render-scale-val')!;
    this.fovSlider = document.getElementById('fov-slider') as HTMLInputElement;
    this.fovVal = document.getElementById('fov-val')!;
    this.renderSlider = document.getElementById('render-dist-slider') as HTMLInputElement;
    this.renderVal = document.getElementById('render-dist-val')!;
    this.fpsLimitSelect = document.getElementById('fps-limit-select') as HTMLSelectElement;
    this.toggleFullscreenBtn = document.getElementById('toggle-fullscreen-btn') as HTMLButtonElement;

    // RTX
    this.graphicsPresetBtn = document.getElementById('graphics-preset-btn') as HTMLButtonElement;
    this.shadowQualityBtn = document.getElementById('shadow-quality-btn') as HTMLButtonElement;
    this.toggleGodRaysBtn = document.getElementById('toggle-godrays-btn') as HTMLButtonElement;
    this.toggleBloomBtn = document.getElementById('toggle-bloom-btn') as HTMLButtonElement;
    this.toneMappingBtn = document.getElementById('tone-mapping-btn') as HTMLButtonElement;
    this.exposureSlider = document.getElementById('exposure-slider') as HTMLInputElement;
    this.exposureVal = document.getElementById('exposure-val')!;
    this.toggleAoBtn = document.getElementById('toggle-ao-btn') as HTMLButtonElement;
    this.toggleWaterReflBtn = document.getElementById('toggle-water-refl-btn') as HTMLButtonElement;

    // Atmosphere & Audio
    this.weatherSelectBtn = document.getElementById('weather-select-btn') as HTMLButtonElement;
    this.cloudQualityBtn = document.getElementById('cloud-quality-btn') as HTMLButtonElement;
    this.dayLengthBtn = document.getElementById('day-length-btn') as HTMLButtonElement;
    this.fastNightsBtn = document.getElementById('fast-nights-btn') as HTMLButtonElement;
    this.volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    this.volumeVal = document.getElementById('volume-val')!;
    this.musicVolumeSlider = document.getElementById('music-volume-slider') as HTMLInputElement;
    this.musicVolumeVal = document.getElementById('music-volume-val')!;
    this.sfxVolumeSlider = document.getElementById('sfx-volume-slider') as HTMLInputElement;
    this.sfxVolumeVal = document.getElementById('sfx-volume-val')!;
    this.weatherVolumeSlider = document.getElementById('weather-volume-slider') as HTMLInputElement;
    this.weatherVolumeVal = document.getElementById('weather-volume-val')!;
    this.toggleFpsBtn = document.getElementById('toggle-fps-btn') as HTMLButtonElement;
    this.resetOptionsBtn = document.getElementById('reset-options-btn') as HTMLButtonElement;

    // Touch Screen Elements
    this.touchControlsBtn = document.getElementById('touch-controls-btn') as HTMLButtonElement | null;
    this.touchSensitivitySlider = document.getElementById('touch-sensitivity-slider') as HTMLInputElement | null;
    this.touchSensitivityVal = document.getElementById('touch-sensitivity-val');
    this.touchInvertPitchBtn = document.getElementById('touch-invert-pitch-btn') as HTMLButtonElement | null;
    this.touchTapModeBtn = document.getElementById('touch-tap-mode-btn') as HTMLButtonElement | null;
    this.touchPinchZoomBtn = document.getElementById('touch-pinch-zoom-btn') as HTMLButtonElement | null;
    this.touchVirtualPadBtn = document.getElementById('touch-virtual-pad-btn') as HTMLButtonElement | null;
    this.touchMovementOverlay = document.getElementById('touch-movement-overlay');

    this.initEvents();

    const initDims = this.gameCallbacks?.applyResolution(this.currentResolution, this.currentRenderScale);
    if (initDims && this.activeResBadge) {
      this.activeResBadge.textContent = `${initDims.width}x${initDims.height} (${this.currentResolution.toUpperCase()})`;
    }
  }

  private initEvents() {
    // 0. Tab navigation switching
    const tabBtns = document.querySelectorAll('.mc-tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = (btn as HTMLElement).dataset.tab;
        if (!targetTab) return;
        this.sounds.playClick();
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        tabPanes.forEach((pane) => {
          if (pane.id === targetTab) {
            pane.classList.remove('hidden');
          } else {
            pane.classList.add('hidden');
          }
        });
      });
    });

    const updateBadge = (w: number, h: number) => {
      if (this.activeResBadge) {
        this.activeResBadge.textContent = `${w}x${h} (${this.currentResolution.toUpperCase()})`;
      }
    };

    const syncGraphicsUI = () => {
      const isRtx = this.currentGraphicsPreset === 'rtx';
      this.graphicsPresetBtn.textContent = `Graphics: ${isRtx ? 'RTX Ultra' : 'Vanilla Classic'}`;

      if (this.shadowQualityBtn) {
        if (isRtx) {
          const shadowName = this.currentShadowRes === 4096 ? 'Ultra PCF (4096)' :
            this.currentShadowRes === 1024 ? 'Fast (1024)' :
            this.currentShadowRes === 0 ? 'OFF' : 'PCF Soft (2048)';
          this.shadowQualityBtn.textContent = `RTX Shadows: ${shadowName}`;
          this.shadowQualityBtn.style.opacity = '1';
        } else {
          this.shadowQualityBtn.textContent = 'Shadows: OFF (Vanilla)';
          this.shadowQualityBtn.style.opacity = '0.6';
        }
      }

      if (this.toggleBloomBtn) {
        this.toggleBloomBtn.textContent = isRtx
          ? `RTX Bloom: ${this.bloomEnabled ? 'ON' : 'OFF'}`
          : 'Bloom: OFF (Vanilla)';
        this.toggleBloomBtn.style.opacity = isRtx ? '1' : '0.6';
      }

      if (this.toggleGodRaysBtn) {
        this.toggleGodRaysBtn.textContent = isRtx
          ? `RTX God Rays: ${this.godRaysEnabled ? 'ON' : 'OFF'}`
          : 'God Rays: OFF (Vanilla)';
        this.toggleGodRaysBtn.style.opacity = isRtx ? '1' : '0.6';
      }

      if (this.toggleWaterReflBtn) {
        this.toggleWaterReflBtn.textContent = `Water Shimmer: ${this.waterShimmer ? 'ON' : 'OFF'}`;
      }
    };

    // 1. Resolution selection
    this.resolutionSelect?.addEventListener('change', () => {
      this.currentResolution = this.resolutionSelect.value;
      const dims = this.gameCallbacks?.applyResolution(this.currentResolution, this.currentRenderScale);
      if (dims) updateBadge(dims.width, dims.height);
      this.sounds.playClick();
    });

    // 2. Render Scale slider
    this.renderScaleSlider?.addEventListener('input', () => {
      const scalePercent = parseInt(this.renderScaleSlider.value, 10);
      this.renderScaleVal.textContent = `${scalePercent}%`;
      this.currentRenderScale = scalePercent / 100;
      const dims = this.gameCallbacks?.applyResolution(this.currentResolution, this.currentRenderScale);
      if (dims) updateBadge(dims.width, dims.height);
    });

    // 3. FOV
    this.fovSlider?.addEventListener('input', () => {
      const fov = parseInt(this.fovSlider.value, 10);
      let label = fov.toString();
      if (fov === 75) label += ' (Normal)';
      else if (fov === 110) label += ' (Quake Pro)';
      this.fovVal.textContent = label;
      this.player.baseFov = fov;
      this.player.targetFov = fov;
      this.player.camera.fov = fov;
      this.player.camera.updateProjectionMatrix();
    });

    // 4. Render distance
    this.renderSlider?.addEventListener('input', () => {
      const dist = parseInt(this.renderSlider.value, 10);
      this.renderVal.textContent = dist.toString();
      this.world.renderDistance = dist;
    });

    // 5. Max Framerate
    this.fpsLimitSelect?.addEventListener('change', () => {
      const fps = parseInt(this.fpsLimitSelect.value, 10);
      this.gameCallbacks?.setTargetFps(fps);
      this.sounds.playClick();
    });

    // 6. Fullscreen
    this.toggleFullscreenBtn?.addEventListener('click', () => {
      this.gameCallbacks?.toggleFullscreen();
      const isFull = !!document.fullscreenElement;
      this.toggleFullscreenBtn.textContent = `Fullscreen: ${!isFull ? 'ON' : 'OFF'}`;
      this.sounds.playClick();
    });

    // 7. Graphics Preset Cycle (RTX Ultra <-> Vanilla Classic)
    this.graphicsPresetBtn?.addEventListener('click', () => {
      if (this.currentGraphicsPreset === 'rtx') {
        this.currentGraphicsPreset = 'retro';
      } else {
        this.currentGraphicsPreset = 'rtx';
      }

      this.gameCallbacks?.setGraphicsPreset(this.currentGraphicsPreset);

      // Synchronize exposure slider display
      if (this.exposureSlider && this.exposureVal) {
        const defaultPercent = this.currentGraphicsPreset === 'rtx' ? 85 : 58;
        this.exposureSlider.value = defaultPercent.toString();
        this.exposureVal.textContent = `${defaultPercent}%`;
      }

      syncGraphicsUI();
      this.sounds.playClick();
    });

    // 8. RTX Shadow Quality
    this.shadowQualityBtn?.addEventListener('click', () => {
      if (this.currentGraphicsPreset !== 'rtx') {
        // Auto-switch to RTX if user clicks shadow quality
        this.currentGraphicsPreset = 'rtx';
        this.gameCallbacks?.setGraphicsPreset('rtx');
      }

      if (this.currentShadowRes === 2048) {
        this.currentShadowRes = 4096;
      } else if (this.currentShadowRes === 4096) {
        this.currentShadowRes = 0;
      } else if (this.currentShadowRes === 0) {
        this.currentShadowRes = 1024;
      } else {
        this.currentShadowRes = 2048;
      }
      this.dayNight.setShadowResolution(this.currentShadowRes);
      syncGraphicsUI();
      this.sounds.playClick();
    });

    // 8b. RTX Volumetric God Rays
    this.toggleGodRaysBtn?.addEventListener('click', () => {
      if (this.currentGraphicsPreset !== 'rtx') {
        this.currentGraphicsPreset = 'rtx';
        this.gameCallbacks?.setGraphicsPreset('rtx');
      }
      if (this.gameCallbacks) {
        this.godRaysEnabled = this.gameCallbacks.toggleGodRays();
      } else {
        this.godRaysEnabled = !this.godRaysEnabled;
      }
      syncGraphicsUI();
      this.sounds.playClick();
    });

    // 8c. RTX Bloom Radiant Glow
    this.toggleBloomBtn?.addEventListener('click', () => {
      if (this.currentGraphicsPreset !== 'rtx') {
        this.currentGraphicsPreset = 'rtx';
        this.gameCallbacks?.setGraphicsPreset('rtx');
      }
      if (this.gameCallbacks) {
        this.bloomEnabled = this.gameCallbacks.toggleBloom();
      } else {
        this.bloomEnabled = !this.bloomEnabled;
      }
      syncGraphicsUI();
      this.sounds.playClick();
    });

    // 9. Tone Mapping
    this.toneMappingBtn?.addEventListener('click', () => {
      if (this.currentToneMapping === 'aces') {
        this.currentToneMapping = 'reinhard';
        this.toneMappingBtn.textContent = 'Tone Mapping: Reinhard';
      } else if (this.currentToneMapping === 'reinhard') {
        this.currentToneMapping = 'off';
        this.toneMappingBtn.textContent = 'Tone Mapping: OFF (Linear)';
      } else {
        this.currentToneMapping = 'aces';
        this.toneMappingBtn.textContent = 'Tone Mapping: ACES Filmic';
      }
      this.gameCallbacks?.setToneMapping(this.currentToneMapping);
      this.sounds.playClick();
    });

    // 10. Brightness / Exposure Slider
    this.exposureSlider?.addEventListener('input', () => {
      const expPercent = parseInt(this.exposureSlider.value, 10);
      this.exposureVal.textContent = `${expPercent}%`;
      const actualExp = (expPercent / 100) * 1.15;
      this.gameCallbacks?.setExposure(actualExp);
    });

    // 11. Smooth Lighting (AO)
    this.toggleAoBtn?.addEventListener('click', () => {
      this.smoothLighting = !this.smoothLighting;
      this.toggleAoBtn.textContent = `Smooth Lighting: ${this.smoothLighting ? 'ON' : 'OFF'}`;
      this.sounds.playClick();
      for (const chunk of this.world.chunks.values()) {
        chunk.isDirty = true;
      }
    });

    // 12. Water Shimmer & Glint
    this.toggleWaterReflBtn?.addEventListener('click', () => {
      this.waterShimmer = !this.waterShimmer;
      this.toggleWaterReflBtn.textContent = `Water Shimmer: ${this.waterShimmer ? 'ON' : 'OFF'}`;
      if (this.waterShimmer) {
        this.world.waterMaterial.roughness = 0.10;
        this.world.waterMaterial.metalness = 0.32;
      } else {
        this.world.waterMaterial.roughness = 0.70;
        this.world.waterMaterial.metalness = 0.0;
      }
      this.world.waterMaterial.needsUpdate = true;
      this.sounds.playClick();
    });

    // 13. Cloud Quality (Fancy 3D Volumetric -> Fast 2D -> OFF)
    this.cloudQualityBtn?.addEventListener('click', () => {
      const current = this.dayNight.cloudQuality;
      let next: CloudQuality = 'fancy';
      if (current === 'fancy') next = 'fast';
      else if (current === 'fast') next = 'off';
      else next = 'fancy';

      this.dayNight.setCloudQuality(next);
      this.cloudQualityBtn.textContent = `Clouds: ${
        next === 'fancy' ? 'Fancy 3D Volumetric' :
        next === 'fast' ? 'Fast 2D' : 'OFF'
      }`;
      this.sounds.playClick();
    });

    // 14. Day Length (20m -> 30m -> 45m -> 10m)
    this.dayLengthBtn?.addEventListener('click', () => {
      if (this.dayLengthMinutes === 20) this.dayLengthMinutes = 30;
      else if (this.dayLengthMinutes === 30) this.dayLengthMinutes = 45;
      else if (this.dayLengthMinutes === 45) this.dayLengthMinutes = 10;
      else this.dayLengthMinutes = 20;

      this.dayNight.setDayDuration(this.dayLengthMinutes);
      this.dayLengthBtn.textContent = `Day Length: ${this.dayLengthMinutes} min${
        this.dayLengthMinutes >= 20 ? ' (Extended)' : ''
      }`;
      this.sounds.playClick();
    });

    // 15. Fast Nights Toggle (ON 4x speed / OFF 1:1)
    this.fastNightsBtn?.addEventListener('click', () => {
      this.dayNight.fastNights = !this.dayNight.fastNights;
      this.fastNightsBtn.textContent = `Fast Nights: ${
        this.dayNight.fastNights ? 'ON (4x Speed)' : 'OFF (1:1 Realistic)'
      }`;
      this.sounds.playClick();
    });

    // 16. Weather Cycle Selector
    this.weatherSelectBtn?.addEventListener('click', () => {
      if (!this.weatherSystem) return;
      const current = this.weatherSystem.currentWeather;
      let next: 'clear' | 'rain' | 'thunder' = 'clear';
      if (current === 'clear') next = 'rain';
      else if (current === 'rain') next = 'thunder';
      else next = 'clear';

      this.weatherSystem.setWeather(next);
      this.weatherSelectBtn.textContent = `Weather: ${next.charAt(0).toUpperCase() + next.slice(1)}`;
      this.sounds.playClick();
    });

    // 17. Master Volume
    this.volumeSlider?.addEventListener('input', () => {
      const vol = parseInt(this.volumeSlider.value, 10);
      this.volumeVal.textContent = `${vol}%`;
      this.sounds.setVolume(vol / 100);
    });

    // 18. Music Volume
    this.musicVolumeSlider?.addEventListener('input', () => {
      const vol = parseInt(this.musicVolumeSlider.value, 10);
      this.musicVolumeVal.textContent = `${vol}%`;
      this.sounds.setMusicVolume(vol / 100);
    });

    // 19. SFX Volume
    this.sfxVolumeSlider?.addEventListener('input', () => {
      const vol = parseInt(this.sfxVolumeSlider.value, 10);
      this.sfxVolumeVal.textContent = `${vol}%`;
      this.sounds.setSfxVolume(vol / 100);
    });

    // 20. Weather / Ambience Volume
    this.weatherVolumeSlider?.addEventListener('input', () => {
      const vol = parseInt(this.weatherVolumeSlider.value, 10);
      this.weatherVolumeVal.textContent = `${vol}%`;
      this.sounds.setAmbienceVolume(vol / 100);
    });

    // 17. Toggle FPS
    this.toggleFpsBtn?.addEventListener('click', () => {
      this.showFps = !this.showFps;
      this.toggleFpsBtn.textContent = `Show FPS: ${this.showFps ? 'ON' : 'OFF'}`;
      this.sounds.playClick();
      if (!this.debugScreen.isVisible && this.showFps) {
        this.debugScreen.toggle();
      } else if (this.debugScreen.isVisible && !this.showFps) {
        this.debugScreen.toggle();
      }
    });

    // 21. Touch Controls Toggle
    this.touchControlsBtn?.addEventListener('click', () => {
      this.touchControlsEnabled = !this.touchControlsEnabled;
      this.player.controls.setTouchEnabled(this.touchControlsEnabled);
      this.touchControlsBtn!.textContent = `Touch Controls: ${this.touchControlsEnabled ? 'ON' : 'OFF'}`;
      this.sounds.playClick();
    });

    // 22. Touch Sensitivity Slider
    this.touchSensitivitySlider?.addEventListener('input', () => {
      const val = parseInt(this.touchSensitivitySlider!.value, 10);
      if (this.touchSensitivityVal) {
        this.touchSensitivityVal.textContent = `${val}%`;
      }
      this.touchSensitivityPercent = val;
      this.player.controls.setTouchSensitivity(val / 100);
    });

    // 23. Invert Touch Pitch
    this.touchInvertPitchBtn?.addEventListener('click', () => {
      this.touchInvertPitch = !this.touchInvertPitch;
      this.player.controls.setTouchInvertPitch(this.touchInvertPitch);
      this.touchInvertPitchBtn!.textContent = `Invert Touch Pitch (Y): ${this.touchInvertPitch ? 'ON' : 'OFF'}`;
      this.sounds.playClick();
    });

    // 24. Touch Tap Mode
    this.touchTapModeBtn?.addEventListener('click', () => {
      this.touchTapMode = this.touchTapMode === 'place' ? 'mine' : 'place';
      this.player.controls.setTouchTapMode(this.touchTapMode);
      this.touchTapModeBtn!.textContent = `Touch Action: ${
        this.touchTapMode === 'place' ? 'Tap Place / Hold Mine' : 'Tap Mine / Hold Place'
      }`;
      this.sounds.playClick();
    });

    // 25. Pinch to Zoom
    this.touchPinchZoomBtn?.addEventListener('click', () => {
      this.touchPinchZoom = !this.touchPinchZoom;
      this.player.controls.setTouchPinchZoom(this.touchPinchZoom);
      this.touchPinchZoomBtn!.textContent = `Pinch to Zoom: ${this.touchPinchZoom ? 'ON' : 'OFF'}`;
      this.sounds.playClick();
    });

    // 26. Virtual Touch D-Pad
    this.touchVirtualPadBtn?.addEventListener('click', () => {
      this.touchVirtualPadEnabled = !this.touchVirtualPadEnabled;
      if (this.touchVirtualPadEnabled) {
        this.touchMovementOverlay?.classList.remove('hidden');
        document.body.classList.add('has-touch');
      } else {
        this.touchMovementOverlay?.classList.add('hidden');
      }
      this.touchVirtualPadBtn!.textContent = `Touch D-Pad (Move): ${this.touchVirtualPadEnabled ? 'ON' : 'OFF'}`;
      this.sounds.playClick();
    });

    // 27. Reset Options to Defaults
    this.resetOptionsBtn?.addEventListener('click', () => {
      this.sounds.playClick();
      this.currentResolution = '1080p';
      this.resolutionSelect.value = '1080p';
      this.currentRenderScale = 1.0;
      this.renderScaleSlider.value = '100';
      this.renderScaleVal.textContent = '100%';
      this.fovSlider.value = '75';
      this.fovVal.textContent = '75';
      this.player.baseFov = 75;
      this.player.targetFov = 75;
      this.player.camera.fov = 75;
      this.player.camera.updateProjectionMatrix();
      this.renderSlider.value = '6';
      this.renderVal.textContent = '6';
      this.world.renderDistance = 6;
      this.fpsLimitSelect.value = '0';
      this.gameCallbacks?.setTargetFps(0);

      this.currentGraphicsPreset = 'rtx';
      this.graphicsPresetBtn.textContent = 'Graphics: RTX Ultra';
      this.currentShadowRes = 2048;
      this.shadowQualityBtn.textContent = 'RTX Shadows: PCF Soft (2048)';
      this.godRaysEnabled = true;
      if (this.toggleGodRaysBtn) this.toggleGodRaysBtn.textContent = 'RTX God Rays: ON';
      this.bloomEnabled = true;
      if (this.toggleBloomBtn) this.toggleBloomBtn.textContent = 'RTX Bloom: ON';
      this.currentToneMapping = 'aces';
      this.toneMappingBtn.textContent = 'Tone Mapping: ACES Filmic';
      this.exposureSlider.value = '85';
      this.exposureVal.textContent = '85%';
      this.smoothLighting = true;
      this.toggleAoBtn.textContent = 'Smooth Lighting: ON';
      this.waterShimmer = true;
      this.toggleWaterReflBtn.textContent = 'Water Shimmer: ON';
      this.dayNight.setCloudQuality('fancy');
      this.cloudQualityBtn.textContent = 'Clouds: Fancy 3D Volumetric';
      this.dayLengthMinutes = 20;
      this.dayNight.setDayDuration(20);
      this.dayLengthBtn.textContent = 'Day Length: 20 min (Extended)';
      this.dayNight.fastNights = true;
      this.fastNightsBtn.textContent = 'Fast Nights: ON (4x Speed)';

      // Reset Touch settings
      this.touchControlsEnabled = true;
      if (this.touchControlsBtn) this.touchControlsBtn.textContent = 'Touch Controls: ON';
      this.player.controls.setTouchEnabled(true);
      this.touchSensitivityPercent = 100;
      if (this.touchSensitivitySlider) this.touchSensitivitySlider.value = '100';
      if (this.touchSensitivityVal) this.touchSensitivityVal.textContent = '100%';
      this.player.controls.setTouchSensitivity(1.0);
      this.touchInvertPitch = false;
      if (this.touchInvertPitchBtn) this.touchInvertPitchBtn.textContent = 'Invert Touch Pitch (Y): OFF';
      this.player.controls.setTouchInvertPitch(false);
      this.touchTapMode = 'place';
      if (this.touchTapModeBtn) this.touchTapModeBtn.textContent = 'Touch Action: Tap Place / Hold Mine';
      this.player.controls.setTouchTapMode('place');
      this.touchPinchZoom = true;
      if (this.touchPinchZoomBtn) this.touchPinchZoomBtn.textContent = 'Pinch to Zoom: ON';
      this.player.controls.setTouchPinchZoom(true);
      this.touchVirtualPadEnabled = false;
      if (this.touchVirtualPadBtn) this.touchVirtualPadBtn.textContent = 'Touch D-Pad (Move): OFF';
      this.touchMovementOverlay?.classList.add('hidden');

      const dims = this.gameCallbacks?.applyResolution('1080p', 1.0);
      if (dims) updateBadge(dims.width, dims.height);
      this.gameCallbacks?.setGraphicsPreset('rtx');
      this.gameCallbacks?.setToneMapping('aces');
      this.gameCallbacks?.setExposure(1.00);
      this.dayNight.setShadowResolution(2048);
      syncGraphicsUI();
    });

    // Initial UI synchronization
    syncGraphicsUI();
  }
}

