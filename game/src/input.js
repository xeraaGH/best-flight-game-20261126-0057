// Keyboard and mouse: arrows (or WASD) fly the plane, the mouse steers by position,
// the wheel works the throttle, and P / R / M / Enter run the game around it.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  /** Mouse steering: -1..1 offsets from the screen centre, 0 when the mouse is idle. */
  let mouseX = 0;
  let mouseY = 0;
  let mouseActive = false;
  let wheelDelta = 0;

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(event.key.toLowerCase());
    if (event.key === 'Enter' || event.key === ' ') actions |= ACTION_CONFIRM;
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') actions |= ACTION_PAUSE;
    if (event.key === 'r' || event.key === 'R') actions |= ACTION_RESTART;
    if (event.key === 'm' || event.key === 'M') actions |= ACTION_MUTE;
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    mouseY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    mouseActive = true;
  }

  function onWheel(event) {
    event.preventDefault();
    wheelDelta -= Math.sign(event.deltaY);
  }

  function onMouseDown() {
    actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    /** Pitch/roll in -1..1 plus a throttle delta for this frame; keys win over the mouse. */
    control() {
      const keyPitch =
        (keys.has('arrowdown') || keys.has('s') ? -1 : 0) +
        (keys.has('arrowup') || keys.has('w') ? 1 : 0);
      const keyRoll =
        (keys.has('arrowright') || keys.has('d') ? 1 : 0) +
        (keys.has('arrowleft') || keys.has('a') ? -1 : 0);
      let pitch = keyPitch;
      let roll = keyRoll;
      if (keyPitch === 0 && keyRoll === 0 && mouseActive) {
        pitch = Math.max(-1, Math.min(1, -mouseY * 1.4));
        roll = Math.max(-1, Math.min(1, mouseX * 1.4));
      }
      let throttleDelta = 0;
      if (keys.has('shift')) throttleDelta += 1;
      if (keys.has('control')) throttleDelta -= 1;
      if (wheelDelta !== 0) {
        throttleDelta += wheelDelta * 0.35;
        wheelDelta = 0;
      }
      return { pitch, roll, throttleDelta, brake: keys.has(' ') };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
