// Table fonts: bundled (no CDN), cover Turkish characters. Canvas textures drawn before fonts load
// fall back to a substitute font, so the engine defers its first draw until fontsReady().
import '@fontsource-variable/inter';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/800.css';
import '@fontsource/playfair-display/400-italic.css';

export const UI_FONT = '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
export const SERIF_FONT = '"Playfair Display", Georgia, "Times New Roman", serif';

const FACES = ['400 16px "Inter Variable"', '600 16px "Inter Variable"', '800 16px "Inter Variable"', '600 16px "Playfair Display"', '700 16px "Playfair Display"', '800 16px "Playfair Display"', 'italic 400 16px "Playfair Display"'];
let ready = null;

// waits at most `timeout` ms; the table opens even if fonts don't arrive
export function fontsReady(timeout = 1500) {
  if (!ready) {
    const load = typeof document !== 'undefined' && document.fonts?.load
      ? Promise.all(FACES.map((f) => document.fonts.load(f, 'AaĞğİıŞşÇçÖöÜü0123').catch(() => null)))
      : Promise.resolve();
    ready = load.then(() => true);
  }
  return Promise.race([ready, new Promise((r) => setTimeout(() => r(false), timeout))]);
}
