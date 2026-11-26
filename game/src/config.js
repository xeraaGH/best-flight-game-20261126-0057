// Skycourier — Ring Run over Coral Coast.
// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule depends on the screen size.
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Default seed: the same seed always builds the same coast, city and course. */
export const DEFAULT_SEED = 20261126;

export const SEA_LEVEL = 0;

/** The airfield plateau: runway, apron and the city beside it sit on flattened ground. */
export const AIRFIELD = { x: 0, z: 0, radius: 430, height: 14 };
export const CITY = { x: 380, z: -950, radius: 330, height: 18 };
export const RUNWAY = { x: 0, z: 0, halfWidth: 32, halfLength: 380, heading: 0 };

export const PLANE = {
  /** m/s at full throttle, and the slowest speed that still holds altitude. */
  maxSpeed: 96,
  minSpeed: 24,
  stallSpeed: 38,
  maxRoll: 0.95,
  maxPitch: 0.42,
  /** Fuel seconds at full throttle, roughly: the course needs about half a tank. */
  fuel: 150,
  fuelDrain: 0.28,
};

export const COURSE = {
  ringRadius: 26,
  perfectRadius: 12,
  ringPoints: 100,
  perfectBonus: 50,
  landingBonus: 500,
  /** Seconds of par time; beating it pays a time bonus at the finish. */
  parSeconds: 240,
};

export const PALETTE = {
  skyTop: '#2a68c8',
  skyMid: '#7db4e8',
  horizon: '#ffd9a0',
  sun: '#fff3c4',
  seaDeep: '#14608f',
  seaShallow: '#2f9bc4',
  sand: '#e2cb92',
  grassA: '#5da24a',
  grassB: '#7cbf5a',
  forest: '#2f7a3d',
  rock: '#8a7d6b',
  snow: '#f2f5f7',
  urban: '#9aa0a3',
  runway: '#33373d',
  runwayMark: '#f4f6f8',
  ringNext: '#ffc93c',
  ringDone: '#37e08b',
  ringFar: '#9fd8ff',
  planeBody: '#e8543f',
  planeWing: '#f4f1e6',
  planeGlass: '#bfe6ff',
  hudPanel: 'rgba(6, 18, 30, 0.62)',
  hudText: '#d9f7e8',
  hudAmber: '#ffc93c',
  hudRed: '#ff5d4d',
  hudGreen: '#37e08b',
};

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'skycourier.best';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"SF Mono", "Cascadia Mono", Consolas, monospace';
