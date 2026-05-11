import './style.css';
import {
  FIXED_STEP_MS,
  PLAYER_SCREEN_X,
  RHYTHM_BEAT_MS,
  TRACK_LENGTH_METERS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGame,
  renderGameToText,
} from './game-core.js';
import { advanceWithPilot } from './autopilot.js';

const params = new URLSearchParams(window.location.search);
const manualClock = params.get('manual_clock') === '1';
const scriptedDemo = params.get('scripted_demo') === '1';
const game = createGame({ seed: 20260511 });

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="page-shell">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Daily Classic Game · 2026-05-11</p>
        <h1>Track &amp; Field: Alt Control Modes</h1>
        <p class="lede">
          A deterministic sprint-and-hurdles heat where you swap between raw alternating strides and a
          steadier rhythm mode to preserve stamina and clear barriers cleanly.
        </p>
        <div class="pill-row">
          <span class="pill">A / Left stride</span>
          <span class="pill">L / Right stride</span>
          <span class="pill">Space jump</span>
          <span class="pill">C switch mode</span>
          <span class="pill">P pause</span>
          <span class="pill">R reset</span>
        </div>
      </div>
      <div class="stage-shell">
        <canvas id="game-canvas" width="${WORLD_WIDTH}" height="${WORLD_HEIGHT}" aria-label="Track and field alternate control mode stage"></canvas>
      </div>
    </section>

    <section class="meta-grid">
      <article class="panel">
        <h2>Scoreboard</h2>
        <dl class="stat-grid">
          <div><dt>Mode</dt><dd id="mode-value">title</dd></div>
          <div><dt>Score</dt><dd id="score-value">0</dd></div>
          <div><dt>Best</dt><dd id="best-value">0</dd></div>
          <div><dt>Distance</dt><dd id="distance-value">0m</dd></div>
          <div><dt>Speed</dt><dd id="speed-value">0 m/s</dd></div>
          <div><dt>Stamina</dt><dd id="stamina-value">100%</dd></div>
          <div><dt>Control</dt><dd id="control-value">classic</dd></div>
          <div><dt>Hurdles</dt><dd id="hurdle-value">0 / 7</dd></div>
        </dl>
      </article>

      <article class="panel">
        <h2>Controls</h2>
        <div class="controls-grid">
          <button type="button" data-action="start">Start</button>
          <button type="button" data-action="stride-left">Left Stride</button>
          <button type="button" data-action="stride-right">Right Stride</button>
          <button type="button" data-action="jump">Jump</button>
          <button type="button" data-action="mode">Switch Mode</button>
          <button type="button" data-action="pause">Pause</button>
          <button type="button" data-action="reset">Reset</button>
        </div>
        <p id="status-line" class="panel-note"></p>
      </article>

      <article class="panel">
        <h2>Automation Proof</h2>
        <pre id="proof-output"></pre>
      </article>

      <article class="panel panel-wide">
        <h2>Event Feed</h2>
        <ul id="event-feed" class="event-feed"></ul>
      </article>
    </section>
  </main>
`;

const canvas = document.querySelector('#game-canvas');
const ctx = canvas.getContext('2d');
const modeValue = document.querySelector('#mode-value');
const scoreValue = document.querySelector('#score-value');
const bestValue = document.querySelector('#best-value');
const distanceValue = document.querySelector('#distance-value');
const speedValue = document.querySelector('#speed-value');
const staminaValue = document.querySelector('#stamina-value');
const controlValue = document.querySelector('#control-value');
const hurdleValue = document.querySelector('#hurdle-value');
const statusLine = document.querySelector('#status-line');
const proofOutput = document.querySelector('#proof-output');
const eventFeed = document.querySelector('#event-feed');

function drawRoundedRect(x, y, width, height, radius, fillStyle, strokeStyle = null) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBackground(snapshot) {
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  sky.addColorStop(0, '#0b1830');
  sky.addColorStop(0.55, '#21435f');
  sky.addColorStop(1, '#6c3f35');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let band = 0; band < 5; band += 1) {
    ctx.fillRect(0, 86 + band * 32, WORLD_WIDTH, 12);
  }

  ctx.fillStyle = 'rgba(255, 221, 162, 0.15)';
  for (let light = 0; light < 12; light += 1) {
    const x = 60 + light * 86;
    ctx.beginPath();
    ctx.moveTo(x, 76);
    ctx.lineTo(x - 24, 186);
    ctx.lineTo(x + 24, 186);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#10202d';
  ctx.fillRect(0, 242, WORLD_WIDTH, 116);
  ctx.fillStyle = '#14293f';
  ctx.fillRect(0, 258, WORLD_WIDTH, 88);

  for (let crowd = 0; crowd < 120; crowd += 1) {
    const x = (crowd * 37) % WORLD_WIDTH;
    const y = 278 + ((crowd * 17) % 52);
    const pulse = Math.sin((snapshot.elapsedMs / 380) + crowd) * 0.18 + 0.2;
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.fillRect(x, y, 6, 10);
  }

  ctx.fillStyle = '#a43c32';
  ctx.fillRect(0, 358, WORLD_WIDTH, 222);
  ctx.fillStyle = '#c65d42';
  ctx.fillRect(0, 372, WORLD_WIDTH, 28);
  ctx.fillStyle = '#d9804e';
  ctx.fillRect(0, 400, WORLD_WIDTH, 16);

  const scroll = (snapshot.distanceMeters * 46) % 90;
  ctx.strokeStyle = 'rgba(255, 240, 216, 0.56)';
  ctx.lineWidth = 4;
  for (let lane = -1; lane < 16; lane += 1) {
    const x = lane * 90 - scroll;
    ctx.beginPath();
    ctx.moveTo(x, 386);
    ctx.lineTo(x + 22, WORLD_HEIGHT);
    ctx.stroke();
  }

  ctx.strokeStyle = '#f9d48a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 418);
  ctx.lineTo(WORLD_WIDTH, 418);
  ctx.stroke();
}

function drawBeatRail(snapshot) {
  const baseX = 42;
  const railWidth = 280;
  const phaseRatio = snapshot.rhythmOffsetMs / (RHYTHM_BEAT_MS / 2);
  drawRoundedRect(baseX, 28, railWidth, 20, 10, 'rgba(4, 10, 18, 0.62)', 'rgba(255,255,255,0.08)');

  ctx.fillStyle = '#ffd166';
  ctx.fillRect(baseX + railWidth / 2 - 3, 24, 6, 28);
  ctx.fillStyle = phaseRatio < 0.32 ? '#80ed99' : phaseRatio < 0.56 ? '#ffd166' : '#f4978e';
  ctx.beginPath();
  ctx.arc(baseX + railWidth / 2 + (snapshot.rhythmOffsetMs - RHYTHM_BEAT_MS / 4) * 1.18, 38, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f1f5fb';
  ctx.font = '600 15px "Trebuchet MS"';
  ctx.fillText('Rhythm window', baseX, 68);
}

function drawHurdles(snapshot) {
  snapshot.hurdles.forEach((hurdle) => {
    const gap = hurdle.distance - snapshot.distanceMeters;
    const x = PLAYER_SCREEN_X + gap * 55;

    if (x < -60 || x > WORLD_WIDTH + 60) {
      return;
    }

    const statusColor =
      hurdle.status === 'perfect'
        ? '#80ed99'
        : hurdle.status === 'cleared'
          ? '#ffd166'
          : hurdle.status === 'hit'
            ? '#ff6b6b'
            : hurdle.accent;

    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x, 336);
    ctx.lineTo(x, 418);
    ctx.moveTo(x + 34, 336);
    ctx.lineTo(x + 34, 418);
    ctx.moveTo(x - 2, 340);
    ctx.lineTo(x + 36, 340);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(x - 10, 416, 58, 8);

    ctx.fillStyle = '#fff2cf';
    ctx.font = '700 18px "Trebuchet MS"';
    ctx.fillText(String(hurdle.id), x + 10, 328);
  });
}

function drawFinishRibbon(snapshot) {
  const finishX = PLAYER_SCREEN_X + (TRACK_LENGTH_METERS - snapshot.distanceMeters) * 55;
  if (finishX < -90 || finishX > WORLD_WIDTH + 90) {
    return;
  }

  ctx.fillStyle = '#f7ede2';
  ctx.fillRect(finishX, 260, 10, 180);
  ctx.fillRect(finishX + 74, 260, 10, 180);
  ctx.fillStyle = '#1b263b';
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const black = (row + column) % 2 === 0;
      ctx.fillStyle = black ? '#1b263b' : '#f7ede2';
      ctx.fillRect(finishX + 10 + column * 16, 270 + row * 26, 16, 26);
    }
  }
}

function drawRunner(snapshot) {
  const y = snapshot.player.y - snapshot.player.jumpHeightPx;
  const swing = Math.sin((snapshot.elapsedMs / 92) + (snapshot.player.strideSide === 'left' ? 0 : Math.PI)) * 16;
  const modeColor = snapshot.controlMode === 'rhythm' ? '#80ed99' : '#7bdff2';

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(PLAYER_SCREEN_X + 14, 430, 48, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = modeColor;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(PLAYER_SCREEN_X + 12, y - 94);
  ctx.lineTo(PLAYER_SCREEN_X + 18, y - 34);
  ctx.lineTo(PLAYER_SCREEN_X + 8 - swing, y + 8);
  ctx.moveTo(PLAYER_SCREEN_X + 18, y - 34);
  ctx.lineTo(PLAYER_SCREEN_X + 42 + swing, y + 12);
  ctx.moveTo(PLAYER_SCREEN_X + 18, y - 68);
  ctx.lineTo(PLAYER_SCREEN_X - 4 - swing * 0.45, y - 36);
  ctx.moveTo(PLAYER_SCREEN_X + 20, y - 68);
  ctx.lineTo(PLAYER_SCREEN_X + 56 + swing * 0.45, y - 44);
  ctx.stroke();

  ctx.fillStyle = '#ffe8d6';
  ctx.beginPath();
  ctx.arc(PLAYER_SCREEN_X + 12, y - 112, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#102a43';
  ctx.fillRect(PLAYER_SCREEN_X - 6, y - 96, 44, 48);
  ctx.fillStyle = '#f15bb5';
  ctx.fillRect(PLAYER_SCREEN_X + 10, y - 96, 10, 48);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(PLAYER_SCREEN_X - 8, y - 34, 16, 8);
  ctx.fillRect(PLAYER_SCREEN_X + 40, y - 26, 16, 8);
}

function drawHud(snapshot) {
  drawRoundedRect(24, 86, 276, 108, 24, 'rgba(6, 14, 24, 0.7)', 'rgba(255,255,255,0.08)');

  ctx.fillStyle = '#f9d48a';
  ctx.font = '700 30px "Trebuchet MS"';
  ctx.fillText(`Score ${snapshot.score}`, 44, 128);
  ctx.fillStyle = '#ecf2fb';
  ctx.font = '18px "Trebuchet MS"';
  ctx.fillText(`Best ${snapshot.bestScore}`, 44, 158);
  ctx.fillText(`Distance ${snapshot.distanceMeters.toFixed(1)} / ${TRACK_LENGTH_METERS}m`, 44, 182);

  const staminaWidth = 190;
  drawRoundedRect(42, 206, staminaWidth, 18, 9, 'rgba(255,255,255,0.12)');
  drawRoundedRect(
    42,
    206,
    (staminaWidth * snapshot.stamina) / 100,
    18,
    9,
    snapshot.stamina > 45 ? '#80ed99' : snapshot.stamina > 20 ? '#ffd166' : '#ff6b6b'
  );
  ctx.fillStyle = '#f1f5fb';
  ctx.font = '600 16px "Trebuchet MS"';
  ctx.fillText(`Stamina ${snapshot.stamina.toFixed(0)}%`, 240, 220);

  drawRoundedRect(786, 24, 230, 78, 20, 'rgba(6, 14, 24, 0.72)', 'rgba(255,255,255,0.08)');
  ctx.fillStyle = '#ecf2fb';
  ctx.font = '700 22px "Trebuchet MS"';
  ctx.fillText(snapshot.controlMode === 'rhythm' ? 'Rhythm Mode' : 'Classic Mode', 806, 58);
  ctx.font = '16px "Trebuchet MS"';
  ctx.fillText(`Speed ${snapshot.speedMps.toFixed(2)} m/s`, 806, 84);
}

function drawStatus(snapshot) {
  drawRoundedRect(286, 528, 468, 60, 20, 'rgba(4, 10, 18, 0.72)', 'rgba(255,255,255,0.08)');
  ctx.fillStyle = '#f4f7fb';
  ctx.font = '18px "Trebuchet MS"';
  ctx.fillText(snapshot.statusLine, 312, 565);
}

function drawTitle(snapshot) {
  if (snapshot.mode !== 'title') {
    return;
  }

  drawRoundedRect(282, 154, 476, 188, 30, 'rgba(8, 18, 30, 0.84)', 'rgba(255,255,255,0.1)');
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 22px "Trebuchet MS"';
  ctx.fillText('Track & Field: Alt Control Modes', 344, 212);
  ctx.fillStyle = '#edf2fb';
  ctx.font = '18px "Trebuchet MS"';
  ctx.fillText('Sprint in Classic mode, recover in Rhythm mode, and clear all seven hurdles cleanly.', 322, 254);
  ctx.fillText('Press Enter or Start to run the heat.', 400, 292);
}

function drawPausedOverlay(snapshot) {
  if (snapshot.mode !== 'paused') {
    return;
  }

  ctx.fillStyle = 'rgba(2, 6, 12, 0.52)';
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  drawRoundedRect(368, 234, 306, 110, 28, 'rgba(12, 22, 34, 0.9)', 'rgba(255,255,255,0.12)');
  ctx.fillStyle = '#fff6db';
  ctx.font = '700 34px "Trebuchet MS"';
  ctx.fillText('Paused', 472, 282);
  ctx.font = '18px "Trebuchet MS"';
  ctx.fillText('Press P to resume or R to reset the heat.', 410, 320);
}

function drawFinishBanner(snapshot) {
  if (snapshot.mode !== 'finished' && snapshot.mode !== 'gameover') {
    return;
  }

  const success = snapshot.mode === 'finished';
  drawRoundedRect(304, 118, 432, 150, 30, 'rgba(9, 18, 30, 0.88)', 'rgba(255,255,255,0.1)');
  ctx.fillStyle = success ? '#80ed99' : '#ff8c94';
  ctx.font = '700 34px "Trebuchet MS"';
  ctx.fillText(success ? 'Finish Ribbon Hit' : 'Out Of Gas', 410, 170);
  ctx.fillStyle = '#edf2fb';
  ctx.font = '18px "Trebuchet MS"';
  const line = success
    ? `Time ${((snapshot.finishTimeMs ?? snapshot.elapsedMs) / 1000).toFixed(2)}s · Perfect clears ${snapshot.perfectClears}`
    : 'The heat ended early. Press Enter to restart.';
  ctx.fillText(line, 380, 210);
  ctx.fillText('Press Enter for a new heat or R to reset to the title shell.', 340, 240);
}

function render(snapshot = game.getState()) {
  drawBackground(snapshot);
  drawBeatRail(snapshot);
  drawFinishRibbon(snapshot);
  drawHurdles(snapshot);
  drawRunner(snapshot);
  drawHud(snapshot);
  drawStatus(snapshot);
  drawTitle(snapshot);
  drawFinishBanner(snapshot);
  drawPausedOverlay(snapshot);

  modeValue.textContent = snapshot.mode;
  scoreValue.textContent = String(snapshot.score);
  bestValue.textContent = String(snapshot.bestScore);
  distanceValue.textContent = `${snapshot.distanceMeters.toFixed(1)}m`;
  speedValue.textContent = `${snapshot.speedMps.toFixed(2)} m/s`;
  staminaValue.textContent = `${snapshot.stamina.toFixed(0)}%`;
  controlValue.textContent = snapshot.controlMode;
  hurdleValue.textContent = `${snapshot.hurdlesCleared} / ${snapshot.hurdles.length}`;
  statusLine.textContent = snapshot.statusLine;
  proofOutput.textContent = renderGameToText(snapshot);

  eventFeed.innerHTML = snapshot.recentEvents
    .slice()
    .reverse()
    .map((event) => `<li>${event}</li>`)
    .join('');
}

function applyAction(action) {
  switch (action) {
    case 'start':
      game.start();
      break;
    case 'stride-left':
      game.stride('left');
      break;
    case 'stride-right':
      game.stride('right');
      break;
    case 'jump':
      game.jump();
      break;
    case 'mode':
      game.toggleControlMode();
      break;
    case 'pause':
      game.togglePause();
      break;
    case 'reset':
      game.reset();
      break;
    default:
      break;
  }

  render();
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => applyAction(button.dataset.action));
});

window.addEventListener('keydown', (event) => {
  const key = event.code;
  if (['Space', 'ArrowLeft', 'ArrowRight', 'Enter', 'KeyC', 'KeyP', 'KeyR', 'KeyA', 'KeyL'].includes(key)) {
    event.preventDefault();
  }

  if (key === 'Enter') {
    applyAction('start');
  } else if (key === 'KeyA' || key === 'ArrowLeft') {
    applyAction('stride-left');
  } else if (key === 'KeyL' || key === 'ArrowRight') {
    applyAction('stride-right');
  } else if (key === 'Space') {
    applyAction('jump');
  } else if (key === 'KeyC') {
    applyAction('mode');
  } else if (key === 'KeyP') {
    applyAction('pause');
  } else if (key === 'KeyR') {
    applyAction('reset');
  }
});

let lastFrameAt = performance.now();
function tick(now) {
  const delta = now - lastFrameAt;
  lastFrameAt = now;
  if (scriptedDemo) {
    advanceWithPilot(game, delta);
  } else {
    game.advance(delta);
  }
  render();
  window.requestAnimationFrame(tick);
}

window.advanceTime = (ms) => {
  const snapshot = scriptedDemo ? advanceWithPilot(game, ms) : (game.advance(ms), game.getState());
  render(snapshot);
  return snapshot;
};

window.render_game_to_text = () => renderGameToText(game.getState());

render();

if (!manualClock) {
  window.requestAnimationFrame(tick);
}
