/**
 * Regenerates everything in `assets/` from the Weighpoint logo.
 *
 * The source of truth is `assets/source/weighpoint-logo.webp`: one artboard
 * holding a rounded teal tile, the scale-and-trend mark, and the wordmark.
 * Every asset the app ships is cut from it here rather than kept as a set of
 * unrelated binaries, so a change to the logo needs one re-run, not six
 * exports.
 *
 *     npx playwright@latest --version   # once, to have the package
 *     node tools/generate-icons.mjs
 *
 * Playwright is not a project dependency: this runs by hand when the brand
 * changes, not as part of a build. Set CHROMIUM to point at a browser if
 * Playwright cannot find one.
 *
 * Three things the artboard cannot be used for as-is:
 *
 * - **iOS masks its own corners.** Shipping a pre-rounded tile gives a double
 *   rounding with pale corners showing through, so the icon is drawn on a
 *   full-bleed gradient sampled from the tile itself and the tile laid over
 *   it; the rounding then falls where iOS puts it.
 * - **Android composites a foreground over a background** and crops the outer
 *   third. The mark is keyed off the tile by luminance and scaled into the
 *   safe zone, with the gradient supplied separately.
 * - **The wordmark does not survive being shrunk** to a 48px favicon or a
 *   launcher icon, so anything small uses the mark alone.
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

const assets = await page.evaluate(async (src) => {
  const img = await new Promise((done, fail) => {
    const i = new Image();
    i.onload = () => done(i);
    i.onerror = fail;
    i.src = src;
  });

  const work = document.createElement('canvas');
  work.width = img.width;
  work.height = img.height;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(img, 0, 0);
  const { data, width: W, height: H } = wctx.getImageData(0, 0, img.width, img.height);

  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const luma = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  /** The artboard's white margin, as opposed to the tile. */
  const isPaper = ([r, g, b, a]) => a < 24 || (r > 238 && g > 238 && b > 238);

  // ── the tile, without the artboard's margin ───────────────────────────────
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

  // The gradient runs corner to corner. Sampled at 8% in: far enough past the
  // rounding to miss the pale artboard, close enough to the corners to miss
  // the artwork — a 30% inset lands on the trend line and reads mint green.
  const inset = Math.round(tile.w * 0.08);
  const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const from = at(tile.x + inset, tile.y + inset);
  const to = at(tile.x + tile.w - inset, tile.y + tile.h - inset);
  const gradient = {
    from: hex(from),
    to: hex(to),
    // Interpolated rather than sampled, for the same reason.
    mid: hex(from.slice(0, 3).map((v, i) => Math.round((v + to[i]) / 2))),
  };

  // ── the mark, above the wordmark ──────────────────────────────────────────
  // Rows are scored by how much bright ink they carry. The layout is: padding,
  // the scale, a gap, the lettering, padding. So the mark ends at the *first*
  // quiet run below the scale — not the longest, which is the padding under
  // the wordmark and swallows the lettering whole.
  const rowInk = [];
  for (let y = tile.y; y <= tile.y + tile.h; y++) {
    let n = 0;
    for (let x = tile.x; x <= tile.x + tile.w; x += 2) if (luma(at(x, y)) > 0.55) n++;
    rowInk.push(n);
  }
  const quiet = Math.max(2, Math.max(...rowInk) * 0.02);
  const minGap = Math.round(tile.h * 0.025);

  const firstInk = rowInk.findIndex((n) => n > quiet);
  let gapStart = rowInk.length;
  for (let i = Math.round(tile.h * 0.4), run = 0; i < rowInk.length; i++) {
    run = rowInk[i] <= quiet ? run + 1 : 0;
    if (run >= minGap) {
      gapStart = i - run + 1;
      break;
    }
  }

  // Tight horizontal bounds too, so the mark centres on its own ink rather
  // than on the tile's padding.
  let mx0 = tile.x + tile.w;
  let mx1 = tile.x;
  for (let y = tile.y + firstInk; y < tile.y + gapStart; y += 2) {
    for (let x = tile.x; x <= tile.x + tile.w; x += 2) {
      if (luma(at(x, y)) <= quiet / 100 + 0.55) continue;
      if (x < mx0) mx0 = x;
      if (x > mx1) mx1 = x;
    }
  }
  const mark = {
    x: mx0,
    y: tile.y + firstInk,
    w: mx1 - mx0,
    h: gapStart - firstInk,
  };

  return { tile, mark, gradient, natural: { w: W, h: H } };
}, dataUri);

console.log('source          ', assets.natural);
console.log('tile            ', assets.tile);
console.log('mark (no words) ', assets.mark);
console.log('gradient        ', assets.gradient);

/**
 * Renders one asset. `draw` runs in the page with a 2D context, the loaded
 * image and the measurements above.
 */
async function render(file, size, draw, { opaque = false } = {}) {
  const base64 = await page.evaluate(
    async ({ src, size, body, a, opaque }) => {
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

      /** The tile's gradient, corner to corner across the whole canvas. */
      const fillGradient = () => {
        const g = ctx.createLinearGradient(0, 0, size, size);
        g.addColorStop(0, a.gradient.from);
        g.addColorStop(0.5, a.gradient.mid);
        g.addColorStop(1, a.gradient.to);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      };

      /** Draws a region of the source, scaled to fit a box on the canvas. */
      const drawRegion = (r, box) => {
        const scale = Math.min(box.w / r.w, box.h / r.h);
        const w = r.w * scale;
        const h = r.h * scale;
        ctx.drawImage(img, r.x, r.y, r.w, r.h, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
      };

      /**
       * Keeps only the bright ink of a region, on transparency.
       *
       * The mark is white and mint on a dark tile, so luminance separates them
       * cleanly. A soft ramp rather than a hard cut, or the curves alias.
       */
      const keyRegion = (r, box) => {
        const t = document.createElement('canvas');
        t.width = size;
        t.height = size;
        const tctx = t.getContext('2d', { willReadFrequently: true });
        const scale = Math.min(box.w / r.w, box.h / r.h);
        const w = r.w * scale;
        const h = r.h * scale;
        tctx.drawImage(img, r.x, r.y, r.w, r.h, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);

        const id = tctx.getImageData(0, 0, size, size);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          // The tile's teal sits around 0.16–0.35 luma and the scale's inner
          // fill a little above that, so the cut has to start well clear of
          // both or the body of the scale survives as a milky wash.
          const alpha = Math.max(0, Math.min(1, (l - 0.52) / 0.18));
          d[i + 3] = Math.round(d[i + 3] * alpha);
        }
        tctx.putImageData(id, 0, 0);
        ctx.drawImage(t, 0, 0);
      };

      // eslint-disable-next-line no-new-func
      new Function('ctx', 'img', 'a', 'size', 'fillGradient', 'drawRegion', 'keyRegion', body)(
        ctx, img, a, size, fillGradient, drawRegion, keyRegion,
      );

      if (opaque) {
        ctx.globalCompositeOperation = 'destination-over';
        fillGradient();
      }
      return c.toDataURL('image/png').split(',')[1];
    },
    { src: dataUri, size, body: draw, a: assets, opaque },
  );

  writeFileSync(resolve(OUT, file), Buffer.from(base64, 'base64'));
  console.log('wrote', file, `${size}×${size}`);
}

// iOS: full bleed, no rounding of our own — iOS applies the mask.
await render('icon.png', 1024, `
  fillGradient();
  drawRegion(a.tile, { x: -size * 0.06, y: -size * 0.06, w: size * 1.12, h: size * 1.12 });
`, { opaque: true });

// Android adaptive: the outer third is cropped, so the mark sits well inside.
await render('android-icon-background.png', 512, 'fillGradient();', { opaque: true });
await render('android-icon-foreground.png', 512, `
  keyRegion(a.mark, { x: size * 0.26, y: size * 0.26, w: size * 0.48, h: size * 0.48 });
`);
await render('android-icon-monochrome.png', 432, `
  keyRegion(a.mark, { x: size * 0.26, y: size * 0.26, w: size * 0.48, h: size * 0.48 });
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
`);

// Splash: the mark alone, on the theme's page colour behind it.
await render('splash-icon.png', 1024, `
  keyRegion(a.mark, { x: size * 0.2, y: size * 0.2, w: size * 0.6, h: size * 0.6 });
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#2F6C7A';
  ctx.fillRect(0, 0, size, size);
`);
await render('splash-icon-dark.png', 1024, `
  keyRegion(a.mark, { x: size * 0.2, y: size * 0.2, w: size * 0.6, h: size * 0.6 });
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#5FA3B3';
  ctx.fillRect(0, 0, size, size);
`);

// The wordmark is illegible this small, so the favicon is the mark alone.
await render('favicon.png', 48, `
  const r = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.arcTo(size, 0, size, size, r); ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r); ctx.arcTo(0, 0, size, 0, r); ctx.closePath();
  ctx.clip();
  fillGradient();
  keyRegion(a.mark, { x: size * 0.12, y: size * 0.12, w: size * 0.76, h: size * 0.76 });
`);

await browser.close();
