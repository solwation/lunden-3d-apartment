const fs = require('fs');
const path = require('path');
const kit = require('./testkit.cjs');

const TARGETS = [
  {
    name: 'sidetable-flower',
    eye: [1.43, 0.75, 8.45],
    target: [1.43, 0.62, 8.03]
  },
  {
    name: 'unicorn-pinkflower',
    eye: [0.46, 4.75, 3.25],
    target: [0.46, 4.60, 2.79]
  },
  {
    name: 'sill-orchid',
    eye: [3.12, 0.95, 11.95],
    target: [3.12, 0.85, 12.36]
  },
  {
    name: 'sill-violet',
    eye: [2.11, 4.45, 0.75],
    target: [2.11, 4.30, 0.34]
  },
  {
    name: 'sill-pelargon',
    eye: [2.03, 4.35, 11.95],
    target: [2.03, 4.20, 12.36]
  },
  {
    name: 'sill-cactus',
    eye: [1.43, 4.35, 11.95],
    target: [1.43, 4.20, 12.36]
  }
];

const prefix = process.argv[2] || 'before';
const outDir = process.argv[3] || '/tmp/lunden-shots-plants985';
fs.mkdirSync(outDir, { recursive: true });

async function capture() {
  const browser = await kit.launch();
  try {
    for (const timeMode of [{ time: 12, label: 'day' }, { time: 21, label: 'evening' }]) {
      const url = `http://localhost:8872/?shot&time=${timeMode.time}`;
      const { ctx, page } = await kit.open(browser, url);
      console.log(`Loaded page for ${timeMode.label} (time=${timeMode.time})`);

      for (const t of TARGETS) {
        await page.evaluate((tgt) => {
          const app = window.__app;
          const cam = app.camera;
          cam.position.set(tgt.eye[0], tgt.eye[1], tgt.eye[2]);
          cam.lookAt(tgt.target[0], tgt.target[1], tgt.target[2]);
        }, t);

        const filename = path.join(outDir, `${prefix}-${t.name}-${timeMode.label}.png`);
        await kit.shot(page, filename, { frames: 3 });
        console.log(`Saved ${filename}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
