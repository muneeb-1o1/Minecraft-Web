export const RESOLUTION_PRESETS = {
  '1080p': { width: 1920, height: 1080 },
  '900p': { width: 1600, height: 900 },
  '720p': { width: 1280, height: 720 },
  '540p': { width: 960, height: 540 },
  '480p': { width: 854, height: 480 },
  '360p': { width: 640, height: 360 }
} as const;

export type ResolutionPreset = keyof typeof RESOLUTION_PRESETS | 'native';

export const MIN_RENDER_SCALE = 0.5;
export const MAX_RENDER_SCALE = 2;
export const MAX_RENDER_WIDTH = 1920;
export const MAX_RENDER_HEIGHT = 1080;

const MIN_RENDER_WIDTH = 320;
const MIN_RENDER_HEIGHT = 240;

export function normalizeRenderScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, scale));
}

/**
 * Calculates the internal render buffer size without relying on browser APIs.
 * The output is always bounded to 1080p so display resolution and render-scale
 * choices cannot accidentally allocate a 4K (or larger) WebGL buffer.
 */
export function calculateRenderDimensions(
  preset: string,
  requestedScale: number,
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number = 1
): { width: number; height: number; scale: number; preset: ResolutionPreset } {
  const safeViewportWidth = Math.max(1, Math.round(viewportWidth));
  const safeViewportHeight = Math.max(1, Math.round(viewportHeight));
  const safeDpr = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  const scale = normalizeRenderScale(requestedScale);
  const normalizedPreset: ResolutionPreset = preset in RESOLUTION_PRESETS
    ? preset as keyof typeof RESOLUTION_PRESETS
    : 'native';

  const base = normalizedPreset === 'native'
    ? { width: safeViewportWidth * safeDpr, height: safeViewportHeight * safeDpr }
    : RESOLUTION_PRESETS[normalizedPreset];

  let width = Math.max(MIN_RENDER_WIDTH, Math.round(base.width * scale));
  let height = Math.max(MIN_RENDER_HEIGHT, Math.round(base.height * scale));
  const capScale = Math.min(1, MAX_RENDER_WIDTH / width, MAX_RENDER_HEIGHT / height);

  width = Math.round(width * capScale);
  height = Math.round(height * capScale);

  return { width, height, scale, preset: normalizedPreset };
}
