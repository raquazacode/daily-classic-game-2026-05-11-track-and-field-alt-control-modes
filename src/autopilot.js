import { FIXED_STEP_MS } from './game-core.js';

const pilotStates = new WeakMap();

function getPilotState(game) {
  let pilot = pilotStates.get(game);
  if (!pilot) {
    pilot = {
      lastStrideMs: -Infinity,
      nextSide: 'left',
    };
    pilotStates.set(game, pilot);
  }
  return pilot;
}

function pilotTick(game) {
  const state = game.getState();
  const pilot = getPilotState(game);

  if (state.mode === 'title' || state.mode === 'gameover' || state.mode === 'finished') {
    pilot.lastStrideMs = -Infinity;
    pilot.nextSide = 'left';
    game.start();
    return;
  }

  if (state.mode === 'paused') {
    return;
  }

  const nextHurdleDistance = state.nextHurdleDistance;

  if (state.controlMode === 'classic' && (state.stamina < 26 || (nextHurdleDistance !== null && nextHurdleDistance <= 6.1))) {
    game.toggleControlMode();
  } else if (
    state.controlMode === 'rhythm' &&
    state.stamina > 60 &&
    (nextHurdleDistance === null || nextHurdleDistance > 8.6)
  ) {
    game.toggleControlMode();
  }

  const current = game.getState();
  const strideInterval = current.controlMode === 'classic' ? 140 : 220;
  if (current.elapsedMs - pilot.lastStrideMs >= strideInterval) {
    game.stride(pilot.nextSide);
    pilot.lastStrideMs = current.elapsedMs;
    pilot.nextSide = pilot.nextSide === 'left' ? 'right' : 'left';
  }

  const refreshed = game.getState();
  const jumpWindowStart = refreshed.controlMode === 'rhythm' ? 1.85 : 1.45;
  const jumpWindowEnd = 0.42;
  if (
    refreshed.nextHurdleDistance !== null &&
    refreshed.player.jumpHeightPx <= 0 &&
    refreshed.player.jumpCooldownMs <= 0 &&
    refreshed.nextHurdleDistance <= jumpWindowStart &&
    refreshed.nextHurdleDistance >= jumpWindowEnd
  ) {
    game.jump();
  }
}

export function advanceWithPilot(game, ms = FIXED_STEP_MS) {
  let remaining = Math.max(0, ms);

  while (remaining > 0) {
    const step = Math.min(FIXED_STEP_MS, remaining);
    pilotTick(game);
    game.advance(step);
    remaining -= step;
  }

  return game.getState();
}
