// The flight model: an arcade plane with a real bank-to-turn, a stall, fuel that runs
// down and a runway that forgives a slow touchdown. Pure numbers in, pure numbers out —
// no DOM here, so the same step runs in the browser and in a Node playtest.
import { COURSE, PLANE, RUNWAY } from './config.js';
import { clamp } from './random.js';
import { onRunway, terrainHeight } from './terrain.js';

export const STATUS_FLYING = 'flying';
export const STATUS_CRASHED = 'crashed';
export const STATUS_LANDED = 'landed';
export const STATUS_WON = 'won';

/** The plane starts parked on the runway, facing north, engine idling. */
export function createPlane(seed) {
  return {
    x: RUNWAY.x,
    y: 16.5,
    z: 260,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0.25,
    fuel: PLANE.fuel,
    score: 0,
    ringsPassed: 0,
    time: 0,
    status: STATUS_FLYING,
    crashReason: '',
    onGround: true,
    perfects: 0,
    seed,
  };
}

/**
 * One fixed step. `input` is { pitch: -1..1 (up positive), roll: -1..1 (right
 * positive), throttleDelta: -1..1, brake: boolean }. Returns an event bitmask:
 * 1 = ring passed, 2 = perfect ring, 4 = crashed, 8 = landed, 16 = won, 32 = fuel empty.
 */
export function stepPlane(plane, input, dt, world) {
  if (plane.status !== STATUS_FLYING && plane.status !== STATUS_LANDED) return 0;
  let events = 0;
  plane.time += dt;

  // Throttle: the lever moves at a steady rate; empty tanks force it shut.
  plane.throttle = clamp(plane.throttle + input.throttleDelta * 0.85 * dt, 0, 1);
  if (plane.fuel <= 0) {
    plane.throttle = 0;
    events |= 32;
  }
  plane.fuel = Math.max(0, plane.fuel - (0.22 + plane.throttle * PLANE.fuelDrain) * dt);

  // Roll banks toward the stick, then eases level when the stick centres.
  const targetRoll = input.roll * PLANE.maxRoll;
  const rollRate = input.roll !== 0 ? 2.4 : 1.5;
  plane.roll += clamp(targetRoll - plane.roll, -rollRate * dt, rollRate * dt);

  // Pitch follows the stick, but a stalled wing barely answers.
  const authority = plane.speed < PLANE.stallSpeed ? 0.35 + (plane.speed / PLANE.stallSpeed) * 0.65 : 1;
  const targetPitch = input.pitch * PLANE.maxPitch * authority;
  plane.pitch += clamp(targetPitch - plane.pitch, -1.8 * dt, 1.8 * dt);

  // A banked wing turns the nose. This is arcade turn rate, not a textbook one:
  // at full bank the plane turns in about eight seconds, tight enough to line up
  // on a 26 m ring from a few hundred metres out.
  const turnRate = Math.tan(plane.roll) * 0.55;
  plane.heading += turnRate * dt;

  // Speed chases the throttle, bleeding off in a climb and gaining in a dive.
  const targetSpeed = PLANE.minSpeed + plane.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  plane.speed += (targetSpeed - plane.speed) * 0.45 * dt;
  plane.speed -= Math.sin(plane.pitch) * 14 * dt;
  if (input.brake) plane.speed -= 26 * dt;
  plane.speed = clamp(plane.speed, 0, PLANE.maxSpeed + 12);

  // Move: forward along the heading, up or down with the pitch.
  const fx = Math.sin(plane.heading) * Math.cos(plane.pitch);
  const fz = -Math.cos(plane.heading) * Math.cos(plane.pitch);
  const fy = Math.sin(plane.pitch);
  plane.x += fx * plane.speed * dt;
  plane.z += fz * plane.speed * dt;
  plane.y += fy * plane.speed * dt;
  // Below flying speed the wing stops holding the plane up.
  if (plane.speed < PLANE.stallSpeed && !plane.onGround) {
    plane.y -= (PLANE.stallSpeed - plane.speed) * 0.55 * dt;
  }

  // Rings: crossing a ring's plane inside its circle scores it.
  const ringEvent = world.course.checkRings(plane);
  events |= ringEvent;

  // The ground: what happens depends on whether the plane was already rolling or
  // is coming down out of the air. A takeoff roll is safe at any speed; a touchdown
  // is safe when it is slow and level on the runway; anything else is a crash.
  const ground = terrainHeight(plane.x, plane.z, plane.seed);
  if (plane.y <= ground + 2.6) {
    plane.y = ground + 2.6;
    const wasAirborne = !plane.onGround;
    if (onRunway(plane.x, plane.z)) {
      plane.onGround = true;
      if (wasAirborne) {
        if (plane.speed < 60 && Math.abs(plane.pitch) < 0.25 && Math.abs(plane.roll) < 0.45) {
          plane.speed = Math.max(0, plane.speed - 30 * dt);
          if (plane.ringsPassed >= world.course.rings.length) {
            plane.status = STATUS_WON;
            plane.score += COURSE.landingBonus;
            events |= 16;
          } else if (plane.status !== STATUS_LANDED) {
            plane.status = STATUS_LANDED;
            events |= 8;
          }
        } else {
          plane.status = STATUS_CRASHED;
          plane.crashReason = 'Hard landing — too fast or too steep for the runway';
          events |= 4;
        }
      } else {
        // Still rolling: a little drag, and the runway forgives the speed.
        plane.speed = Math.max(0, plane.speed - 8 * dt);
      }
    } else if (wasAirborne && plane.speed > 12) {
      plane.status = STATUS_CRASHED;
      plane.crashReason =
        ground < 1 ? 'Ditched in the sea' : 'Flew into the terrain';
      events |= 4;
    } else {
      plane.status = STATUS_CRASHED;
      plane.crashReason = 'Stalled into the ground';
      events |= 4;
    }
  } else {
    plane.onGround = false;
    if (plane.status === STATUS_LANDED) plane.status = STATUS_FLYING;
  }
  return events;
}

/** Knots, feet and a compass heading, for the HUD. */
export function flightReadout(plane) {
  return {
    knots: Math.round(plane.speed * 1.944),
    feet: Math.max(0, Math.round((plane.y - 14) * 3.281)),
    headingDeg: Math.round(((plane.heading * 180) / Math.PI % 360 + 360) % 360),
    throttlePct: Math.round(plane.throttle * 100),
    fuelPct: Math.round((plane.fuel / PLANE.fuel) * 100),
  };
}
