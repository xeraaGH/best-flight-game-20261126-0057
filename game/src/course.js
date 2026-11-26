// The course: twelve glowing rings in a loop out over the city, the coast and the high
// mountain pass, then back to the runway. Each ring's altitude is lifted clear of the
// terrain under it, so every ring is flyable and none is buried in a hillside.
import { COURSE } from './config.js';
import { terrainHeight } from './terrain.js';

/** The loop's waypoints: [x, wanted altitude, z]. */
const WAYPOINTS = [
  [0, 75, -350],
  [220, 90, -700],
  [420, 100, -1000],
  [250, 140, -1350],
  [-250, 130, -1650],
  [-700, 115, -1950],
  [-500, 160, -2350],
  [0, 200, -2650],
  [520, 215, -2850],
  [700, 160, -2350],
  [550, 110, -1750],
  [150, 70, -700],
];

export function createCourse(seed) {
  const rings = WAYPOINTS.map(([x, y, z], index) => {
    const ground = terrainHeight(x, z, seed);
    const next = WAYPOINTS[(index + 1) % WAYPOINTS.length];
    const dx = next[0] - x;
    const dz = next[2] - z;
    const len = Math.hypot(dx, dz) || 1;
    return {
      index,
      x,
      y: Math.max(y, ground + 62),
      z,
      // The ring faces the next ring, so the pilot always flies through it square-on.
      nx: dx / len,
      nz: dz / len,
      radius: COURSE.ringRadius,
      passed: false,
      perfect: false,
    };
  });
  return {
    rings,
    /** Signed distance from (x, y, z) to the next ring's plane, in metres. */
    nextIndex: 0,
    prevSide: null,
    /**
     * Called every step: when the plane's segment crosses the next ring's plane inside
     * the ring, the ring scores. Returns 1 (passed) or 3 (passed, dead centre).
     */
    checkRings(plane) {
      if (this.nextIndex >= rings.length) return 0;
      const ring = rings[this.nextIndex];
      const side = (plane.x - ring.x) * ring.nx + (plane.z - ring.z) * ring.nz;
      if (this.prevSide === null) {
        this.prevSide = side;
        return 0;
      }
      let event = 0;
      if (this.prevSide < 0 && side >= 0) {
        const lateral = Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
        if (lateral < ring.radius) {
          ring.passed = true;
          plane.ringsPassed += 1;
          plane.score += COURSE.ringPoints;
          event = 1;
          if (lateral < COURSE.perfectRadius) {
            ring.perfect = true;
            plane.perfects += 1;
            plane.score += COURSE.perfectBonus;
            event = 3;
          }
          this.nextIndex += 1;
        }
      }
      this.prevSide = side;
      return event;
    },
    nextRing() {
      return this.nextIndex < rings.length ? rings[this.nextIndex] : null;
    },
    reset() {
      this.nextIndex = 0;
      this.prevSide = null;
      for (const ring of rings) {
        ring.passed = false;
        ring.perfect = false;
      }
    },
  };
}
