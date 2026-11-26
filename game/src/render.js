// The renderer: a chase camera over a low-poly island, a drawn propeller plane, glowing
// rings, and a lit HUD — all on one canvas, so a screenshot is exactly what the player
// sees. Nothing here touches the network; every colour comes from config.js.
import {
  AIRFIELD,
  CITY,
  COURSE,
  FONT,
  FONT_MONO,
  PALETTE,
  RUNWAY,
  VIEW,
} from './config.js';
import { clamp, fbm, lerp, smoothstep, valueNoise } from './random.js';
import { coastX, onRunway, terrainHeight } from './terrain.js';
import { flightReadout } from './flight.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const CELL = 50;
const FOV = (68 * Math.PI) / 180;
const TAU = Math.PI * 2;

/** Blend two #rrggbb colours; returns a #rrggbb colour, so it chains with shade(). */
function hexLerp(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** Multiply a #rrggbb colour by a factor; returns #rrggbb, so it chains with hexLerp. */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function createRenderer(canvas, world) {
  const ctx = canvas.getContext('2d');
  const W = VIEW.width;
  const H = VIEW.height;
  const F = (H / 2) / Math.tan(FOV / 2);
  const seed = world.seed;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- camera ---------------------------------------------------------------
  let cam = null;
  function updateCamera(plane) {
    const fx = Math.sin(plane.heading) * Math.cos(plane.pitch);
    const fy = Math.sin(plane.pitch);
    const fz = -Math.cos(plane.heading) * Math.cos(plane.pitch);
    const cx = plane.x - fx * 21;
    const cy = plane.y - fy * 21 + 6.2;
    const cz = plane.z - fz * 21;
    const lx = plane.x + fx * 70;
    const ly = plane.y + fy * 70 - 2;
    const lz = plane.z + fz * 70;
    let fwdx = lx - cx;
    let fwdy = ly - cy;
    let fwdz = lz - cz;
    const fl = Math.hypot(fwdx, fwdy, fwdz) || 1;
    fwdx /= fl;
    fwdy /= fl;
    fwdz /= fl;
    // right = fwd x world-up, normalised; up = right x fwd.
    let rx = -fwdz;
    let rz = fwdx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const upx = -rz * fwdy;
    const upy = rz * fwdx - rx * fwdz;
    const upz = rx * fwdy;
    cam = {
      x: cx,
      y: cy,
      z: cz,
      fwd: [fwdx, fwdy, fwdz],
      right: [rx, 0, rz],
      up: [upx, upy, upz],
    };
  }

  function project(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const cz = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
    if (cz < 2) return null;
    const cx = dx * cam.right[0] + dz * cam.right[2];
    const cy = dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2];
    return { x: W / 2 + (cx * F) / cz, y: H / 2 - (cy * F) / cz, d: cz };
  }

  /** Camera-space coordinates of a world point (for near-plane clipping). */
  function toCamera(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    return {
      x: dx * cam.right[0] + dz * cam.right[2],
      y: dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2],
      z: dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2],
    };
  }

  function fromCamera(p) {
    return { x: W / 2 + (p.x * F) / p.z, y: H / 2 - (p.y * F) / p.z, d: p.z };
  }

  /**
   * Fill a world-space quad, clipped against the camera's near plane so the ground
   * never leaves a hole at the bottom of the frame.
   */
  function fillQuad(corners, fill) {
    let poly = corners.map(([x, y, z]) => toCamera(x, y, z));
    const clipped = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a.z >= 2) clipped.push(a);
      if ((a.z >= 2) !== (b.z >= 2)) {
        const t = (2 - a.z) / (b.z - a.z);
        clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 2 });
      }
    }
    poly = clipped;
    if (poly.length < 3) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    const first = fromCamera(poly[0]);
    ctx.moveTo(first.x, first.y);
    for (const p of poly.slice(1)) {
      const s = fromCamera(p);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ---- sky ------------------------------------------------------------------
  function drawSky(plane) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.55, PALETTE.skyMid);
    g.addColorStop(1, PALETTE.horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // The sun hangs low over the sea to the west, so the light feels like late afternoon.
    const sun = project(plane.x - 2600, 620, plane.z - 2600);
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 190);
      glow.addColorStop(0, 'rgba(255, 243, 196, 0.95)');
      glow.addColorStop(0.25, 'rgba(255, 220, 150, 0.55)');
      glow.addColorStop(1, 'rgba(255, 220, 150, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 200, sun.y - 200, 400, 400);
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, TAU);
      ctx.fill();
    }
  }

  function drawClouds(plane) {
    const list = [];
    for (const c of world.clouds) {
      const p = project(c.x, c.y, c.z);
      if (!p) continue;
      list.push({ c, p });
    }
    list.sort((a, b) => b.p.d - a.p.d);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const { c, p } of list) {
      const s = (c.r * F) / p.d;
      if (s < 2) continue;
      const n = c.puffs;
      for (let i = 0; i < n; i += 1) {
        const ox = (valueNoise(c.seed * 91 + i * 17, 3.3, seed) - 0.5) * s * 1.6;
        const oy = (valueNoise(c.seed * 57 + i * 29, 7.7, seed) - 0.5) * s * 0.5;
        const r = s * (0.45 + valueNoise(i * 13, c.seed * 31, seed) * 0.4);
        ctx.beginPath();
        ctx.ellipse(p.x + ox, p.y + oy, r, r * 0.55, 0, 0, TAU);
        ctx.fill();
      }
    }
    void plane;
  }

  // ---- terrain ---------------------------------------------------------------
  function cellColour(x, z, h, patch) {
    if (h < 1.2) {
      const t = clamp((h + 14) / 15, 0, 1);
      return hexLerp(PALETTE.seaDeep, PALETTE.seaShallow, t);
    }
    if (h < 5.5 && x > coastX(z, seed) - 40) return PALETTE.sand;
    if (h > 300) return PALETTE.snow;
    if (h > 165) return PALETTE.rock;
    const inCity = Math.hypot(x - CITY.x, z - CITY.z) < CITY.radius;
    if (inCity) return patch > 0.5 ? PALETTE.urban : hexLerp(PALETTE.grassA, PALETTE.grassB, patch);
    if (patch > 0.66) return PALETTE.forest;
    return hexLerp(PALETTE.grassA, PALETTE.grassB, patch);
  }

  function drawTerrain(plane) {
    const x0 = Math.floor((plane.x - 1150) / CELL) * CELL;
    const x1 = plane.x + 1150;
    const z0 = Math.floor((plane.z - 2300) / CELL) * CELL;
    const z1 = plane.z + 500;
    const cells = [];
    for (let z = z0; z < z1; z += CELL) {
      for (let x = x0; x < x1; x += CELL) {
        const h00 = terrainHeight(x, z, seed);
        const h10 = terrainHeight(x + CELL, z, seed);
        const h01 = terrainHeight(x, z + CELL, seed);
        const h11 = terrainHeight(x + CELL, z + CELL, seed);
        const avg = (h00 + h10 + h01 + h11) / 4;
        const dcx = x + CELL / 2 - cam.x;
        const dcz = z + CELL / 2 - cam.z;
        const dist2 = dcx * dcx + dcz * dcz;
        if (dist2 > 2300 * 2300) continue;
        cells.push({ x, z, h00, h10, h01, h11, avg, dist2 });
      }
    }
    cells.sort((a, b) => b.dist2 - a.dist2);
    for (const c of cells) {
      const patch = valueNoise(c.x * 0.01, c.z * 0.01, seed);
      const slope = clamp(1 - Math.abs(c.h10 - c.h00) / 90 - Math.abs(c.h01 - c.h00) / 90, 0.72, 1);
      const haze = smoothstep(600, 2100, Math.sqrt(c.dist2));
      const base = cellColour(c.x + CELL / 2, c.z + CELL / 2, c.avg, patch);
      const col = shade(base, slope * (0.92 + patch * 0.12));
      const fill = haze > 0.02 ? hexLerp(col, '#bcd8ee', haze * 0.55) : col;
      fillQuad(
        [
          [c.x, c.h00, c.z],
          [c.x + CELL, c.h10, c.z],
          [c.x + CELL, c.h11, c.z + CELL],
          [c.x, c.h01, c.z + CELL],
        ],
        fill,
      );
    }
  }

  function drawRunway() {
    const y = AIRFIELD.height + 0.4;
    const corners = [
      project(RUNWAY.x - RUNWAY.halfWidth, y, RUNWAY.z - RUNWAY.halfLength),
      project(RUNWAY.x + RUNWAY.halfWidth, y, RUNWAY.z - RUNWAY.halfLength),
      project(RUNWAY.x + RUNWAY.halfWidth, y, RUNWAY.z + RUNWAY.halfLength),
      project(RUNWAY.x - RUNWAY.halfWidth, y, RUNWAY.z + RUNWAY.halfLength),
    ];
    if (corners.some((c) => !c)) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes and the two thresholds.
    ctx.fillStyle = PALETTE.runwayMark;
    for (let z = RUNWAY.z - RUNWAY.halfLength + 40; z < RUNWAY.z + RUNWAY.halfLength - 30; z += 60) {
      const a = project(RUNWAY.x - 1.6, y + 0.2, z);
      const b = project(RUNWAY.x + 1.6, y + 0.2, z);
      const c2 = project(RUNWAY.x + 1.6, y + 0.2, z + 26);
      const d = project(RUNWAY.x - 1.6, y + 0.2, z + 26);
      if (!a || !b || !c2 || !d) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBuildings() {
    const list = [];
    for (const b of world.city) {
      const dx = b.x - cam.x;
      const dz = b.z - cam.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > 1300 * 1300) continue;
      const p = project(b.x, b.h, b.z);
      if (!p) continue;
      list.push({ b, dist2 });
    }
    list.sort((a, b) => b.dist2 - a.dist2);
    for (const { b } of list) {
      const hw = b.w / 2;
      const hd = b.d / 2;
      const base = CITY.height;
      const corners = [
        [b.x - hw, base, b.z - hd],
        [b.x + hw, base, b.z - hd],
        [b.x + hw, base, b.z + hd],
        [b.x - hw, base, b.z + hd],
      ];
      const tops = corners.map(([x, , z]) => [x, b.h, z]);
      const wall = shade(['#8d99a8', '#b08968', '#7fa8c9', '#a8a28d'][Math.floor(b.hue * 4) % 4], 0.9);
      const wallDark = shade(wall, 0.72);
      const top = shade(wall, 1.25);
      // The two faces that look at the camera: pick by the camera's side.
      const facingEast = cam.x > b.x;
      const facingNorth = cam.z < b.z;
      const faces = [];
      if (facingEast) faces.push([1, 2, wall]);
      else faces.push([3, 0, wallDark]);
      if (facingNorth) faces.push([0, 1, wallDark]);
      else faces.push([2, 3, wall]);
      for (const [i, j, col] of faces) {
        const a = project(...corners[i]);
        const c = project(...corners[j]);
        const d = project(...tops[j]);
        const e = project(...tops[i]);
        if (!a || !c || !d || !e) continue;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.lineTo(e.x, e.y);
        ctx.closePath();
        ctx.fill();
      }
      const tp = tops.map(([x, y, z]) => project(x, y, z));
      if (tp.every(Boolean)) {
        ctx.fillStyle = top;
        ctx.beginPath();
        ctx.moveTo(tp[0].x, tp[0].y);
        for (const p of tp.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // ---- rings ------------------------------------------------------------------
  function drawRings(course, time, showLabels) {
    for (const ring of course.rings) {
      if (ring.passed) continue;
      const p = project(ring.x, ring.y, ring.z);
      if (!p) continue;
      const isNext = ring === course.nextRing();
      const dot = Math.abs(cam.fwd[0] * ring.nx + cam.fwd[2] * ring.nz);
      const rx = (ring.radius * F) / p.d;
      const ry = Math.max(rx * clamp(dot, 0.14, 1), 2);
      if (rx < 1.5) continue;
      const colour = isNext ? PALETTE.ringNext : PALETTE.ringFar;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (isNext) {
        ctx.shadowColor = colour;
        ctx.shadowBlur = 22 + Math.sin(time * 4) * 6;
      }
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(3, rx * 0.1);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1.5, rx * 0.035);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.82, ry * 0.82, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      // A faint tether to the ground helps the pilot read the ring's height.
      const ground = project(ring.x, terrainHeight(ring.x, ring.z, seed) + 1, ring.z);
      if (ground) {
        ctx.strokeStyle = isNext ? 'rgba(255,201,60,0.35)' : 'rgba(159,216,255,0.22)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(ground.x, ground.y);
        ctx.stroke();
      }
      if (isNext && rx > 14 && showLabels) {
        ctx.fillStyle = PALETTE.hudText;
        ctx.font = `600 ${Math.max(13, Math.min(20, rx * 0.32))}px ${FONT_MONO}`;
        ctx.textAlign = 'center';
        const dist = Math.round(Math.hypot(ring.x - cam.x, ring.y - cam.y, ring.z - cam.z));
        ctx.fillText(`RING ${ring.index + 1} · ${dist} m`, p.x, p.y - ry - 12);
      }
    }
  }

  // ---- the plane ---------------------------------------------------------------
  function drawPlaneShadow(plane) {
    const ground = terrainHeight(plane.x, plane.z, seed);
    const p = project(plane.x, ground + 1, plane.z);
    if (!p || plane.y - ground > 260) return;
    const s = clamp((26 * F) / p.d, 2, 90) * clamp(1 - (plane.y - ground) / 300, 0.25, 1);
    ctx.fillStyle = `rgba(10, 20, 30, ${0.22 * clamp(1 - (plane.y - ground) / 300, 0.2, 1)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s, s * 0.3, 0, 0, TAU);
    ctx.fill();
  }

  function drawPlane(plane, time) {
    const px = W / 2;
    const py = H * 0.62 + plane.pitch * 46;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(plane.roll * 0.85);
    const s = 0.82;
    ctx.scale(s, s);
    // Propeller disc, spinning, just beyond the nose.
    const propA = (time * 31) % TAU;
    ctx.save();
    ctx.translate(0, -118);
    ctx.rotate(propA);
    ctx.fillStyle = 'rgba(220, 230, 240, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 64, 10, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // Wings, cream with red tips, seen from behind and above.
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-168, 18);
    ctx.lineTo(-30, -6);
    ctx.lineTo(-24, 22);
    ctx.lineTo(-150, 44);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(168, 18);
    ctx.lineTo(30, -6);
    ctx.lineTo(24, 22);
    ctx.lineTo(150, 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-150, 18);
    ctx.lineTo(-168, 18);
    ctx.lineTo(-150, 44);
    ctx.lineTo(-132, 40);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(150, 18);
    ctx.lineTo(168, 18);
    ctx.lineTo(150, 44);
    ctx.lineTo(132, 40);
    ctx.closePath();
    ctx.fill();
    // Fuselage, tapering away to the nose.
    const body = ctx.createLinearGradient(-26, 0, 26, 0);
    body.addColorStop(0, '#c23a2a');
    body.addColorStop(0.5, PALETTE.planeBody);
    body.addColorStop(1, '#f07a5e');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-24, 52);
    ctx.quadraticCurveTo(-30, -58, -13, -108);
    ctx.lineTo(13, -108);
    ctx.quadraticCurveTo(30, -58, 24, 52);
    ctx.quadraticCurveTo(0, 62, -24, 52);
    ctx.closePath();
    ctx.fill();
    // Canopy glass, lit.
    const glass = ctx.createLinearGradient(0, -96, 0, -52);
    glass.addColorStop(0, '#eaf7ff');
    glass.addColorStop(1, '#5aa8d8');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.ellipse(0, -74, 12, 20, 0, 0, TAU);
    ctx.fill();
    // Tail fin and stabiliser.
    ctx.fillStyle = '#c23a2a';
    ctx.beginPath();
    ctx.moveTo(-4, 46);
    ctx.lineTo(-16, 84);
    ctx.lineTo(16, 84);
    ctx.lineTo(4, 46);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-72, 52);
    ctx.lineTo(-16, 44);
    ctx.lineTo(-14, 58);
    ctx.lineTo(-66, 66);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(72, 52);
    ctx.lineTo(16, 44);
    ctx.lineTo(14, 58);
    ctx.lineTo(66, 66);
    ctx.closePath();
    ctx.fill();
    // Registration, small and proud.
    ctx.fillStyle = '#fff6e8';
    ctx.font = `700 13px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('SKY-7', 0, 34);
    ctx.restore();
  }

  // ---- HUD ---------------------------------------------------------------------
  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.strokeStyle = 'rgba(120, 255, 190, 0.35)';
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCompass(headingDeg) {
    const cx = W / 2;
    const y = 18;
    panel(cx - 170, y, 340, 44);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 168, y, 336, 44);
    ctx.clip();
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    // Ticks sit on absolute headings, so N/E/S/W and the 45° marks always land.
    const first = Math.floor((headingDeg - 90) / 15) * 15;
    for (let deg = first; deg <= headingDeg + 90; deg += 15) {
      const wrapped = ((deg % 360) + 360) % 360;
      const x = cx + (deg - headingDeg) * 1.7;
      const major = wrapped % 45 === 0;
      ctx.strokeStyle = major ? PALETTE.hudText : 'rgba(217,247,232,0.45)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 30);
      ctx.lineTo(x, y + (major ? 18 : 24));
      ctx.stroke();
      if (major) {
        const label = wrapped === 0 ? 'N' : wrapped === 90 ? 'E' : wrapped === 180 ? 'S' : wrapped === 270 ? 'W' : String(wrapped);
        ctx.fillStyle = PALETTE.hudText;
        ctx.fillText(label, x, y + 13);
      }
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(cx, y + 44);
    ctx.lineTo(cx - 6, y + 36);
    ctx.lineTo(cx + 6, y + 36);
    ctx.closePath();
    ctx.fill();
  }

  /** A moving tape: numbers slide past a fixed amber marker. topY keeps the tape
   * clear of the corner panels above it. */
  function drawTape(x, value, step, label, topY = 170) {
    panel(x - 34, topY, 68, 220);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 32, topY + 2, 64, 216);
    ctx.clip();
    ctx.font = `600 12px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    const centre = topY + 110;
    for (let v = Math.floor((value - 110) / step) * step; v <= value + 110; v += step) {
      const y = centre - (v - value) * 1.1;
      if (y < topY + 4 || y > topY + 216) continue;
      ctx.fillStyle = 'rgba(217,247,232,0.6)';
      ctx.fillText(String(v), x + 26, y + 4);
      ctx.strokeStyle = 'rgba(217,247,232,0.4)';
      ctx.beginPath();
      ctx.moveTo(x - 28, y);
      ctx.lineTo(x - 18, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.fillRect(x - 34, centre - 4, 68, 8);
    ctx.fillStyle = '#0a1a26';
    ctx.font = `700 15px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${value}`, x, centre + 5);
    ctx.fillStyle = 'rgba(217,247,232,0.75)';
    ctx.font = `600 11px ${FONT_MONO}`;
    ctx.fillText(label, x, topY + 238);
  }

  function drawHorizon(plane) {
    const cx = 96;
    const cy = H - 96;
    const r = 58;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-plane.roll);
    ctx.translate(0, plane.pitch * 90);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-r - 4, -r - 90, r * 2 + 8, r + 90);
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(-r - 4, 0, r * 2 + 8, r + 90);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(120,255,190,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    // Fixed wings: the horizon moves, the plane does not.
    ctx.strokeStyle = PALETTE.hudAmber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx + 34, cy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(217,247,232,0.75)';
    ctx.font = `600 11px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, cy + r + 16);
    // Throttle lever beside it.
    const tx = 178;
    panel(tx - 14, H - 168, 28, 144);
    ctx.fillStyle = '#12303f';
    ctx.fillRect(tx - 6, H - 160, 12, 128);
    const th = plane.throttle;
    ctx.fillStyle = th > 0.85 ? PALETTE.hudAmber : PALETTE.hudGreen;
    ctx.fillRect(tx - 6, H - 32 - th * 128, 12, th * 128);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `700 12px ${FONT_MONO}`;
    ctx.fillText(`${Math.round(th * 100)}%`, tx, H - 178);
    ctx.fillStyle = 'rgba(217,247,232,0.75)';
    ctx.font = `600 11px ${FONT_MONO}`;
    ctx.fillText('THR', tx, H - 14);
  }

  function drawHud(plane, course, time, best) {
    const r = flightReadout(plane);
    const mm = String(Math.floor(time / 60)).padStart(2, '0');
    const ss = String(Math.floor(time % 60)).padStart(2, '0');

    drawCompass(r.headingDeg);
    drawTape(52, r.knots, 20, 'SPEED kt');
    drawTape(W - 52, r.feet, 100, 'ALT ft');

    // Top-left flight data.
    panel(16, 66, 210, 96);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText(`ALT ${r.feet} ft`, 30, 94);
    ctx.fillText(`SPD ${r.knots} kt`, 30, 122);
    ctx.fillText(`HDG ${String(r.headingDeg).padStart(3, '0')}°`, 30, 150);

    // Top-right score and fuel.
    panel(W - 226, 66, 210, 122);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText(`SCORE ${plane.score}`, W - 212, 94);
    ctx.fillText(`RINGS ${plane.ringsPassed}/${course.rings.length}`, W - 212, 122);
    ctx.fillStyle = 'rgba(217,247,232,0.6)';
    ctx.font = `600 12px ${FONT_MONO}`;
    ctx.fillText(`TIME ${mm}:${ss}   BEST ${best}`, W - 212, 150);
    const fuelW = 182;
    ctx.fillStyle = '#12303f';
    ctx.fillRect(W - 212, 158, fuelW, 9);
    ctx.fillStyle = r.fuelPct < 25 ? PALETTE.hudRed : PALETTE.hudGreen;
    ctx.fillRect(W - 212, 158, (fuelW * r.fuelPct) / 100, 9);
    ctx.fillStyle = 'rgba(217,247,232,0.75)';
    ctx.font = `600 11px ${FONT_MONO}`;
    ctx.fillText(`FUEL ${r.fuelPct}%`, W - 212, 182);

    drawHorizon(plane);

    // Next-ring pointer: a diamond at the screen edge when the ring is off-screen.
    const next = course.nextRing();
    if (next) {
      const p = project(next.x, next.y, next.z);
      const dist = Math.round(Math.hypot(next.x - plane.x, next.y - plane.y, next.z - plane.z));
      if (!p || p.x < 40 || p.x > W - 40 || p.y < 40 || p.y > H - 40) {
        const ang = Math.atan2(
          (p ? p.y : H / 2) - H / 2,
          (p ? p.x : W / 2) - W / 2,
        );
        const ex = W / 2 + Math.cos(ang) * 300;
        const ey = H / 2 + Math.sin(ang) * 180;
        ctx.save();
        ctx.translate(clamp(ex, 60, W - 60), clamp(ey, 80, H - 80));
        ctx.rotate(ang);
        ctx.fillStyle = PALETTE.ringNext;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = `600 14px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(`NEXT RING ${next.index + 1} — ${dist} m`, W / 2, H - 24);
    } else {
      ctx.fillStyle = PALETTE.hudGreen;
      ctx.font = `700 16px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText('ALL RINGS CLEAR — LAND ON THE RUNWAY', W / 2, H - 24);
    }

    // Warnings, flashing with the clock. PULL UP reads the ground ahead, not the
    // ground below, and stays quiet over the runway strip itself.
    const ground = terrainHeight(plane.x, plane.z, seed);
    const fx = Math.sin(plane.heading);
    const fz = -Math.cos(plane.heading);
    const aheadGround = Math.max(
      terrainHeight(plane.x + fx * 150, plane.z + fz * 150, seed),
      terrainHeight(plane.x + fx * 300, plane.z + fz * 300, seed),
    );
    const aheadIsRunway = onRunway(plane.x + fx * 150, plane.z + fz * 150);
    const blink = Math.sin(time * 8) > 0;
    ctx.textAlign = 'center';
    ctx.font = `700 26px ${FONT_MONO}`;
    if (plane.speed < 40 && plane.y > ground + 8 && blink) {
      ctx.fillStyle = PALETTE.hudRed;
      ctx.fillText('STALL — THROTTLE UP', W / 2, 110);
    } else if (aheadGround + 25 > plane.y && plane.pitch < -0.02 && !aheadIsRunway && blink) {
      ctx.fillStyle = PALETTE.hudRed;
      ctx.fillText('PULL UP', W / 2, 110);
    } else if (r.fuelPct < 25 && blink) {
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.fillText('LOW FUEL', W / 2, 110);
    }
  }

  function drawCentreMark() {
    ctx.strokeStyle = 'rgba(217,247,232,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 10, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2 - 16, H / 2);
    ctx.lineTo(W / 2 - 6, H / 2);
    ctx.moveTo(W / 2 + 6, H / 2);
    ctx.lineTo(W / 2 + 16, H / 2);
    ctx.moveTo(W / 2, H / 2 - 16);
    ctx.lineTo(W / 2, H / 2 - 6);
    ctx.moveTo(W / 2, H / 2 + 6);
    ctx.lineTo(W / 2, H / 2 + 16);
    ctx.stroke();
  }

  // ---- screens -----------------------------------------------------------------
  function overlayPanel(title, lines, accent) {
    const w = 620;
    const h = 120 + lines.length * 30;
    const x = (W - w) / 2;
    const y = (H - h) / 2 + 10;
    ctx.fillStyle = 'rgba(4, 14, 24, 0.78)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(title, W / 2, y + 62);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `400 17px ${FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, y + 104 + i * 30));
    return { x, y, w, h };
  }

  function draw(state, screen, best) {
    const { plane, course, time } = state;
    updateCamera(plane);
    ctx.clearRect(0, 0, W, H);
    drawSky(plane);
    drawClouds(plane);
    drawTerrain(plane);
    drawRunway();
    drawBuildings();
    drawRings(course, time, screen !== SCREEN_TITLE);
    drawPlaneShadow(plane);
    drawPlane(plane, time);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawCentreMark();
      drawHud(plane, course, time, best);
    }
    if (screen === SCREEN_TITLE) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(4,14,24,0.55)');
      g.addColorStop(0.45, 'rgba(4,14,24,0.05)');
      g.addColorStop(1, 'rgba(4,14,24,0.6)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff6e8';
      ctx.font = `800 64px ${FONT}`;
      ctx.fillText('SKYCOURIER', W / 2, 150);
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = `600 22px ${FONT}`;
      ctx.fillText('Ring Run over Coral Coast', W / 2, 188);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = `400 17px ${FONT}`;
      ctx.fillText('Twelve rings, one island, one tank of fuel. Thread every ring,', W / 2, 226);
      ctx.fillText('then bring SKY-7 home to the runway.', W / 2, 250);
      overlayPanel('READY TO FLY', ['Press ENTER or click to take off'], PALETTE.hudGreen);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = `400 15px ${FONT_MONO}`;
      ctx.fillText('↑ ↓ pitch · ← → bank & turn · SHIFT / CTRL throttle · mouse steers · wheel throttle', W / 2, H - 118);
      ctx.fillText('SPACE brake · P pause · R restart · M mute', W / 2, H - 92);
      if (best > 0) {
        ctx.fillStyle = 'rgba(217,247,232,0.8)';
        ctx.font = `600 15px ${FONT_MONO}`;
        ctx.fillText(`BEST SCORE ${best}`, W / 2, H - 150);
      }
    }
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(4,14,24,0.45)';
      ctx.fillRect(0, 0, W, H);
      overlayPanel('PAUSED', ['P — keep flying', 'R — restart the sortie', 'M — mute'], PALETTE.hudAmber);
    }
    if (screen === SCREEN_OVER) {
      ctx.fillStyle = 'rgba(20,4,4,0.4)';
      ctx.fillRect(0, 0, W, H);
      overlayPanel('CRASHED', [
        plane.crashReason || 'The flight is over.',
        `Score ${plane.score} · rings ${plane.ringsPassed}/${course.rings.length}`,
        'Press R or click to fly again',
      ], PALETTE.hudRed);
    }
    if (screen === SCREEN_WIN) {
      const timeBonus = Math.max(0, Math.round((COURSE.parSeconds - plane.time) * 2));
      overlayPanel('COURSE COMPLETE', [
        `Rings ${plane.ringsPassed}/${course.rings.length} · perfect ${plane.perfects}`,
        `Time ${Math.floor(plane.time / 60)}:${String(Math.floor(plane.time % 60)).padStart(2, '0')} · time bonus +${timeBonus} · landing +${COURSE.landingBonus}`,
        `Final score ${plane.score} · best ${Math.max(best, plane.score)}`,
        'Press R or click to fly it again',
      ], PALETTE.hudGreen);
    }
  }

  return { draw, project };
}
