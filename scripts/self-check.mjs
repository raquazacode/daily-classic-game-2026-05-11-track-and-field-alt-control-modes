import assert from 'node:assert/strict';
import { advanceWithPilot } from '../src/autopilot.js';
import { createGame, renderGameToText } from '../src/game-core.js';

const game = createGame({ seed: 20260511 });
let snapshot = game.getState();

for (let index = 0; index < 420; index += 1) {
  snapshot = advanceWithPilot(game, 100);
  if (snapshot.mode === 'finished') {
    break;
  }
}

assert.equal(snapshot.mode, 'finished');
assert(snapshot.hurdlesCleared >= 6, 'self-check expected at least six cleared hurdles');
assert(snapshot.modeSwitches >= 2, 'self-check expected at least two mode switches');
assert(snapshot.rhythmBursts >= 3, 'self-check expected rhythm bursts');

console.log(renderGameToText(snapshot));
console.log('self-check ok');
