[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/xeraaGH/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/xeraaGH/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Skycourier — Ring Run over Coral Coast

A complete flight game that runs offline in a desktop browser from static files.
You are the courier pilot of **SKY-7**, a propeller plane over the island of Coral
Coast. Thread all **twelve glowing rings** — over the city, out across the sea, and
through the high mountain pass — then bring her home and land on the runway. One
tank of fuel, one stall speed, and a mountain that does not forgive.

Bounty: https://make.fun/c/best-flight-game-20261126-0057

## How to play

Serve `game/` with any static server (for example `node serve.ts`) and open
`http://localhost:8080` in desktop Chrome. No network request is made; the whole
game is the files under `game/`.

| Control | What it does |
| --- | --- |
| ↑ / ↓ (or W / S) | Pitch down / up |
| ← / → (or A / D) | Bank and turn |
| Shift / Ctrl | Throttle up / down |
| Mouse move | Steer by position |
| Mouse wheel | Throttle |
| Space | Brake |
| P | Pause |
| R | Restart the sortie |
| M | Mute |

## The flight

- **Take off** from the runway: throttle up, rotate at speed, and climb.
- **Rings** score 100 points each; flying dead centre through a ring pays a
  **+50 perfect** bonus. A missed ring stays live — turn around and try again.
- **Fuel** drains with the throttle. Below 25% the HUD warns you; empty tanks
  mean a glide, and a glide means a decision.
- **Stall**: below 38 kt the wing stops answering and the plane sinks. Keep
  the speed up in the mountains.
- **Landing**: a slow, level touchdown on the runway after the last ring
  finishes the course (+500). Touch down anywhere else and the flight is over.

The HUD shows altitude (ft), speed (kt) and heading on a compass tape, plus an
artificial horizon, a throttle lever, fuel, score, rings and the distance to the
next ring. The title screen flies itself while you decide.

## What is in the game

- `game/index.html` — the page; `game/src/main.js` — boot and the game loop
- `game/src/config.js` — every tuning number and colour
- `game/src/random.js` — seeded RNG and value noise (the island is deterministic)
- `game/src/terrain.js` — the island: coast, sea, mountains, city, runway
- `game/src/flight.js` — the flight model (bank-to-turn, stall, fuel, landing)
- `game/src/course.js` — the twelve-ring course
- `game/src/render.js` — chase camera, low-poly terrain, the plane, the HUD
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised engine, wind, rings and crashes (Web Audio)
- `game/src/shots.js` — deterministic screenshot scenes with an autopilot

Screenshots are real renders of the game's own code (`?shot=cover|ring|coast|runway`).
