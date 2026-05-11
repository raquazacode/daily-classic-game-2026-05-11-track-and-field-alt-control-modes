import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWithPilot } from '../src/autopilot.js';
import { TRACK_LENGTH_METERS, createGame, renderGameToText } from '../src/game-core.js';

test('pilot finishes the heat, clears hurdles, and uses both control modes', () => {
  const game = createGame({ seed: 20260511 });
  let snapshot = game.getState();

  for (let index = 0; index < 420; index += 1) {
    snapshot = advanceWithPilot(game, 100);
    if (snapshot.mode === 'finished') {
      break;
    }
  }

  assert.equal(snapshot.mode, 'finished');
  assert.equal(snapshot.distanceMeters, TRACK_LENGTH_METERS);
  assert(snapshot.hurdlesCleared >= 6, `expected at least six cleared hurdles, got ${snapshot.hurdlesCleared}`);
  assert(snapshot.modeSwitches >= 2, `expected mode changes, got ${snapshot.modeSwitches}`);
  assert(snapshot.rhythmBursts >= 3, `expected rhythm hits, got ${snapshot.rhythmBursts}`);
  assert(snapshot.score >= 1800, `expected meaningful scoring, got ${snapshot.score}`);
});

test('pause freezes the simulation and reset returns to the title shell', () => {
  const game = createGame({ seed: 20260511 });

  advanceWithPilot(game, 2200);
  const live = game.getState();
  assert.equal(live.mode, 'running');

  game.togglePause();
  const pausedBefore = game.getState();
  game.advance(2400);
  const pausedAfter = game.getState();
  assert.equal(pausedAfter.elapsedMs, pausedBefore.elapsedMs);
  assert.equal(pausedAfter.distanceMeters, pausedBefore.distanceMeters);

  game.reset();
  const reset = game.getState();
  assert.equal(reset.mode, 'title');
  assert.equal(reset.score, 0);
  assert.equal(reset.distanceMeters, 0);
  assert(reset.bestScore >= live.score);
});

test('render_game_to_text exposes deterministic automation fields', () => {
  const game = createGame({ seed: 20260511 });
  advanceWithPilot(game, 2600);
  const payload = JSON.parse(renderGameToText(game.getState()));

  assert.equal(typeof payload.controlMode, 'string');
  assert.equal(typeof payload.nextHurdleDistance, 'number');
  assert.equal(typeof payload.rhythmBursts, 'number');
  assert.equal(typeof payload.bestStrideStreak, 'number');
  assert(Array.isArray(payload.hurdles));
  assert(Array.isArray(payload.recentEvents));
});
