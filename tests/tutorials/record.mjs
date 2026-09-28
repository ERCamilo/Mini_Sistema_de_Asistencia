// tests/tutorials/record.mjs — `npm run tutorials` (TUTORIALS=a,b to pick some).
// Films each tutorial on a phone screen and saves tutorials/<id>.webm/.json/.vtt.
// It runs every assertion too: a tutorial whose steps fail is never saved.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPlaywright, serve, runTutorial, OUT_DIR, Tutorials } from './lib.mjs';
import { loadTutorials } from './index.mjs';

async function main() {
  const { chromium } = await loadPlaywright();
  const server = await serve();
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-tutorials-'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  try {
    for (const tutorial of await loadTutorials()) {
      const result = await runTutorial(tutorial, { browser, base, mode: 'record', videoDir: work });
      const file = { id: tutorial.id, version: 1, recordedAt: new Date().toISOString(), duration: result.duration, captions: result.captions };
      fs.copyFileSync(result.videoPath, path.join(OUT_DIR, tutorial.id + '.webm'));
      fs.writeFileSync(path.join(OUT_DIR, tutorial.id + '.json'), JSON.stringify(file, null, 2) + '\n');
      fs.writeFileSync(path.join(OUT_DIR, tutorial.id + '.vtt'), Tutorials.toVtt(file.captions));
      const kb = Math.round(fs.statSync(path.join(OUT_DIR, tutorial.id + '.webm')).size / 1024);
      console.log(`OK ${tutorial.id}: ${file.captions.length} subtítulos, ${Math.round(file.duration)} s, ${kb} KB`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
});
