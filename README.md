# Minecraft Web Edition

A block-building adventure that runs entirely in your browser. Explore procedurally generated terrain, gather resources, craft equipment, build shelters, and shape your own world in this single-player voxel sandbox powered by TypeScript, Three.js, and WebGL.

> **An independent browser project — not affiliated with or endorsed by Mojang or Microsoft.**

## Play instantly

[**Launch Minecraft Web Edition →**](https://minecraft-web-2nn.pages.dev/)

No download, installation, or account is required. Open the live demo and start a world directly in your browser. Desktop and touch controls are supported through the in-game settings.

## What you can do

- **Explore living worlds** — Traverse procedurally generated terrain with caves, fluids, weather, day/night cycles, clouds, fog, and lighting effects.
- **Mine and build** — Break blocks, collect materials, place structures, and turn raw resources into a base of your own.
- **Survive and progress** — Manage health and hunger, gather food, craft tools and armor, gain experience, and face hostile mobs.
- **Craft and trade** — Use the 2×2 and 3×3 crafting grids, smelt materials, store items in chests, trade with villagers, and enchant your gear.
- **Choose your play style** — Play Survival for resource gathering and progression, or switch to Creative for flight, unlimited blocks, and instant building.
- **Tune the experience** — Adjust render distance, resolution, field of view, frame rate, graphics quality, audio, weather, and touch controls.

## Controls

### Keyboard and mouse

| Action | Control |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Jump | `Space` |
| Sneak / descend while flying | `Shift` |
| Look around | Mouse |
| Mine / break a block | Hold left click |
| Place a block / interact | Right click |
| Select hotbar slot | `1`–`9` or mouse wheel |
| Open inventory and crafting | `E` |
| Drop held item | `Q` |
| Change perspective | `C` |
| Toggle debug information | `F3` |
| Pause / close a window | `Esc` |
| Toggle Creative flight | `F` |

Touch controls, virtual movement controls, pinch-to-zoom, and touch sensitivity settings are available in **Options → Touch & Controls**.

## Run it locally

You need Node.js and npm installed.

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal, usually `http://localhost:5173`.

Useful commands:

```sh
npm test       # run the headless logic tests
npm run build  # type-check and create a production build
npm run preview # preview the production build locally
```

## Project map

- `src/main.ts` — application composition, render loop, and lifecycle
- `src/world/` — blocks, procedural terrain, chunks, fluids, and world streaming
- `src/player/` — movement, collision, input, and player model
- `src/gameplay/` — inventory, crafting, interaction, furnaces, chests, redstone, weather, and progression
- `src/entities/` — mobs and projectiles
- `src/ui/` — title screen, menus, HUD, inventory, and overlays
- `src/textures/`, `src/audio/`, `src/shaders/` — procedural textures, synthesized audio, and visual effects
- `test/minecraft.test.ts` — headless gameplay and logic tests

## Current status and limitations

This is an actively developed single-player browser game. The live build is playable, but it is not a multiplayer server or a replacement for the official Minecraft game.

- There is currently no networking or multiplayer support.
- World metadata is stored in browser local storage. Player inventory, terrain edits, loaded chunks, and all runtime state are not yet fully persisted.
- The automated test suite focuses on headless game logic; browser-level gameplay tests are not yet included.
- The internal render buffer is capped at 1920×1080 to keep GPU and memory usage predictable. The canvas still adapts to the browser viewport.
- The production `dist/` directory is generated during builds and is not committed.

## Built with

[TypeScript](https://www.typescriptlang.org/) · [Vite](https://vitejs.dev/) · [Three.js](https://threejs.org/) · WebGL · Web Audio API
