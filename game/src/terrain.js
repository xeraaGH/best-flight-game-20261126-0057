// The island of Coral Coast: one height function drives everything — the terrain mesh,
// the sea, the city plateau, the runway flattening and the ring altitudes — so the world
// the plane flies over is the same world the course was planned against.
import { AIRFIELD, CITY, RUNWAY, SEA_LEVEL } from './config.js';
import { clamp, fbm, lerp, smoothstep, valueNoise } from './random.js';

/** Where the sea starts: a wavy coastline west of the airfield. */
export function coastX(z, seed) {
  return -640 + 170 * Math.sin(z * 0.0008) + 130 * (valueNoise(3.7, z * 0.0011, seed) - 0.5) * 2;
}

/** Ground height in metres at world (x, z). Below SEA_LEVEL is water. */
export function terrainHeight(x, z, seed) {
  const hills = fbm(x * 0.0012, z * 0.0012, seed, 3) * 78;
  // Mountains rise to the far north and the far east.
  const ridgeNoise = fbm(x * 0.00045 + 13.7, z * 0.00045 - 4.2, seed, 3);
  const mountainMask =
    smoothstep(-1200, -2300, z) * 0.85 + smoothstep(850, 1450, x) * 0.55;
  const ridge = smoothstep(0.56, 0.74, ridgeNoise) * 430 * clamp(mountainMask, 0, 1);
  let h = hills + ridge;

  // The sea: below the coastline the ground falls away under the water.
  const d = x - coastX(z, seed);
  const seaFloor = SEA_LEVEL - 16 + d * 0.02;
  h = lerp(seaFloor, h, smoothstep(-70, 70, d));

  // Flatten the airfield and the city so the runway and streets sit on level ground.
  // The airfield flatten is an ellipse stretched along the runway, so the whole
  // strip — ends included — is level and the runway never sinks into a hillside.
  const ex = (x - AIRFIELD.x) / 130;
  const ez = (z - AIRFIELD.z) / 650;
  const airDist = Math.hypot(ex, ez);
  h = lerp(h, AIRFIELD.height, smoothstep(1.35, 0.95, airDist));
  const cityDist = Math.hypot(x - CITY.x, z - CITY.z);
  h = lerp(h, CITY.height, smoothstep(CITY.radius, 130, cityDist));
  return h;
}

export function isWater(x, z, seed) {
  return terrainHeight(x, z, seed) < SEA_LEVEL + 0.5;
}

/** True when (x, z) is on the runway strip (the only place a slow touchdown is safe). */
export function onRunway(x, z) {
  return (
    Math.abs(x - RUNWAY.x) < RUNWAY.halfWidth &&
    Math.abs(z - RUNWAY.z) < RUNWAY.halfLength
  );
}

/** The city: deterministic blocks of buildings, each with a footprint and a height. */
export function buildCity(seed) {
  const buildings = [];
  const rng = mulberryFromSeed(seed ^ 0x5f3759df);
  const spacing = 64;
  for (let gx = -4; gx <= 4; gx += 1) {
    for (let gz = -4; gz <= 4; gz += 1) {
      if (Math.abs(gx) < 1 && Math.abs(gz) < 1) continue; // the plaza stays open
      if (rng() < 0.22) continue; // parks and empty lots
      const w = 22 + rng() * 18;
      const d = 22 + rng() * 18;
      const h = 14 + rng() * rng() * 52;
      buildings.push({
        x: CITY.x + gx * spacing + (rng() - 0.5) * 14,
        z: CITY.z + gz * spacing + (rng() - 0.5) * 14,
        w,
        d,
        h: h + CITY.height,
        hue: rng(),
      });
    }
  }
  return buildings;
}

function mulberryFromSeed(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Puffy clouds drifting over the island, placed once per seed. */
export function buildClouds(seed) {
  const rng = mulberryFromSeed(seed ^ 0x9e3779b9);
  const clouds = [];
  for (let i = 0; i < 46; i += 1) {
    clouds.push({
      x: -1600 + rng() * 3400,
      y: 300 + rng() * 260,
      z: 500 - rng() * 4200,
      r: 34 + rng() * 62,
      puffs: 3 + Math.floor(rng() * 3),
      seed: rng(),
    });
  }
  return clouds;
}
