// Keyboard and pointer input. Held keys steer and drive; one-shot presses (F to get in or out,
// Q to change weapon, Escape for the menu) are recorded until the frame that consumes them, and
// released entirely on blur so a key held when the tab loses focus never stays stuck.
import { VIEW } from './config.js';

const PREVENT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyQ', 'KeyE', 'Escape', 'Enter',
]);

/** Pointer position in the 1280x720 drawing space, undoing the renderer's letterbox fit. */
function toCanvas(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / VIEW.width, rect.height / VIEW.height) || 1;
  const offsetX = (rect.width - VIEW.width * scale) / 2;
  const offsetY = (rect.height - VIEW.height * scale) / 2;
  return {
    x: Math.max(0, Math.min(VIEW.width, (clientX - rect.left - offsetX) / scale)),
    y: Math.max(0, Math.min(VIEW.height, (clientY - rect.top - offsetY) / scale)),
  };
}

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const clicks = [];
  const mouse = { x: VIEW.width * 0.62, y: VIEW.height * 0.5, down: false };
  let focused = true;

  function mark(event, isDown) {
    if (PREVENT.has(event.code)) event.preventDefault();
    if (isDown) {
      if (!event.repeat) pressed.add(event.code);
      down.add(event.code);
    } else {
      down.delete(event.code);
    }
  }

  window.addEventListener('keydown', (event) => mark(event, true));
  window.addEventListener('keyup', (event) => mark(event, false));
  window.addEventListener('blur', () => {
    focused = false;
    down.clear();
    mouse.down = false;
  });
  window.addEventListener('focus', () => {
    focused = true;
  });

  canvas.addEventListener('pointermove', (event) => {
    const point = toCanvas(canvas, event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const point = toCanvas(canvas, event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.down = true;
    pressed.add('Mouse0');
    clicks.push({ x: point.x, y: point.y });
    canvas.focus();
  });

  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.setAttribute('tabindex', '0');

  return {
    mouse,
    focused: () => focused,
    down: (code) => down.has(code),
    pressed: (code) => pressed.has(code),
    /** Clicks since the last call, in drawing coordinates. */
    takeClicks() {
      const taken = clicks.slice();
      clicks.length = 0;
      return taken;
    },
    /** Drop one-shot state once a frame has acted on it. */
    endFrame() {
      pressed.clear();
    },
    /** The controls one simulation step reads. */
    controls() {
      const left = down.has('KeyA') || down.has('ArrowLeft');
      const right = down.has('KeyD') || down.has('ArrowRight');
      return {
        up: down.has('KeyW') || down.has('ArrowUp'),
        down: down.has('KeyS') || down.has('ArrowDown'),
        left,
        right,
        steer: Number(right) - Number(left),
        sprint: down.has('ShiftLeft') || down.has('ShiftRight'),
        handbrake: down.has('Space'),
        fire: down.has('Mouse0'),
        use: pressed.has('KeyF') || pressed.has('KeyE'),
        switchWeapon: pressed.has('KeyQ'),
        horn: down.has('KeyH'),
        aimX: mouse.x,
        aimY: mouse.y,
      };
    },
  };
}
