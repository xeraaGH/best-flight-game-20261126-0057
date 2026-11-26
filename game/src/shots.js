// The screenshot scenes behind ?shot=cover|ring|coast|runway|menu. Each one flies the
// real rules forward from a fresh world with a simple autopilot (steer at the next ring,
// hold the throttle, ease off when the ring is close), so the frame is what a short
// flight really looks like — and the same seed always gives the same frame.
import { PLANE, STEP } from './config.js';
import { clamp } from './random.js';
import { terrainHeight } from './terrain.js';
import { stepPlane } from './flight.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/** Steer toward the next ring: bank to turn, pitch to meet its height. After the last
 * ring, fly a proper landing pattern: a final approach fix north of the runway, then
 * a wings-level glide to the threshold. */
export function autopilot(plane, course) {
  const ring = course.nextRing();
  let target;
  let onFinal = false;
  if (ring) {
    target = ring;
    plane._final = false;
  } else {
    // A point target makes a fast plane orbit it forever, so the approach fix is a
    // gate: once the plane is close, latch onto the threshold and stay there.
    const dFix = Math.hypot(plane.x, plane.z + 640);
    if (dFix < 140) plane._final = true;
    if (plane._final) {
      // Aim past the threshold, down the strip: the plane touches down wherever
      // its glide meets the runway, instead of chasing a point behind it.
      target = { x: 0, y: 18, z: 240 }; // down the runway, wings level
      onFinal = true;
    } else {
      target = { x: 0, y: 48, z: -640 }; // final approach fix, north of the runway
    }
  }
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const dy = target.y - plane.y;
  const wantHeading = Math.atan2(dx, -dz);
  let dh = wantHeading - plane.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  let roll = Math.max(-1, Math.min(1, dh * 1.6));
  const dist = Math.hypot(dx, dz);
  let wantPitch = Math.max(-1, Math.min(1, (dy / Math.max(dist, 60)) * 2.2));
  if (onFinal) {
    // A point target makes the plane turn back for it once it passes; a glide does
    // not chase a point. Hold heading south down the centreline, pitch by height
    // above the strip, and roll only to correct the line.
    let hdgErr = Math.PI - plane.heading;
    while (hdgErr > Math.PI) hdgErr -= Math.PI * 2;
    while (hdgErr < -Math.PI) hdgErr += Math.PI * 2;
    roll = clamp(hdgErr * 1.2 + plane.x * 0.008, -0.4, 0.4);
    // Stick units here (-1..1), not radians: the flight model scales the stick by
    // maxPitch. Follow a 2.6-degree glide path to the threshold: pitch by the error
    // against the path, so the plane neither floats past the strip nor dives at it.
    const pathAlt = 16.5 + Math.max(0, -plane.z) * 0.045;
    wantPitch = clamp((pathAlt - plane.y) * 0.1, -0.5, 0.15);
  }
  // Terrain avoidance: if a ridge rises ahead, climb over it instead of through it.
  if (ring) {
    const fx = Math.sin(plane.heading);
    const fz = -Math.cos(plane.heading);
    const ahead = terrainHeight(plane.x + fx * 200, plane.z + fz * 200, plane.seed);
    if (ahead + 40 > plane.y && plane.y > 30) wantPitch = Math.max(wantPitch, 0.5);
  }
  const cruise = ring ? 0.72 : onFinal ? 0.42 : 0.55;
  const throttleDelta = plane.throttle < cruise ? 1 : plane.throttle > cruise + 0.05 ? -1 : 0;
  return { pitch: wantPitch, roll, throttleDelta, brake: onFinal && plane.speed > 42 };
}

/** Fly the autopilot until `stop(plane, course)` says so (or the flight ends). */
function flyUntil(plane, world, maxSeconds, stop) {
  const steps = Math.round(maxSeconds / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    events |= stepPlane(plane, autopilot(plane, world.course), STEP, world);
    if (plane.status !== 'flying' && plane.status !== 'landed') break;
    if (stop && stop(plane, world.course)) break;
  }
  return events;
}

function flySeconds(plane, world, seconds, pilot) {
  const steps = Math.round(seconds / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    const input = pilot ? pilot(plane, world.course) : { pitch: 0, roll: 0, throttleDelta: 0, brake: false };
    events |= stepPlane(plane, input, STEP, world);
    if (plane.status !== 'flying' && plane.status !== 'landed') break;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Any unknown name is the cover.
 */
export function stageShot(name, world) {
  const { plane, course } = world;
  course.reset();
  const fresh = () => {
    plane.x = 0;
    plane.y = 16.5;
    plane.z = 260;
    plane.heading = 0;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 0;
    plane.throttle = 0.25;
    plane.fuel = PLANE.fuel;
    plane.score = 0;
    plane.ringsPassed = 0;
    plane.time = 0;
    plane.status = 'flying';
    plane.crashReason = '';
    plane.onGround = true;
    plane.perfects = 0;
    plane._final = false;
  };

  if (name === 'menu') {
    fresh();
    plane.throttle = 0.6;
    flySeconds(plane, world, 14, autopilot);
    return { screen: SCREEN_TITLE, best: 1250 };
  }
  if (name === 'ring') {
    fresh();
    // Fly until the plane is a breath from the third ring, mid-pass.
    flyUntil(plane, world, 200, (p, c) => {
      if (c.nextIndex !== 2) return false;
      const ring = c.rings[2];
      return Math.hypot(ring.x - p.x, ring.y - p.y, ring.z - p.z) < 34;
    });
    return { screen: SCREEN_PLAY, best: 1250 };
  }
  if (name === 'coast') {
    fresh();
    // Fly out to the sea rings, and stop as the sixth ring comes into view.
    flyUntil(plane, world, 200, (p, c) => {
      if (c.nextIndex !== 5) return false;
      const ring = c.rings[5];
      return Math.hypot(ring.x - p.x, ring.y - p.y, ring.z - p.z) < 260;
    });
    return { screen: SCREEN_PLAY, best: 1250 };
  }
  if (name === 'runway') {
    fresh();
    // Fly the whole course, then hold on final approach to the runway: north of
    // the strip, heading south down its centreline, gear (and nerves) ready.
    flySeconds(plane, world, 400, autopilot);
    plane.heading = Math.PI;
    plane.pitch = -0.06;
    plane.roll = 0;
    plane.x = 0;
    plane.y = 46;
    plane.z = -600;
    plane.speed = 58;
    plane.throttle = 0.4;
    return { screen: SCREEN_PLAY, best: 1250 };
  }
  // cover: climbing out over the airfield with the first rings ahead.
  fresh();
  flySeconds(plane, world, 21, autopilot);
  return { screen: SCREEN_PLAY, best: 1250 };
}
