import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const root = process.cwd();
const outDir = path.join(root, 'artifacts', 'playwright');
const gifDir = path.join(root, 'assets', 'gifs');

mkdirSync(outDir, { recursive: true });
mkdirSync(gifDir, { recursive: true });

const server = spawn('pnpm', ['dev', '--host', '127.0.0.1', '--port', '4173'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let ready = false;
const logs = [];

function collect(chunk) {
  const text = chunk.toString();
  logs.push(text);
  if (text.includes('http://127.0.0.1:4173')) {
    ready = true;
  }
}

server.stdout.on('data', collect);
server.stderr.on('data', collect);

async function waitReady(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (!ready) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('dev server did not become ready in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function writeJson(fileName, payload) {
  writeFileSync(path.join(outDir, fileName), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function getState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

async function advanceUntil(page, predicate, { stepMs = 100, maxSteps = 260 } = {}) {
  for (let index = 0; index < maxSteps; index += 1) {
    const state = await getState(page);
    if (predicate(state)) {
      return state;
    }
    await page.evaluate((ms) => {
      window.advanceTime(ms);
    }, stepMs);
  }

  throw new Error('advanceUntil predicate was not met');
}

function createGif(framesDir, outputFile) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-framerate',
      '8',
      '-i',
      path.join(framesDir, 'frame-%02d.png'),
      '-vf',
      'scale=960:-1:flags=lanczos',
      outputFile,
    ],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${outputFile}: ${result.stderr || result.stdout}`);
  }
}

async function captureFrames(page, clipName, frameCount, advanceMs) {
  const framesDir = path.join(outDir, `frames-${clipName}`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  for (let index = 0; index < frameCount; index += 1) {
    await page.evaluate((ms) => {
      window.advanceTime(ms);
    }, advanceMs);
    await page.screenshot({
      path: path.join(framesDir, `frame-${String(index).padStart(2, '0')}.png`),
      fullPage: true,
    });
  }

  return framesDir;
}

(async () => {
  let browser;
  try {
    await waitReady();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
    const url =
      process.env.WEB_GAME_URL ?? 'http://127.0.0.1:4173/?scripted_demo=1&manual_clock=1';

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.advanceTime === 'function');
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

    const titleState = await getState(page);
    await page.screenshot({ path: path.join(outDir, 'shot-0-title.png'), fullPage: true });
    writeJson('state-0-title.json', titleState);

    const openingFrames = await captureFrames(page, 'opening-gates', 10, 130);

    const hurdleState = await advanceUntil(
      page,
      (state) => state.hurdlesCleared >= 1 && state.controlMode === 'rhythm',
      { stepMs: 100, maxSteps: 240 }
    );
    await page.screenshot({ path: path.join(outDir, 'shot-1-first-hurdle.png'), fullPage: true });
    writeJson('state-1-first-hurdle.json', hurdleState);

    const hurdleFrames = await captureFrames(page, 'rhythm-hurdle', 8, 120);

    await page.keyboard.press('KeyP');
    const pausedBefore = await getState(page);
    await page.evaluate(() => {
      window.advanceTime(500);
    });
    const pausedAfter = await getState(page);
    await page.screenshot({ path: path.join(outDir, 'shot-2-paused.png'), fullPage: true });
    writeJson('state-2-paused.json', {
      before: pausedBefore,
      after: pausedAfter,
    });
    await page.keyboard.press('KeyP');

    const finishState = await advanceUntil(page, (state) => state.mode === 'finished', {
      stepMs: 100,
      maxSteps: 360,
    });
    await page.screenshot({ path: path.join(outDir, 'shot-3-finish.png'), fullPage: true });
    writeJson('state-3-finish.json', finishState);
    writeFileSync(path.join(outDir, 'render_game_to_text.txt'), `${JSON.stringify(finishState, null, 2)}\n`, 'utf8');

    const finishFrames = await captureFrames(page, 'finish-banner', 5, 80);

    await page.keyboard.press('KeyR');
    const resetState = await getState(page);
    await page.screenshot({ path: path.join(outDir, 'shot-4-reset-title.png'), fullPage: true });
    writeJson('state-4-reset-title.json', resetState);

    const resetFrames = path.join(outDir, 'frames-reset-title');
    rmSync(resetFrames, { recursive: true, force: true });
    mkdirSync(resetFrames, { recursive: true });
    for (let index = 0; index < 5; index += 1) {
      await page.screenshot({
        path: path.join(resetFrames, `frame-${String(index).padStart(2, '0')}.png`),
        fullPage: true,
      });
    }

    createGif(openingFrames, path.join(gifDir, 'clip-01-opening-gates.gif'));
    createGif(hurdleFrames, path.join(gifDir, 'clip-02-rhythm-hurdle.gif'));

    const finishResetFrames = path.join(outDir, 'frames-finish-reset');
    rmSync(finishResetFrames, { recursive: true, force: true });
    mkdirSync(finishResetFrames, { recursive: true });
    const frameSources = [
      ...Array.from({ length: 5 }, (_, index) =>
        path.join(finishFrames, `frame-${String(index).padStart(2, '0')}.png`)
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        path.join(resetFrames, `frame-${String(index).padStart(2, '0')}.png`)
      ),
    ];
    frameSources.forEach((source, index) => {
      copyFileSync(source, path.join(finishResetFrames, `frame-${String(index).padStart(2, '0')}.png`));
    });
    createGif(finishResetFrames, path.join(gifDir, 'clip-03-finish-reset.gif'));

    [openingFrames, hurdleFrames, finishFrames, resetFrames, finishResetFrames].forEach((dir) => {
      rmSync(dir, { recursive: true, force: true });
    });

    writeJson('action_payload.json', [
      {
        buttons: ['left_mouse_button'],
        mouse_x: 214,
        mouse_y: 821,
        frames: 1,
      },
      {
        buttons: ['left_mouse_button'],
        mouse_x: 216,
        mouse_y: 874,
        frames: 1,
      },
      {
        buttons: ['left_mouse_button'],
        mouse_x: 375,
        mouse_y: 874,
        frames: 1,
      },
    ]);

    writeFileSync(path.join(outDir, 'dev-server.log'), logs.join(''), 'utf8');
    await browser.close();
    server.kill('SIGTERM');
    console.log('playwright capture complete');
  } catch (error) {
    writeFileSync(path.join(outDir, 'dev-server.log'), logs.join(''), 'utf8');
    if (browser) {
      await browser.close();
    }
    server.kill('SIGTERM');
    console.error(error);
    process.exit(1);
  }
})();
