import * as THREE from 'three';
import { TextureAtlas } from './textures/TextureAtlas';
import { SoundManager } from './audio/SoundManager';
import { World } from './world/World';
import { Player } from './player/Player';
import { Controls } from './player/Controls';
import { Inventory } from './gameplay/Inventory';
import { CraftingManager } from './gameplay/Crafting';
import { BlockInteraction } from './gameplay/BlockInteraction';
import { DayNightCycle } from './gameplay/DayNightCycle';
import { HUD } from './ui/HUD';
import { InventoryGUI } from './ui/InventoryGUI';
import { DebugScreen } from './ui/DebugScreen';
import { PauseMenu } from './ui/PauseMenu';
import { MainMenu, WorldSaveMetadata } from './ui/MainMenu';
import { Chat } from './gameplay/Chat';
import { OptionsManager } from './ui/Options';
import { MobManager } from './entities/MobManager';
import { TradingGUI } from './ui/TradingGUI';
import { ItemEntity } from './gameplay/ItemEntity';
import { FurnaceManager } from './gameplay/FurnaceManager';
import { FurnaceGUI } from './ui/FurnaceGUI';
import { ChestManager } from './gameplay/ChestManager';
import { ChestGUI } from './ui/ChestGUI';
import { BedManager } from './gameplay/BedManager';
import { RTXPipeline } from './shaders/RTXPipeline';
import { WeatherSystem } from './gameplay/WeatherSystem';
import { PotionManager } from './gameplay/PotionManager';
import { AdvancementManager } from './gameplay/Advancements';
import { DeathScreen } from './ui/DeathScreen';
import { Block, ItemId } from './world/BlockTypes';
import { BiomeType } from './world/TerrainGenerator';
import { RedstoneManager } from './gameplay/RedstoneManager';
import { EnchantingGUI } from './ui/EnchantingGUI';
import { calculateRenderDimensions } from './config/GraphicsSettings';
import { SplashSystem } from './gameplay/SplashSystem';
import { ParticleEmitterSystem } from './gameplay/ParticleEmitter';

class Game {
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public rtxPipeline!: RTXPipeline;
  public weatherSystem!: WeatherSystem;
  public splashSystem!: SplashSystem;
  public particleEmitter!: ParticleEmitterSystem;

  // Systems
  public sounds!: SoundManager;
  public atlas!: TextureAtlas;
  public controls!: Controls;
  public world!: World;
  public player!: Player;
  public inventory!: Inventory;
  public crafting!: CraftingManager;
  public interaction!: BlockInteraction;
  public dayNight!: DayNightCycle;
  public mobManager!: MobManager;
  public potionManager!: PotionManager;
  public furnaceManager!: FurnaceManager;
  public chestManager!: ChestManager;
  public bedManager!: BedManager;
  public redstoneManager!: RedstoneManager;

  // UI
  public hud!: HUD;
  public inventoryGui!: InventoryGUI;
  public tradingGui!: TradingGUI;
  public furnaceGui!: FurnaceGUI;
  public chestGui!: ChestGUI;
  public enchantingGui!: EnchantingGUI;
  public debugScreen!: DebugScreen;
  public pauseMenu!: PauseMenu;
  public mainMenu!: MainMenu;
  public chat!: Chat;
  public options!: OptionsManager;
  public advancements!: AdvancementManager;
  public deathScreen!: DeathScreen;
  private caveAmbienceTimer: number = 30.0;
  private biomeAmbienceTimer: number = 8.0;

  public isInGame: boolean = false;
  public currentResolutionPreset: string = '1080p';
  public currentRenderScale: number = 1.0;
  public targetFps: number = 0;
  private fpsInterval: number = 0;
  private lastRenderTime: number = 0;
  private lastTime: number = 0;
  private titlePanoramaAngle: number = 0;

  constructor() {
    this.canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;

    // Three.js renderer setup with RTX ACESFilmic tone mapping
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Three.js scene & camera
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x78a7ff, 0.015);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    this.scene.add(this.camera);

    (window as any).game = this;
    this.initSystems();
    this.initEvents();
    this.setGraphicsPreset('rtx');
    this.applyResolution('1080p', 1.0);
    this.startLoop();
  }

  public applyResolution(preset: string, scale: number): { width: number; height: number } {
    const dimensions = calculateRenderDimensions(
      preset,
      scale,
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1
    );
    this.currentResolutionPreset = dimensions.preset;
    this.currentRenderScale = dimensions.scale;

    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(dimensions.width, dimensions.height, false);
    if (this.rtxPipeline) {
      this.rtxPipeline.setSize(dimensions.width, dimensions.height);
    }

    if (this.debugScreen) {
      this.debugScreen.setResolutionInfo(dimensions.preset, dimensions.scale, dimensions.width, dimensions.height);
    }

    return { width: dimensions.width, height: dimensions.height };
  }

  public setGraphicsPreset(preset: 'retro' | 'fancy' | 'rtx') {
    if (preset === 'rtx') {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.00;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.dayNight.setShadowResolution(2048);
      this.dayNight.setCloudQuality('fancy');
      this.world.setGraphicsPreset('rtx');
      this.rtxPipeline?.setGraphicsPreset('rtx');
    } else {
      // Clean Vanilla: authentic Minecraft lighting, linear sRGB tone mapping, crisp bright voxel colors without overexposure
      this.renderer.toneMapping = THREE.LinearToneMapping;
      this.renderer.toneMappingExposure = 0.58;
      this.renderer.shadowMap.enabled = false;
      this.dayNight.setShadowResolution(0);
      this.dayNight.setCloudQuality('fast');
      this.world.setGraphicsPreset('retro');
      this.rtxPipeline?.setGraphicsPreset('retro');
    }
  }

  public setExposure(val: number) {
    this.renderer.toneMappingExposure = val;
    if (this.rtxPipeline?.gradingPass?.uniforms?.exposure) {
      this.rtxPipeline.gradingPass.uniforms.exposure.value = val;
    }
  }

  public setToneMapping(mode: 'aces' | 'reinhard' | 'off') {
    if (mode === 'aces') {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    } else if (mode === 'reinhard') {
      this.renderer.toneMapping = THREE.ReinhardToneMapping;
    } else {
      this.renderer.toneMapping = THREE.NoToneMapping;
    }
  }

  public setTargetFps(fps: number) {
    this.targetFps = fps;
    this.fpsInterval = fps > 0 ? 1000 / fps : 0;
  }

  public toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  private initSystems() {
    this.sounds = new SoundManager();
    this.atlas = new TextureAtlas();
    this.controls = new Controls(this.canvas);
    this.crafting = new CraftingManager();
    this.inventory = new Inventory();

    // World with default seed
    this.world = new World(this.scene, this.atlas, 1337, 'default');
    this.dayNight = new DayNightCycle(this.scene);

    // Player
    this.player = new Player(this.camera, this.controls, this.world, this.sounds, this.atlas);
    this.player.inventory = this.inventory;

    // Block interaction
    this.interaction = new BlockInteraction(
      this.scene,
      this.world,
      this.player,
      this.controls,
      this.sounds,
      this.inventory,
      this.atlas
    );
    // Visual Effects: Dynamic Water Splash & Ripples, Atmospheric Particle Emitters
    this.splashSystem = new SplashSystem(this.scene, this.world);
    this.particleEmitter = new ParticleEmitterSystem(this.scene);
    this.interaction.splashSystem = this.splashSystem;
    this.interaction.particleEmitter = this.particleEmitter;

    this.player.onWaterSplash = (pos, count) => {
      this.splashSystem.spawnSplash(pos, count);
      this.interaction.spawnWaterSplashParticles(pos, count);
    };

    // Mobs Manager
    this.mobManager = new MobManager(this.scene, this.world, this.sounds);
    this.interaction.mobManager = this.mobManager;

    // Potion Manager
    this.potionManager = new PotionManager(this.player, this.scene, this.sounds);
    this.interaction.potionManager = this.potionManager;

    // UI Modules
    this.hud = new HUD(this.player, this.inventory, this.atlas);
    this.inventoryGui = new InventoryGUI(this.player, this.inventory, this.crafting, this.atlas);
    this.tradingGui = new TradingGUI(this.player, this.inventory, this.atlas, this.sounds);
    this.furnaceManager = new FurnaceManager();
    this.furnaceGui = new FurnaceGUI(this.player, this.inventory, this.furnaceManager, this.atlas, this.sounds);
    this.chestManager = new ChestManager();
    this.chestGui = new ChestGUI(this.player, this.inventory, this.chestManager, this.atlas, this.sounds);
    this.debugScreen = new DebugScreen(this.player, this.world);
    this.pauseMenu = new PauseMenu(this.player, this.sounds);
    this.mainMenu = new MainMenu(this.sounds);
    this.chat = new Chat(this.player, this.inventory, this.dayNight);
    // Dynamic Weather System
    this.weatherSystem = new WeatherSystem(this.scene, this.sounds);
    this.chat.weatherSystem = this.weatherSystem;

    // Redstone Circuit & Automation Engine
    this.redstoneManager = new RedstoneManager(this.world, this.sounds, this.scene);
    this.redstoneManager.setEntities(this.player, this.mobManager);
    this.interaction.redstoneManager = this.redstoneManager;
    this.redstoneManager.onSpawnDropItem = (id, count, pos) => {
      const item = new ItemEntity(this.scene, this.world, id, count, pos);
      this.interaction.itemEntities.push(item);
    };

    // Interactive Enchanting GUI
    this.enchantingGui = new EnchantingGUI(this.player, this.inventory, this.atlas, this.interaction.enchantingManager);

    // Advancement & Death Screen Systems
    this.advancements = new AdvancementManager(this.sounds);
    this.deathScreen = new DeathScreen(this.sounds);

    // Pass advancements to components
    this.interaction.advancements = this.advancements;
    this.inventoryGui.advancements = this.advancements;
    this.tradingGui.advancements = this.advancements;
    this.furnaceGui.advancements = this.advancements;

    // RTX Shaders & Post-processing Pipeline
    this.rtxPipeline = new RTXPipeline(this.renderer, this.scene, this.camera);

    this.options = new OptionsManager(
      this.player,
      this.world,
      this.sounds,
      this.dayNight,
      this.debugScreen,
      {
        applyResolution: (preset, scale) => this.applyResolution(preset, scale),
        setGraphicsPreset: (preset) => this.setGraphicsPreset(preset),
        setExposure: (val) => this.setExposure(val),
        setToneMapping: (mode) => this.setToneMapping(mode),
        setTargetFps: (fps) => this.setTargetFps(fps),
        toggleFullscreen: () => this.toggleFullscreen(),
        toggleGodRays: () => this.rtxPipeline.toggleGodRays(),
        toggleBloom: () => this.rtxPipeline.toggleBloom()
      },
      this.weatherSystem
    );

    // Trading & Combat callbacks
    this.interaction.onOpenTrading = () => {
      this.tradingGui.open();
    };

    this.interaction.onOpenFurnace = (pos) => {
      this.furnaceGui.open(pos);
    };

    this.interaction.onOpenChest = (pos) => {
      this.chestGui.open(pos);
    };

    this.interaction.onOpenEnchanting = (pos) => {
      this.enchantingGui.open(pos);
    };

    // Bed Manager & Sleep interaction
    this.bedManager = new BedManager(this.player, this.dayNight, this.sounds, this.chat);
    this.bedManager.advancements = this.advancements;
    this.interaction.onOpenBed = (pos) => {
      this.bedManager.trySleep(pos);
    };

    this.mobManager.onVillagerInteract = () => {
      this.tradingGui.open();
    };

    this.mobManager.onPlayerDamage = (dmg) => {
      this.player.takeDamage(dmg);
    };

    this.mobManager.onSpawnDropItem = (id, count, pos) => {
      const item = new ItemEntity(this.scene, this.world, id, count, pos);
      this.interaction.itemEntities.push(item);
      this.interaction.spawnExperienceOrbs(pos, 2, 1);
    };

    // Player Death & Respawn callbacks
    this.player.onDeath = () => {
      this.controls.unlockPointer();
      const score = Math.floor(this.player.level * 100 + this.player.xp * 7 + this.inventory.getItemCount(ItemId.DIAMOND) * 50);
      this.deathScreen.show(score);
    };

    this.deathScreen.onRespawn = () => {
      this.player.respawn();
      this.controls.lockPointer();
    };

    this.deathScreen.onQuitToTitle = () => {
      this.quitToTitle();
    };

    // Hook callbacks
    this.controls.onToggleInventory = () => {
      if (!this.isInGame || this.pauseMenu.isPaused || this.tradingGui.isOpen || this.furnaceGui.isOpen || this.chestGui.isOpen || this.enchantingGui.isOpen || this.deathScreen.isOpen) return;
      this.inventoryGui.toggle(false);
    };

    this.interaction.onOpenCraftingTable = () => {
      this.inventoryGui.open(true);
    };

    this.controls.onTogglePause = () => {
      if (!this.isInGame || this.deathScreen.isOpen) return;
      const optionsEl = document.getElementById('options-screen');
      const controlsEl = document.getElementById('controls-screen');

      if (this.enchantingGui.isOpen) {
        this.enchantingGui.close();
      } else if (this.furnaceGui.isOpen) {
        this.furnaceGui.close();
      } else if (this.chestGui.isOpen) {
        this.chestGui.close();
      } else if (this.tradingGui.isOpen) {
        this.tradingGui.close();
      } else if (this.inventoryGui.isOpen) {
        this.inventoryGui.close();
      } else if (optionsEl && !optionsEl.classList.contains('hidden')) {
        optionsEl.classList.add('hidden');
      } else if (controlsEl && !controlsEl.classList.contains('hidden')) {
        controlsEl.classList.add('hidden');
      } else {
        // Toggle in/out of pointer lock directly with Escape
        this.pauseMenu.toggle();
      }
    };

    this.controls.onPointerUnlock = () => {
      if (
        this.isInGame &&
        !this.inventoryGui.isOpen &&
        !this.tradingGui.isOpen &&
        !this.furnaceGui.isOpen &&
        !this.chestGui.isOpen &&
        !this.enchantingGui.isOpen &&
        !this.chat.isOpen &&
        !this.deathScreen.isOpen
      ) {
        this.pauseMenu.open();
      }
    };

    this.controls.onPointerLock = () => {
      if (this.isInGame) {
        this.pauseMenu.close();
        document.getElementById('options-screen')?.classList.add('hidden');
        document.getElementById('controls-screen')?.classList.add('hidden');
      }
    };

    this.controls.onToggleFly = () => {
      if (!this.isInGame) return;
      if (this.player.gameMode === 'creative') {
        this.player.isFlying = !this.player.isFlying;
      }
    };

    this.controls.onToggleDebug = () => {
      if (this.isInGame) {
        this.debugScreen.toggle();
      }
    };

    this.controls.onOpenChat = () => {
      if (this.isInGame && !this.pauseMenu.isPaused && !this.inventoryGui.isOpen) {
        this.chat.open();
      }
    };

    this.controls.onDropItem = () => {
      if (!this.isInGame) return;
      const stack = this.inventory.getSelectedItem();
      if (stack) {
        this.inventory.removeFromSlot(this.inventory.getSelectedSlot(), 1);
        const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
        const dropPos = this.player.position.clone().add(new THREE.Vector3(0, 1.4, 0)).add(lookDir.clone().multiplyScalar(0.8));
        this.interaction.breakBlock(dropPos, stack.id); // Drops item entity
      }
    };

    this.controls.onSlotSelect = (slotDeltaOrIndex: number) => {
      if (slotDeltaOrIndex < 0 || slotDeltaOrIndex > 8) {
        // Delta from wheel
        const current = this.inventory.getSelectedSlot();
        this.inventory.setSelectedSlot(current + slotDeltaOrIndex);
      } else {
        // Direct number index
        this.inventory.setSelectedSlot(slotDeltaOrIndex);
      }
      this.sounds.playClick();
    };

    // Main menu start world callback
    this.mainMenu.onStartWorld = (meta: WorldSaveMetadata) => {
      this.startWorld(meta);
    };

    // Pause menu quit to title callback
    this.pauseMenu.onQuitToTitle = () => {
      this.quitToTitle();
    };

    // Pre-generate title panorama chunk
    this.world.updateAroundPlayer(0, 0);
  }

  private initEvents() {
    window.addEventListener('resize', () => {
      this.applyResolution(this.currentResolutionPreset, this.currentRenderScale);
    });
  }

  private startWorld(meta: WorldSaveMetadata) {
    this.isInGame = true;
    this.player.gameMode = meta.gameMode;
    this.player.isFlying = meta.gameMode === 'creative';

    // Reinitialize world with chosen seed and world type
    this.world.dispose();
    this.mobManager.dispose();
    this.world = new World(this.scene, this.atlas, meta.seed, meta.worldType);
    this.player.world = this.world;
    this.interaction.world = this.world;

    this.mobManager = new MobManager(this.scene, this.world, this.sounds);
    this.interaction.mobManager = this.mobManager;
    this.mobManager.onVillagerInteract = () => {
      this.tradingGui.open();
    };
    this.mobManager.onPlayerDamage = (dmg) => {
      this.player.takeDamage(dmg);
    };
    this.mobManager.onSpawnDropItem = (id, count, pos) => {
      const item = new ItemEntity(this.scene, this.world, id, count, pos);
      this.interaction.itemEntities.push(item);
      this.interaction.spawnExperienceOrbs(pos, 2, 1);
    };

    // Reinitialize furnace, chest, and redstone systems for this world
    this.furnaceManager = new FurnaceManager();
    this.furnaceGui.furnaceManager = this.furnaceManager;
    this.chestManager = new ChestManager();
    this.chestGui.chestManager = this.chestManager;
    this.redstoneManager.dispose();
    this.redstoneManager = new RedstoneManager(this.world, this.sounds, this.scene);
    this.redstoneManager.setEntities(this.player, this.mobManager);
    this.interaction.redstoneManager = this.redstoneManager;
    this.redstoneManager.onSpawnDropItem = (id, count, pos) => {
      const item = new ItemEntity(this.scene, this.world, id, count, pos);
      this.interaction.itemEntities.push(item);
    };

    // Generate spawn chunks immediately
    this.world.generateImmediateSpawnArea(0, 0);
    this.world.updateAroundPlayer(0, 0, 0.016);

    // Find dry solid surface position at or near spawn
    const spawnLoc = this.world.getSafeSpawnLocation(0, 0);
    this.player.setPosition(spawnLoc.x + 0.5, spawnLoc.y + 1.2, spawnLoc.z + 0.5);

    // Populate a few natural grazing animals in distant meadows (sparse & realistic)
    this.mobManager.spawnNaturalHerds(this.player.position);

    // Ensure bright sunny morning/midday at world start
    this.dayNight.time = 6000;
    this.dayNight.update(0, this.player.position);

    // Ensure texture atlas offset is perfectly aligned
    this.atlas.texture.offset.set(0, 0);

    this.deathScreen.hide();
    this.hud.show();
    this.sounds.startAmbientMusic();
    this.controls.lockPointer();
  }

  private quitToTitle() {
    this.isInGame = false;
    this.controls.unlockPointer();
    this.deathScreen.hide();
    this.hud.hide();
    this.inventoryGui.close();
    this.tradingGui.close();
    this.furnaceGui.close();
    this.chestGui.close();
    this.mainMenu.showTitleScreen();
    this.sounds.stopAmbientMusic();
  }

  private startLoop() {
    this.lastTime = performance.now();

    const loop = (now: number) => {
      requestAnimationFrame(loop);

      if (this.fpsInterval > 0) {
        const elapsed = now - this.lastRenderTime;
        if (elapsed < this.fpsInterval) return;
        this.lastRenderTime = now - (elapsed % this.fpsInterval);
      } else {
        this.lastRenderTime = now;
      }

      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;

      // Update animated textures (water flow waves & caustics)
      this.atlas.update(dt, now * 0.001);

      if (this.isInGame) {
        if (!this.pauseMenu.isPaused && !this.inventoryGui.isOpen && !this.tradingGui.isOpen && !this.furnaceGui.isOpen && !this.chestGui.isOpen && !this.chat.isOpen && !this.deathScreen.isOpen) {
          this.player.update(dt);
          this.interaction.update(dt);
          this.mobManager.update(dt, this.player.position, this.dayNight, this.player.currentHeldItemId);
          this.potionManager.update(dt);
          this.dayNight.isNightVisionActive = this.player.hasNightVision;
          this.dayNight.update(dt, this.player.position);
          this.world.updateAroundPlayer(this.player.position.x, this.player.position.z, dt);
          this.hud.update();

          // Subterranean Cave Drone Ambience
          if (this.player.position.y < 45 && this.world.currentDimension === 'overworld') {
            this.caveAmbienceTimer -= dt;
            if (this.caveAmbienceTimer <= 0) {
              this.sounds.playCaveDrone();
              this.caveAmbienceTimer = 45.0 + Math.random() * 60.0;
            }
          } else {
            this.caveAmbienceTimer = Math.max(this.caveAmbienceTimer - dt * 0.2, 10.0);
          }

          // Biome-specific Surface Ambient Soundscapes
          if (this.player.position.y >= 30 && this.world.currentDimension === 'overworld') {
            this.biomeAmbienceTimer -= dt;
            if (this.biomeAmbienceTimer <= 0) {
              const px = this.player.position.x;
              const py = this.player.position.y;
              const pz = this.player.position.z;
              const biome = this.world.generator.getBiome(px, pz);

              // Check if near water coast/river
              let isNearWater = biome === BiomeType.OCEAN;
              if (!isNearWater && py <= 33) {
                const bx = Math.floor(px);
                const by = Math.floor(py);
                const bz = Math.floor(pz);
                for (let ox = -3; ox <= 3 && !isNearWater; ox += 3) {
                  for (let oz = -3; oz <= 3 && !isNearWater; oz += 3) {
                    if (this.world.getBlock(bx + ox, by, bz + oz) === Block.WATER ||
                        this.world.getBlock(bx + ox, by - 1, bz + oz) === Block.WATER) {
                      isNearWater = true;
                    }
                  }
                }
              }

              if (py > 48 || biome === BiomeType.MOUNTAINS) {
                this.sounds.playWindAmbience();
              } else if (isNearWater) {
                this.sounds.playWaterLapping();
              } else if (biome === BiomeType.FOREST) {
                this.sounds.playForestBreeze();
              } else {
                this.sounds.playWindAmbience();
              }

              this.biomeAmbienceTimer = 25.0 + Math.random() * 35.0;
            }
          }

          // Aqua Voyager advancement when exploring underwater
          if (this.player.isHeadUnderwater) {
            this.advancements.award('aqua_voyager');
          }
        }

        // Update sleeping sequence
        this.bedManager.update(dt);

        // Update active furnace cooking and fuel consumption
        this.furnaceManager.update(dt);
        if (this.furnaceGui.isOpen) {
          this.furnaceGui.render();
        }

        // Update Weather System (advances rain intensity and lightning flashes)
        this.weatherSystem.update(dt, this.player.position, this.dayNight);

        // Update Water Splash & Ripple System
        this.splashSystem.update(dt);

        // Update Torch & Campfire Atmospheric Particle Emitters
        const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.particleEmitter.update(
          dt,
          this.player.position,
          this.world,
          this.player.currentHeldItemId,
          lookDir
        );

        // Atmosphere & Fog updates
        if (this.world.currentDimension === 'nether') {
          if (this.scene.fog instanceof THREE.FogExp2) {
            (this.scene.fog as any).userData = { isUnderwater: false };
            this.scene.fog.color.setHex(0x350808);
            this.scene.fog.density = 0.024;
          }
        } else if (this.player.isHeadUnderwater) {
          if (this.scene.fog instanceof THREE.FogExp2) {
            (this.scene.fog as any).userData = { isUnderwater: true };
            this.scene.fog.color.setHex(0x0a284e);
            this.scene.fog.density = 0.045;
          }
        } else {
          if (this.scene.fog instanceof THREE.FogExp2) {
            (this.scene.fog as any).userData = { isUnderwater: false };
            const baseSky = this.dayNight.getSkyColor().clone();
            const horizonRayleigh = this.dayNight.getAtmosphericHorizonColor();
            if (this.dayNight.getSunElevation() > -0.12 && this.dayNight.getSunElevation() < 0.22) {
              baseSky.lerp(horizonRayleigh, 0.38);
            }
            if (this.weatherSystem.rainIntensity > 0.01) {
              baseSky.lerp(new THREE.Color(0x3e4754), this.weatherSystem.rainIntensity * 0.75);
            }

            // Subterranean cave atmosphere: fade sky fog to dark cave fog when underground
            const px = Math.floor(this.player.position.x);
            const pz = Math.floor(this.player.position.z);
            const surfaceY = this.world.generator.getHeight(px, pz);
            const depthUnderground = (surfaceY - 2.5) - this.player.position.y;
            const undergroundFactor = THREE.MathUtils.clamp(depthUnderground / 6.0, 0.0, 1.0);

            if (undergroundFactor > 0.01) {
              const caveFogColor = new THREE.Color(0x0a0c10); // Authentic deep cave dark fog
              baseSky.lerp(caveFogColor, undergroundFactor * 0.94);
            }

            // Dynamic horizon fog scaling tailored to active render distance
            const targetFogDist = Math.max(64, this.world.renderDistance * 16.0);
            const horizonDensity = 1.9 / targetFogDist;

            // Thunderstorm instantaneous lightning flash illumination & fog brightening
            const lightningFactor = this.weatherSystem.getLightningIntensity();
            const baseDensity = THREE.MathUtils.lerp(
              horizonDensity + this.weatherSystem.rainIntensity * 0.012,
              0.035,
              undergroundFactor
            );

            if (lightningFactor > 0.005) {
              const brilliantWhite = new THREE.Color(0xf2f7ff);
              baseSky.lerp(brilliantWhite, lightningFactor * (1.0 - undergroundFactor * 0.7) * 0.96);
              this.scene.fog.color.copy(baseSky);
              this.scene.fog.density = baseDensity * (1.0 - lightningFactor * 0.45);
              this.scene.background = baseSky;
            } else {
              this.scene.fog.color.copy(baseSky);
              this.scene.fog.density = baseDensity;
              if (undergroundFactor > 0.5) {
                this.scene.background = baseSky;
              }
            }
          }
        }

        this.debugScreen.update(now);
      } else {
        // Rotating 3D panorama on title screen
        this.titlePanoramaAngle += dt * 0.08;
        const radius = 24;
        const camX = Math.sin(this.titlePanoramaAngle) * radius;
        const camZ = Math.cos(this.titlePanoramaAngle) * radius;
        this.camera.position.set(camX, 36, camZ);
        this.camera.lookAt(0, 32, 0);
        this.dayNight.update(dt, new THREE.Vector3(0, 32, 0));
      }

      // Update RTX shaders sun and atmosphere
      const isHeadUnderwater = this.isInGame && this.player ? this.player.isHeadUnderwater : false;
      this.rtxPipeline.updateSun(
        this.dayNight.getSunPosition(),
        this.dayNight.getSunElevation(),
        now * 0.001,
        isHeadUnderwater
      );

      this.rtxPipeline.render(dt);
    };

    requestAnimationFrame(loop);
  }
}

// Boot game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
