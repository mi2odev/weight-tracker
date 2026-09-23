/**
 * Cuts every asset in `assets/` from the Weighpoint logo.
 *
 * The source of truth is `assets/source/weighpoint-logo.webp`, and the rule
 * here is that the logo goes out **whole** — scale, trend line and wordmark —
 * wherever the platform allows it. An earlier version of this script took the
 * logo apart and rebuilt it, which produced a launcher icon that was just the
 * scale mark on a gradient: recognisably related to the brand, and not the
 * thing anyone asked for.
 *
 *     npx playwright@latest --version   # once, to have the package
 *     node tools/generate-icons.mjs
 *
 * Playwright is not a project dependency: this runs by hand when the brand
 * changes, not as part of a build. Set CHROMIUM to point at a browser if
 * Playwright cannot find one.
 *
 * The only two liberties taken, both forced by the platforms:
 *
 * - **The artboard's white margin is trimmed.** It is padding around the tile,
 *   not part of the design, and leaving it in puts a pale frame inside every
 *   icon. The corners the trim exposes are filled with the tile's own corner
 *   colour, because iOS applies its own rounding and a pre-rounded tile would
 *   otherwise show pale notches.
 * - **Android insets the logo into the adaptive safe zone.** The launcher
 *   crops the outer third of a foreground layer, which would cut the wordmark
 *   in half. Scaling the whole logo down to fit means it survives every mask
 *   shape intact.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'assets');
const SOURCE = resolve(OUT, 'source', 'weighpoint-logo.webp');

mkdirSync(OUT, { recursive: true });
const dataUri = `data:image/webp;base64,${readFileSync(SOURCE).toString('base64')}`;

const browser = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
});
const page = await browser.newPage({ viewport: { width: 64, height: 64 } });

/** Where the tile sits inside the artboard, and what colour its corners are. */
const logo = await page.evaluate(async (src) => {
  const img = await new Promise((done, fail) => {
    const i = new Image();
    i.onload = () => done(i);
    i.onerror = fail;
    i.src = src;
  });

  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width: W, height: H } = ctx.getImageData(0, 0, img.width, img.height);

  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const isPaper = ([r, g, b, a]) => a < 24 || (r > 238 && g > 238 && b > 238);

  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (isPaper(at(x, y))) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const tile = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

  // Sampled 8% in: past the rounding, short of the artwork.
  const inset = Math.round(tile.w * 0.08);
  const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const topLeft = at(tile.x + inset, tile.y + inset);
  const bottomRight = at(tile.x + tile.w - inset, tile.y + tile.h - inset);

  return {
    tile,
    corner: {
      from: hex(topLeft),
      to: hex(bottomRight),
      mid: hex(topLeft.slice(0, 3).map((v, i) => Math.round((v + bottomRight[i]) / 2))),
    },
  };
}, dataUri);

console.log('tile  ', logo.tile);
console.log('corner', logo.corner);

/**
 * Draws the whole logo at `scale` of the canvas, centred.
 *
 * `bleed` fills behind it with the tile's corner gradient, for the assets that
 * must be opaque to the edge.
 */
async function render(file, size, { scale = 1, bleed = false, transparent = false, matte = false } = {}) {
  const base64 = await page.evaluate(
    async ({ src, size, scale, bleed, transparent, matte, l }) => {
      const img = await new Promise((done, fail) => {
        const i = new Image();
        i.onload = () => done(i);
        i.onerror = fail;
        i.src = src;
      });

      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');

      if (bleed) {
        const g = ctx.createLinearGradient(0, 0, size, size);
        g.addColorStop(0, l.corner.from);
        g.addColorStop(0.5, l.corner.mid);
        g.addColorStop(1, l.corner.to);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      } else if (!transparent) {
        ctx.fillStyle = l.corner.mid;
        ctx.fillRect(0, 0, size, size);
      }

      // The tile, whole, scaled and centred. Never cropped, never rebuilt.
      const side = size * scale;
      ctx.drawImage(
        img,
        l.tile.x, l.tile.y, l.tile.w, l.tile.h,
        (size - side) / 2, (size - side) / 2, side, side,
      );

      if (matte) {
        // Lift the artwork — scale, trend line, wordmark — off its tile, so
        // it can sit on the brand colour with no tile edge around it. The
        // tile is a dark teal gradient and the artwork is white and mint, so
        // each pixel's alpha is how far it rises above the tile colour at
        // that point, and its colour is un-mixed from the tile so the
        // anti-aliased edges don't carry a teal fringe.
        const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        const from = hexRgb(l.corner.from);
        const to = hexRgb(l.corner.to);
        const px = ctx.getImageData(0, 0, size, size);
        const d = px.data;
        const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            if (d[i + 3] === 0) continue;
            const t = Math.min(1, Math.max(0, (x + y) / (2 * size)));
            const bg = from.map((v, k) => v + (to[k] - v) * t);
            const rise = lum(d[i], d[i + 1], d[i + 2]) - lum(bg[0], bg[1], bg[2]);
            // The threshold sits above the tile's own glossy highlight (a
            // lighter teal sweep in the top corner), which would otherwise
            // come along as a faint smear.
            const a = Math.min(1, Math.max(0, (rise - 55) / 70)) * (d[i + 3] / 255);
            if (a <= 0.01) {
              d[i + 3] = 0;
              continue;
            }
            for (let k = 0; k < 3; k++) {
              d[i + k] = Math.min(255, Math.max(0, Math.round((d[i + k] - (1 - a) * bg[k]) / a)));
            }
            d[i + 3] = Math.round(a * 255);
          }
        }
        ctx.putImageData(px, 0, 0);
      }

      return c.toDataURL('image/png').split(',')[1];
    },
    { src: dataUri, size, scale, bleed, transparent, matte, l: logo },
  );

  writeFileSync(resolve(OUT, file), Buffer.from(base64, 'base64'));
  console.log('wrote', file, `${size}×${size}`);
}

// iOS: the logo edge to edge. iOS rounds it, so the bleed fills the corners
// the tile's own rounding leaves behind.
await render('icon.png', 1024, { scale: 1, bleed: true });

// Android adaptive: the background layer is the tile's own gradient, edge to
// edge, and the foreground is the artwork lifted off the tile. Putting the
// whole tile on the foreground drew a rounded square inside the launcher's
// own shape — a box in a box. Scaled so the wordmark stays inside the safe
// zone the launcher never crops.
await render('android-icon-background.png', 512, { scale: 0, bleed: true });
await render('android-icon-foreground.png', 512, { scale: 0.6, transparent: true, matte: true });

// Splash, and the in-app loading screen that continues it: the artwork on the
// brand colour, so the native splash and the JS one line up exactly.
await render('splash-icon.png', 1024, { scale: 1, transparent: true, matte: true });
await render('splash-icon-dark.png', 1024, { scale: 1, transparent: true, matte: true });
await render('favicon.png', 96, { scale: 1, bleed: true });

await browser.close();
