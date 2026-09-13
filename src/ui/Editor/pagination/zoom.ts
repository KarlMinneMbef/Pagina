// Paliers de zoom — mêmes valeurs que CasualOffice/docs (useWheelZoom.ts),
// gardées comme référence pour rester dans les habitudes Word/Google Docs.
// Contrairement à eux, on n'importe pas leur hook (417 lignes, gestion fine
// de la molette/trackpad) : notre propre gestion Ctrl+molette dans
// MarkdownEditor.tsx suffit pour nos besoins actuels.
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

export const MIN_ZOOM = ZOOM_PRESETS[0];
export const MAX_ZOOM = ZOOM_PRESETS[ZOOM_PRESETS.length - 1];

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export function nextZoomPreset(zoom: number): number {
  const next = ZOOM_PRESETS.find((p) => p > zoom + 0.001);
  return next ?? MAX_ZOOM;
}

export function previousZoomPreset(zoom: number): number {
  const prev = [...ZOOM_PRESETS].reverse().find((p) => p < zoom - 0.001);
  return prev ?? MIN_ZOOM;
}
