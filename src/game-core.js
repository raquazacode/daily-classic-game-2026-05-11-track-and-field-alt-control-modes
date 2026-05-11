export const WORLD_WIDTH = 1040;
export const WORLD_HEIGHT = 620;
export const FIXED_STEP_MS = 50;
export const PLAYER_SCREEN_X = 238;
export const TRACK_LENGTH_METERS = 100;
export const HURDLE_POSITIONS = [14, 28, 42, 56, 70, 84, 96];
export const RHYTHM_BEAT_MS = 220;

const GROUND_Y = 428;
const MIN_SPEED_MPS = 2.6;
const MAX_SPEED_MPS = 12.8;
const RHYTHM_TARGET_SPEED = 6.25;
const JUMP_VELOCITY_PX = 490;
const RHYTHM_JUMP_VELOCITY_PX = 540;
const GRAVITY_PX = 1320;
const JUMP_COOLDOWN_MS = 280;
const CLEAR_HEIGHT_PX = 68;
const PERFECT_HEIGHT_PX = 98;
const SCORE_PER_METER = 16;
const PERFECT_WINDOW_MS = 34;
const GOOD_WINDOW_MS = 62;
const MAX_RECENT_EVENTS = 9;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.abs(Math.trunc(seed)) || 1;
  }

  const text = String(seed ?? 'track-and-field');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function pushEvent(state, message) {
  state.recentEvents.push(message);
  if (state.recentEvents.length > MAX_RECENT_EVENTS) {
    state.recentEvents.shift();
  }
}

function syncBestScore(state) {
  state.bestScore = Math.max(state.bestScore, state.score);
}

function addScore(state, points, message = null) {
  state.score += points;
  syncBestScore(state);
  if (message) {
    pushEvent(state, `${message} +${points}.`);
  }
}

function buildHurdles(seed) {
  const accents = ['#ff8364', '#ffd166', '#80ed99', '#7bdff2'];
  return HURDLE_POSITIONS.map((distance, index) => ({
    id: index + 1,
    distance,
    accent: accents[(seed + index) % accents.length],
    status: 'upcoming',
  }));
}

function createReadyState(seed, sessionBestScore = 0) {
  const normalizedSeed = normalizeSeed(seed);
  return {
    seed: normalizedSeed,
    accentIndex: normalizedSeed % 3,
    mode: 'title',
    elapsedMs: 0,
    finishTimeMs: null,
    distanceMeters: 0,
    speedMps: 0,
    stamina: 100,
    score: 0,
    bestScore: sessionBestScore,
    scoreCarry: 0,
    controlMode: 'classic',
    modeSwitches: 0,
    rhythmBursts: 0,
    strideStreak: 0,
    bestStrideStreak: 0,
    hurdleHits: 0,
    hurdlesCleared: 0,
    perfectClears: 0,
    lastTapSide: null,
    assistMs: 0,
    beatPhaseMs: 0,
    lastHurdleBonus: 0,
    statusLine: 'Press Enter to start. Alternate A and L to sprint, tap C for Rhythm mode, and Space to jump.',
    recentEvents: [
      'Enter starts a new heat.',
      'A / Left Arrow and L / Right Arrow drive the stride cycle.',
      'C switches between Classic and Rhythm control styles. P pauses and R resets.',
    ],
    player: {
      x: PLAYER_SCREEN_X,
      y: GROUND_Y,
      jumpHeightPx: 0,
      jumpVelocityPx: 0,
      jumpCooldownMs: 0,
      poseTimerMs: 0,
      strideSide: 'left',
    },
    hurdles: buildHurdles(normalizedSeed),
  };
}

function createRunState(seed, sessionBestScore = 0) {
  const state = createReadyState(seed, sessionBestScore);
  state.mode = 'running';
  state.speedMps = 4.35;
  state.statusLine = 'Classic mode is live. Alternate your stride and jump the first hurdle at 14m.';
  pushEvent(state, 'The gun fired. Build speed before the first hurdle.');
  return state;
}

function getNextHurdle(state) {
  return state.hurdles.find((hurdle) => hurdle.status === 'upcoming') ?? null;
}

function getRhythmOffset(state) {
  const phase = state.beatPhaseMs % RHYTHM_BEAT_MS;
  return Math.min(phase, RHYTHM_BEAT_MS - phase);
}

function setStridePose(state, side) {
  state.player.poseTimerMs = 180;
  state.player.strideSide = side;
}

function bumpStrideStreak(state, resetTo = null) {
  if (resetTo === null) {
    state.strideStreak += 1;
  } else {
    state.strideStreak = resetTo;
  }
  state.bestStrideStreak = Math.max(state.bestStrideStreak, state.strideStreak);
}

function applyClassicStride(state, side) {
  const alternating = state.lastTapSide && state.lastTapSide !== side;
  const sameSideRepeat = state.lastTapSide === side;

  if (alternating) {
    state.speedMps = clamp(
      state.speedMps + 1.02 + Math.min(0.24, state.strideStreak * 0.03),
      MIN_SPEED_MPS,
      MAX_SPEED_MPS
    );
    state.stamina = clamp(state.stamina - 1.45, 0, 100);
    bumpStrideStreak(state);
    if (state.strideStreak > 0 && state.strideStreak % 6 === 0) {
      addScore(state, 36, 'Stride chain');
    }
  } else if (sameSideRepeat) {
    state.speedMps = clamp(state.speedMps + 0.24, MIN_SPEED_MPS, MAX_SPEED_MPS);
    state.stamina = clamp(state.stamina - 1.8, 0, 100);
    bumpStrideStreak(state, 1);
    state.statusLine = 'Same-footed shove. Alternate sides for better acceleration.';
  } else {
    state.speedMps = clamp(state.speedMps + 0.56, MIN_SPEED_MPS, MAX_SPEED_MPS);
    state.stamina = clamp(state.stamina - 1.1, 0, 100);
    bumpStrideStreak(state, 1);
  }

  setStridePose(state, side);
  state.lastTapSide = side;
  state.assistMs = Math.max(0, state.assistMs - 40);
}

function applyRhythmStride(state, side) {
  const offset = getRhythmOffset(state);
  const perfect = offset <= PERFECT_WINDOW_MS;
  const good = offset <= GOOD_WINDOW_MS;

  if (perfect) {
    state.speedMps = clamp(
      Math.max(state.speedMps, RHYTHM_TARGET_SPEED - 0.25) + 0.78,
      MIN_SPEED_MPS,
      MAX_SPEED_MPS
    );
    state.stamina = clamp(state.stamina + 1.1, 0, 100);
    state.assistMs = 240;
    state.rhythmBursts += 1;
    bumpStrideStreak(state);
    state.score += 20;
    syncBestScore(state);
    if (state.rhythmBursts % 3 === 0) {
      pushEvent(state, 'Rhythm window stacked cleanly. Jump assist is primed.');
    }
  } else if (good) {
    state.speedMps = clamp(
      Math.max(state.speedMps, RHYTHM_TARGET_SPEED - 0.4) + 0.38,
      MIN_SPEED_MPS,
      MAX_SPEED_MPS
    );
    state.stamina = clamp(state.stamina + 0.35, 0, 100);
    bumpStrideStreak(state);
    state.score += 8;
    syncBestScore(state);
  } else {
    state.speedMps = clamp(state.speedMps + 0.16, MIN_SPEED_MPS, MAX_SPEED_MPS);
    state.stamina = clamp(state.stamina - 0.55, 0, 100);
    bumpStrideStreak(state, 1);
    state.statusLine = 'Rhythm mode wants the pulse lights. Tap closer to the beat.';
  }

  setStridePose(state, side);
  state.lastTapSide = side;
}

function evaluateHurdle(state, hurdle) {
  const height = state.player.jumpHeightPx;

  if (height >= PERFECT_HEIGHT_PX) {
    hurdle.status = 'perfect';
    state.hurdlesCleared += 1;
    state.perfectClears += 1;
    state.lastHurdleBonus = 220;
    state.speedMps = clamp(state.speedMps + 0.48, MIN_SPEED_MPS, MAX_SPEED_MPS);
    addScore(state, 220, `Perfect hurdle ${hurdle.id}`);
    state.statusLine = `Perfect clearance on hurdle ${hurdle.id}. Stay sharp for the next split.`;
    return;
  }

  if (height >= CLEAR_HEIGHT_PX) {
    hurdle.status = 'cleared';
    state.hurdlesCleared += 1;
    state.lastHurdleBonus = 140;
    state.speedMps = clamp(state.speedMps + 0.22, MIN_SPEED_MPS, MAX_SPEED_MPS);
    addScore(state, 140, `Hurdle ${hurdle.id} clear`);
    state.statusLine = `Hurdle ${hurdle.id} cleared. Carry the pace.`;
    return;
  }

  hurdle.status = 'hit';
  state.hurdleHits += 1;
  state.lastHurdleBonus = -60;
  state.score = Math.max(0, state.score - 60);
  syncBestScore(state);
  state.speedMps = Math.max(MIN_SPEED_MPS, state.speedMps * 0.58);
  state.stamina = clamp(state.stamina - 15, 0, 100);
  state.strideStreak = 0;
  pushEvent(state, `Hurdle ${hurdle.id} clipped. Reset the timing before the next barrier.`);
  state.statusLine = `Hurdle ${hurdle.id} clipped. Recover and rebuild speed.`;
}

function maybeResolveHurdles(state) {
  for (const hurdle of state.hurdles) {
    if (hurdle.status !== 'upcoming') {
      continue;
    }

    if (state.distanceMeters < hurdle.distance) {
      break;
    }

    evaluateHurdle(state, hurdle);
  }
}

function maybeFinishRun(state) {
  if (state.distanceMeters < TRACK_LENGTH_METERS) {
    return;
  }

  state.distanceMeters = TRACK_LENGTH_METERS;
  state.finishTimeMs = state.elapsedMs;
  state.mode = 'finished';
  state.player.jumpHeightPx = 0;
  state.player.jumpVelocityPx = 0;
  state.player.jumpCooldownMs = 0;

  const timeBonus = Math.max(440, Math.round((20000 - state.elapsedMs) / 4));
  const staminaBonus = Math.round(state.stamina * 6);
  const cleanBonus = state.hurdleHits === 0 ? 300 : 0;
  const modeBonus = state.modeSwitches >= 2 ? 120 : 0;
  const finishBonus = timeBonus + staminaBonus + cleanBonus + modeBonus;

  addScore(state, finishBonus, 'Finish bonus');
  state.statusLine = `Finished in ${(state.finishTimeMs / 1000).toFixed(2)}s. Press Enter to run another heat.`;
  pushEvent(
    state,
    `Heat complete in ${(state.finishTimeMs / 1000).toFixed(2)}s with ${state.hurdlesCleared}/${state.hurdles.length} hurdles cleared.`
  );
}

function triggerGameOver(state, reason) {
  state.mode = 'gameover';
  state.speedMps = 0;
  state.player.jumpVelocityPx = 0;
  syncBestScore(state);
  state.statusLine = `${reason} Press Enter to restart the heat.`;
  pushEvent(state, reason);
}

function advanceRunner(state, stepMs) {
  const dt = stepMs / 1000;

  state.elapsedMs += stepMs;
  state.beatPhaseMs = (state.beatPhaseMs + stepMs) % RHYTHM_BEAT_MS;
  state.assistMs = Math.max(0, state.assistMs - stepMs);
  state.player.jumpCooldownMs = Math.max(0, state.player.jumpCooldownMs - stepMs);
  state.player.poseTimerMs = Math.max(0, state.player.poseTimerMs - stepMs);

  if (state.player.jumpHeightPx > 0 || state.player.jumpVelocityPx > 0) {
    state.player.jumpHeightPx += state.player.jumpVelocityPx * dt;
    state.player.jumpVelocityPx -= GRAVITY_PX * dt;
    if (state.player.jumpHeightPx <= 0 && state.player.jumpVelocityPx < 0) {
      state.player.jumpHeightPx = 0;
      state.player.jumpVelocityPx = 0;
    }
  }

  if (state.controlMode === 'classic') {
    state.speedMps = clamp(state.speedMps - 0.88 * dt, MIN_SPEED_MPS, MAX_SPEED_MPS);
    state.stamina = clamp(state.stamina - (0.42 + state.speedMps * 0.09) * dt * 10, 0, 100);
  } else {
    state.speedMps = clamp(state.speedMps - 0.5 * dt, MIN_SPEED_MPS, MAX_SPEED_MPS);
    state.speedMps += (RHYTHM_TARGET_SPEED - state.speedMps) * 0.07;
    state.stamina = clamp(
      state.stamina + (0.3 - Math.max(0, state.speedMps - 7.4) * 0.05) * dt * 10,
      0,
      100
    );
  }

  if (state.player.jumpHeightPx > 0) {
    state.stamina = clamp(state.stamina - 0.12 * dt * 10, 0, 100);
  }

  if (state.stamina <= 0) {
    triggerGameOver(state, 'Stamina flatlined before the finish ribbon.');
    return;
  }

  if (state.stamina < 18) {
    state.speedMps = Math.min(state.speedMps, 6.9);
  }

  state.distanceMeters += state.speedMps * dt;
  state.scoreCarry += state.speedMps * dt * SCORE_PER_METER;
  if (state.scoreCarry >= 1) {
    const points = Math.floor(state.scoreCarry);
    state.scoreCarry -= points;
    state.score += points;
    syncBestScore(state);
  }

  maybeResolveHurdles(state);
  maybeFinishRun(state);
}

function snapshotState(state) {
  const nextHurdle = getNextHurdle(state);
  return {
    seed: state.seed,
    mode: state.mode,
    elapsedMs: state.elapsedMs,
    finishTimeMs: state.finishTimeMs,
    distanceMeters: round(state.distanceMeters),
    remainingMeters: round(Math.max(0, TRACK_LENGTH_METERS - state.distanceMeters)),
    trackLengthMeters: TRACK_LENGTH_METERS,
    speedMps: round(state.speedMps),
    stamina: round(state.stamina),
    score: state.score,
    bestScore: state.bestScore,
    controlMode: state.controlMode,
    modeSwitches: state.modeSwitches,
    rhythmBursts: state.rhythmBursts,
    strideStreak: state.strideStreak,
    bestStrideStreak: state.bestStrideStreak,
    hurdleHits: state.hurdleHits,
    hurdlesCleared: state.hurdlesCleared,
    perfectClears: state.perfectClears,
    lastHurdleBonus: state.lastHurdleBonus,
    nextHurdleDistance: nextHurdle ? round(nextHurdle.distance - state.distanceMeters) : null,
    rhythmOffsetMs: getRhythmOffset(state),
    rhythmBeatMs: RHYTHM_BEAT_MS,
    assistMs: state.assistMs,
    statusLine: state.statusLine,
    recentEvents: [...state.recentEvents],
    player: {
      x: state.player.x,
      y: state.player.y,
      jumpHeightPx: round(state.player.jumpHeightPx),
      jumpCooldownMs: state.player.jumpCooldownMs,
      strideSide: state.player.strideSide,
      poseTimerMs: state.player.poseTimerMs,
    },
    hurdles: state.hurdles.map((hurdle) => ({
      id: hurdle.id,
      distance: hurdle.distance,
      accent: hurdle.accent,
      status: hurdle.status,
    })),
  };
}

export function renderGameToText(stateLike) {
  const payload =
    stateLike && typeof stateLike === 'object' && 'recentEvents' in stateLike && 'player' in stateLike
      ? stateLike
      : snapshotState(stateLike);
  return JSON.stringify(payload, null, 2);
}

export function createGame({ seed = 20260511 } = {}) {
  const normalizedSeed = normalizeSeed(seed);
  let sessionBestScore = 0;
  let state = createReadyState(normalizedSeed, sessionBestScore);

  return {
    start() {
      if (state.mode === 'running') {
        return;
      }
      if (state.mode === 'paused') {
        state.mode = 'running';
        state.statusLine = 'Back on the track.';
        return;
      }
      sessionBestScore = Math.max(sessionBestScore, state.bestScore);
      state = createRunState(normalizedSeed, sessionBestScore);
    },

    reset() {
      sessionBestScore = Math.max(sessionBestScore, state.bestScore, state.score);
      state = createReadyState(normalizedSeed, sessionBestScore);
    },

    togglePause() {
      if (state.mode === 'running') {
        state.mode = 'paused';
        state.statusLine = 'Paused at the blocks. Press P again to resume.';
        return;
      }

      if (state.mode === 'paused') {
        state.mode = 'running';
        state.statusLine = 'Back on the track.';
      }
    },

    toggleControlMode() {
      if (state.mode !== 'running') {
        return;
      }

      state.controlMode = state.controlMode === 'classic' ? 'rhythm' : 'classic';
      state.modeSwitches += 1;
      state.assistMs = state.controlMode === 'rhythm' ? 120 : 0;
      state.statusLine =
        state.controlMode === 'rhythm'
          ? 'Rhythm mode engaged. Tap the pulse lights to recover and line up the jump.'
          : 'Classic mode engaged. Alternate hard for top-end sprint speed.';
      pushEvent(state, `Control mode switched to ${state.controlMode}.`);
    },

    stride(side) {
      if (state.mode !== 'running') {
        return;
      }

      if (state.controlMode === 'classic') {
        applyClassicStride(state, side);
      } else {
        applyRhythmStride(state, side);
      }
    },

    jump() {
      if (state.mode !== 'running') {
        return;
      }

      if (state.player.jumpHeightPx > 0 || state.player.jumpCooldownMs > 0) {
        return;
      }

      const jumpVelocity =
        state.controlMode === 'rhythm' || state.assistMs > 0 ? RHYTHM_JUMP_VELOCITY_PX : JUMP_VELOCITY_PX;
      state.player.jumpHeightPx = 4;
      state.player.jumpVelocityPx = jumpVelocity;
      state.player.jumpCooldownMs = JUMP_COOLDOWN_MS;

      const nextHurdle = getNextHurdle(state);
      if (nextHurdle) {
        const gap = nextHurdle.distance - state.distanceMeters;
        if (gap <= 2.2 && gap >= 0.45) {
          state.statusLine = `Jump committed for hurdle ${nextHurdle.id}.`;
        }
      }
    },

    advance(ms = FIXED_STEP_MS) {
      if (state.mode !== 'running') {
        return;
      }

      let remaining = Math.max(0, ms);
      while (remaining > 0 && state.mode === 'running') {
        const step = Math.min(FIXED_STEP_MS, remaining);
        advanceRunner(state, step);
        remaining -= step;
      }
    },

    getState() {
      return snapshotState(state);
    },
  };
}
