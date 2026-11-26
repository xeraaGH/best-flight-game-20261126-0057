// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, crashed and won.
//
// ?seed=N fixes the island and the course. ?shot=cover|ring|coast|runway|menu (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. window.__game exposes the live state for
// playtests: { plane, course, screen }.
import { BEST_KEY, DEFAULT_SEED, STEP } from './config.js';
import { createCourse } from './course.js';
import { createPlane, STATUS_CRASHED, STATUS_FLYING, STATUS_LANDED, STATUS_WON, stepPlane } from './flight.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity, buildClouds } from './terrain.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
  createRenderer,
} from './render.js';
import { autopilot, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const plane = createPlane(seed);
const course = createCourse(seed);
const world = { seed, course, city: buildCity(seed), clouds: buildClouds(seed) };
const renderer = createRenderer(canvas, world);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, { ...world, plane });
  // Paint in a loop, not just twice: a late window resize resets the canvas and
  // clears it, and only a repaint after that resize leaves a frame to capture.
  let painted = 0;
  function paint() {
    renderer.draw({ plane, course, time: plane.time }, scene.screen, scene.best);
    painted += 1;
    if (painted >= 2) window.__shotReady = true;
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let titleTime = 0;

  // The title screen flies itself: an autopilot sortie behind the menu.
  let demo = createPlane(seed);
  const demoCourse = createCourse(seed);
  const demoWorld = { ...world, course: demoCourse };

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    Object.assign(plane, createPlane(seed));
    course.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Twelve rings, then land on the runway.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (plane.score > best) {
      best = plane.score;
      saveBest(best);
    }
    announce(won ? `Course complete. Score ${plane.score}.` : `Crashed. Score ${plane.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && screen !== SCREEN_PLAY && screen !== SCREEN_PAUSED) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      titleTime += STEP;
      stepPlane(demo, autopilot(demo, demoCourse), STEP, demoWorld);
      if (demo.status !== STATUS_FLYING || demoCourse.nextIndex >= 12) {
        demo = createPlane(seed);
        demoCourse.reset();
        titleTime = 0;
      }
      return;
    }
    const control = input.control();
    const events = stepPlane(plane, control, STEP, world);
    audio.update(plane.throttle, plane.speed, screen === SCREEN_PLAY);
    if (events & 1) audio.ring(Boolean(events & 2));
    if (events & 4) {
      audio.crash();
      endGame(false);
    } else if (events & 16) {
      audio.land();
      endGame(true);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const view = screen === SCREEN_TITLE ? { plane: demo, course: demoCourse, time: titleTime } : { plane, course, time: plane.time };
    renderer.draw(view, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // The playtest hook: autopilot the live game from the console or a driver.
  window.__game = {
    plane,
    course,
    get screen() {
      return screen;
    },
    start: startGame,
    autopilotStep() {
      if (screen !== SCREEN_PLAY) return null;
      return stepPlane(plane, autopilot(plane, course), STEP, world);
    },
  };

  announce('Skycourier. Press Enter or click to take off.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
