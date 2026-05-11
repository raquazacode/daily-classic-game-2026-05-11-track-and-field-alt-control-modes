# Track & Field: Alt Control Modes

- Base inspiration: `Track & Field`
- Selected twist: `Alt control modes`
- Delivery target: deterministic browser MVP with keyboard-first controls, seeded proof hooks, Playwright capture artifacts, and a fast unattended verification path.

## MVP Shape

- One 100m hurdles heat with seven deterministic hurdle positions and no random obstacle placement.
- Title, running, paused, finished, and game-over states all live in the same fixed-step simulation.
- Canvas-first stadium presentation with scoreboard, proof payload, event feed, and keyboard plus button input.

## Control Model

- `Classic` mode rewards alternating left/right stride taps with the best top-end speed but burns stamina quickly.
- `Rhythm` mode lowers the pace ceiling, but beat-matched taps refill stamina, award rhythm bursts, and prime jump assist.
- `Space` commits the hurdle jump, while `C` flips the control model mid-heat.

## Automation Notes

- `src/game-core.js` owns the deterministic simulation, scoring, hurdle resolution, and JSON proof payload.
- `src/autopilot.js` drives the scripted Playwright path and the local self-check.
- `window.advanceTime(ms)` and `window.render_game_to_text()` expose the same deterministic state that the tests assert against.
