# Minecraft Web Edition

A single-player, browser-based voxel sandbox built with TypeScript, Vite, and Three.js. The game renders procedural block terrain in WebGL and includes a survival-oriented player, inventory, crafting, mobs, and more.

## Play online

[**Play Minecraft Web Edition in your browser**](https://minecraft-web-2nn.pages.dev/)

No installation or local setup is required. Open the link above to start playing.

## Run locally

```sh
npm install
npm run dev
```

Open the local Vite address printed in the terminal (normally `http://localhost:5173`).

```sh
npm test       # unit and logic tests
npm run build  # TypeScript check and production build
npm run preview
```

## Controls

- `W`, `A`, `S`, `D`: move; `Space`: jump; `Shift`: sneak
- Mouse: look; hold left click to mine; right click to place or interact
- `1`–`9` / mouse wheel: hotbar; `E`: inventory; `Q`: drop item
- `C`: camera mode; `F3`: debug info; `Esc`: pause; `F`: creative flight

Touch controls are available through the game settings.

## Project map

- `src/main.ts` — game composition, render loop, and application lifecycle
- `src/world/` — block definitions, noise/terrain generation, chunks, fluids, and world streaming
- `src/player/` — movement, collision, input, and player model
- `src/gameplay/` — inventory, crafting, block interaction, furnaces, chests, redstone, weather, and progression
- `src/entities/` — mobs and projectiles
- `src/ui/` — menus, HUD, inventories, and overlays
- `src/textures/`, `src/audio/`, `src/shaders/` — procedural textures, synthesized sound, and post-processing
- `test/minecraft.test.ts` — headless logic tests

## Current limitations

- The game is local single-player only; it has no networking or multiplayer server.
- The world selection screen stores world metadata in browser local storage. It does not yet persist player inventory, terrain edits, loaded chunks, or all runtime state.
- Tests focus on headless logic. There is not yet an automated browser-level gameplay test suite.
- Graphics settings cap the internal render buffer at 1920×1080 for predictable memory and GPU usage; the browser still displays the canvas at the viewport size.
- `dist/` is a generated build output and is not source-controlled.
