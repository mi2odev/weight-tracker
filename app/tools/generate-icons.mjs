/**
 * Regenerates everything in `assets/`.
 *
 * The icons are drawn here rather than kept as opaque binaries so the mark can
 * be adjusted — a colour, a stroke weight, the Android safe-zone scale —
 * without a design tool. Chromium renders each SVG at its exact pixel size.
 *
 *     npx playwright@latest --version   # once, to have the package
 *     node tools/generate-icons.mjs ./assets
 *
 * Playwright is not a project dependency: this runs by hand when the brand
 * changes, not as part of a build. Set CHROMIUM to point at a browser if
 * Playwright cannot find one.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || './assets';
mkdirSync(OUT, { recursive: true });

const TEAL = '#2F6C7A';
const PAPER = '#FAFAF8';

/**
 * The mark: a weigh-in line stepping downward to a resting dot — the same
 * language the trend chart speaks. `scale` shrinks it inside its box so the
 * Android adaptive safe zone is respected.
 */
function mark({ stroke, scale = 1 }) {
  const t = (x, y) => [50 + (x - 50) * scale, 50 + (y - 50) * scale];
  const points = [
    [20, 32],
    [37, 46],
    [54, 41],
    [70, 58],
    [82, 68],
  ].map(([x, y]) => t(x, y));
  const [lastX, lastY] = points[points.length - 1];

  return `
    <polyline points="${points.map(([x, y]) => `${x},${y}`).join(' ')}"
              fill="none" stroke="${stroke}" stroke-width="${6.5 * scale}"
              stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${lastX}" cy="${lastY}" r="${6 * scale}" fill="${stroke}" />
  `;
}

const ASSETS = [
  {
    file: 'icon.png',
    size: 1024,
    svg: `<rect width="100" height="100" fill="${TEAL}"/>${mark({ stroke: PAPER, scale: 0.86 })}`,
  },
  {
    file: 'android-icon-background.png',
    size: 512,
    svg: `<rect width="100" height="100" fill="${TEAL}"/>`,
  },
  {
    // Android crops the outer third, so the mark sits well inside it.
    file: 'android-icon-foreground.png',
    size: 512,
    svg: mark({ stroke: PAPER, scale: 0.85 }),
  },
  {
    file: 'android-icon-monochrome.png',
    size: 432,
    svg: mark({ stroke: '#FFFFFF', scale: 0.85 }),
  },
  {
    file: 'splash-icon.png',
    size: 1024,
    svg: mark({ stroke: TEAL, scale: 0.7 }),
  },
  {
    // Dark mode gets the dark-theme accent, which is legible on #17181A.
    file: 'splash-icon-dark.png',
    size: 1024,
    svg: mark({ stroke: '#5FA3B3', scale: 0.7 }),
  },
  {
    file: 'favicon.png',
    size: 48,
    svg: `<rect width="100" height="100" rx="18" fill="${TEAL}"/>${mark({ stroke: PAPER, scale: 0.84 })}`,
  },
];

const browser = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
});

for (const asset of ASSETS) {
  const page = await browser.newPage({
    viewport: { width: asset.size, height: asset.size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<html><body style="margin:0">
       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"
            width="${asset.size}" height="${asset.size}">${asset.svg}</svg>
     </body></html>`,
  );
  await page.screenshot({
    path: `${OUT}/${asset.file}`,
    omitBackground: !asset.svg.startsWith('<rect width="100" height="100" fill'),
  });
  await page.close();
  console.log('wrote', asset.file, asset.size);
}

await browser.close();
