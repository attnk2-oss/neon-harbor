// Boot, the fixed-step loop and the screens around the game: the title with New Game and
// Continue, the pause menu, and the credits that roll when the fifth job is done. The world and
// renderer do the heavy lifting; this file decides what is on screen and what the keys mean.
import { FONT, MONO, PALETTE, STEP, STORY, VIEW, VEHICLES } from './config.js';
import { createWorld, updateWorld } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { drawHUD, formatMoney, label, panel, spaced } from './hud.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
const ctx = renderer.ctx;

const NEUTRAL = {
  up: false, down: false, left: false, right: false, steer: 0,
  sprint: false, handbrake: false, fire: false, use: false,
  switchWeapon: false, aimX: VIEW.width / 2, aimY: VIEW.height / 2,
};

let screen = 'title';
let menuIndex = 0;
let clickTargets = [];
let playSeconds = 0;
let saveSeconds = 0;
let titleTime = 0;
let creditsTime = 0;
let titleScreen = 'title';

const TITLE_ITEMS = [
  { label: 'NEW GAME', action: 'new' },
  { label: 'CONTINUE', action: 'continue' },
];

// The real input is created when the loop starts; the menu code before that reads this neutral one.
let input = {
  pressed: () => false,
  mouse: { x: 0, y: 0, down: false },
  takeClicks: () => [],
  controls: () => NEUTRAL,
  endFrame: () => {},
  down: () => false,
};

function announce(message) {
  if (status) status.textContent = message;
}

function unlockAudio() {
  audio.init();
  audio.resume();
}

if (shot) {
  stageShot(shot, world);
  screen = 'shot';
  let painted = 0;
  function paintShot() {
    renderer.draw(world, { hud: true });
    painted += 1;
    if (painted >= 2) window.__shotReady = true;
    else requestAnimationFrame(paintShot);
  }
  requestAnimationFrame(paintShot);
} else {
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  startGameLoop();
}

function hasSave() {
  return world.hasSave();
}

function menuRectList() {
  return clickTargets;
}

function activateTitle(index) {
  const item = TITLE_ITEMS[index];
  if (item.action === 'new') {
    world.reset();
    screen = 'play';
    playSeconds = 0;
    saveSeconds = 0;
    announce('New game. Port Kessel.');
  } else if (item.action === 'continue') {
    if (!hasSave()) {
      world.toast = { text: 'NO SAVE FOUND', timer: 2, color: PALETTE.danger };
      return;
    }
    if (world.load()) {
      screen = 'play';
      playSeconds = 0;
      saveSeconds = 0;
      announce('Continued.');
    }
  }
}

function drawTitle() {
  const gradient = ctx.createLinearGradient(0, 0, VIEW.width, 0);
  gradient.addColorStop(0, 'rgba(3,6,11,0.88)');
  gradient.addColorStop(0.62, 'rgba(3,6,11,0.55)');
  gradient.addColorStop(1, 'rgba(3,6,11,0.12)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const bottom = ctx.createLinearGradient(0, VIEW.height - 190, 0, VIEW.height);
  bottom.addColorStop(0, 'rgba(3,6,11,0)');
  bottom.addColorStop(1, 'rgba(3,6,11,0.9)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, VIEW.height - 190, VIEW.width, 190);

  spaced(ctx, 'PORT KESSEL  ·  NIGHT SHIFT', 84, 166, 10, PALETTE.neonAmber, 3);
  ctx.save();
  ctx.shadowColor = PALETTE.neonCyan;
  ctx.shadowBlur = 22;
  spaced(ctx, 'NEON', 84, 262, 78, PALETTE.text, 12);
  ctx.shadowColor = PALETTE.neonPink;
  spaced(ctx, 'HARBOR', 84, 340, 78, PALETTE.neonPink, 12);
  ctx.restore();
  label(ctx, STORY.tagline, 88, 382, 15, PALETTE.muted);

  const menuY = 448;
  clickTargets = [];
  TITLE_ITEMS.forEach((item, index) => {
    const y = menuY + index * 44;
    const enabled = item.action !== 'continue' || hasSave();
    clickTargets.push({ x: 84, y: y - 24, w: 300, h: 36, action: () => activateTitle(index), enabled });
    if (index === menuIndex) {
      ctx.fillStyle = 'rgba(255,209,92,0.12)';
      ctx.fillRect(84, y - 23, 300, 34);
      ctx.fillStyle = PALETTE.marker;
      ctx.fillRect(84, y - 23, 3, 34);
      label(ctx, item.label, 102, y + 1, 19, PALETTE.text);
      label(ctx, '›', 354, y + 1, 19, PALETTE.marker, 'right');
    } else {
      label(ctx, item.label, 102, y + 1, 19, enabled ? PALETTE.muted : 'rgba(120,132,150,0.35)');
    }
  });
  if (!hasSave()) {
    label(ctx, 'NO SAVE ON FILE', 354, menuY + 44 + 1, 8.5, 'rgba(150,165,185,0.55)', 'right');
  }

  // A compact control card, low on the right where the city still shows behind it.
  panel(ctx, 700, 452, 500, 148, 0.6);
  label(ctx, 'ON FOOT', 722, 478, 9, PALETTE.neonAmber);
  label(ctx, 'WASD walk  ·  SHIFT sprint  ·  F take a car', 722, 498, 11, PALETTE.muted);
  label(ctx, 'MOUSE aim  ·  LMB fire  ·  Q fists / pistol', 722, 516, 11, PALETTE.muted);
  label(ctx, 'BEHIND THE WHEEL', 722, 544, 9, PALETTE.neonCyan);
  label(ctx, 'W/S throttle and brake  ·  A/D steer  ·  SPACE handbrake', 722, 564, 11, PALETTE.muted);
  label(ctx, 'F get out  ·  ESC pause  ·  follow the gold marker', 722, 582, 11, PALETTE.muted);
  spaced(ctx, 'ENTER TO BEGIN  ·  UP / DOWN TO CHOOSE', 84, VIEW.height - 34, 9, PALETTE.muted, 2);
  label(ctx, 'PORT KESSEL, SOMEWHERE AFTER MIDNIGHT', VIEW.width - 84, VIEW.height - 34, 10, PALETTE.muted, 'right');
}

function drawPause() {
  ctx.fillStyle = 'rgba(3,6,11,0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const w = 470;
  const h = 330;
  const x = (VIEW.width - w) / 2;
  const y = (VIEW.height - h) / 2;
  panel(ctx, x, y, w, h, 0.93);
  spaced(ctx, 'PAUSED', x + 28, y + 48, 26, PALETTE.text, 5);
  label(ctx, 'PORT KESSEL WAITS', x + 28, y + 70, 9, PALETTE.muted);
  const items = [
    { label: 'RESUME', action: 'resume' },
    { label: `SOUND  ·  ${audio.isEnabled() ? 'ON' : 'OFF'}`, action: 'sound' },
    { label: 'SAVE GAME', action: 'save' },
    { label: 'QUIT TO TITLE', action: 'quit' },
  ];
  clickTargets = [];
  items.forEach((item, index) => {
    const itemY = y + 106 + index * 44;
    clickTargets.push({ x: x + 28, y: itemY - 24, w: w - 56, h: 34, action: () => activatePause(item.action) });
    if (index === menuIndex) {
      ctx.fillStyle = 'rgba(255,209,92,0.12)';
      ctx.fillRect(x + 28, itemY - 23, w - 56, 32);
      ctx.fillStyle = PALETTE.marker;
      ctx.fillRect(x + 28, itemY - 23, 3, 32);
      label(ctx, item.label, x + 44, itemY, 16, PALETTE.text);
    } else {
      label(ctx, item.label, x + 44, itemY, 16, PALETTE.muted);
    }
  });
  label(ctx, 'ESC resumes', x + w - 28, y + h - 22, 10, PALETTE.muted, 'right');
}

function activatePause(action) {
  if (action === 'resume') {
    screen = 'play';
    menuIndex = 0;
    announce('Resumed.');
  } else if (action === 'sound') {
    audio.toggle();
    announce(audio.isEnabled() ? 'Sound on.' : 'Sound off.');
  } else if (action === 'save') {
    world.save();
    world.toast = { text: 'SAVED  ·  the harbour remembers', timer: 2.4, color: PALETTE.money };
  } else if (action === 'quit') {
    world.save();
    screen = 'title';
    menuIndex = 0;
  }
}

function drawCredits() {
  ctx.fillStyle = 'rgba(2,4,8,0.9)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const lines = [
    ['NEON HARBOR', 34, PALETTE.text],
    ['A PORT KESSEL STORY', 12, PALETTE.neonPink],
    ['', 10, PALETTE.muted],
    ['VALE  ·  MARROW  ·  SGT. OKONKWO', 15, PALETTE.text],
    ['', 10, PALETTE.muted],
    ['THE CITY OF PORT KESSEL', 13, PALETTE.neonCyan],
    ['KESTREL COUPE  ·  BREAM VAN  ·  TERN CRUISER', 12, PALETTE.muted],
    ['', 10, PALETTE.muted],
    ['WRITTEN, DRAWN AND SCORED FROM SCRATCH', 12, PALETTE.muted],
    ['FOR MAKEFUN GTA6-01', 12, PALETTE.muted],
    ['', 12, PALETTE.muted],
    ['EVERY LIGHT ON THE WATERFRONT OWES SOMEBODY', 11, PALETTE.marker],
    ['', 16, PALETTE.muted],
    ['THANK YOU FOR PLAYING', 18, PALETTE.text],
  ];
  const scroll = creditsTime * 26 - 220;
  lines.forEach((line, index) => {
    const [text, size, color] = line;
    const y = 620 - scroll + index * 44;
    if (y < 40 || y > VIEW.height + 40) return;
    if (text === 'NEON HARBOR') spaced(ctx, text, VIEW.width / 2, y, 46, color, 8, 'center');
    else label(ctx, text, VIEW.width / 2, y, size, color, 'center');
  });
  if (creditsTime > 6) label(ctx, 'ENTER  ·  BACK TO THE HARBOUR', VIEW.width / 2, VIEW.height - 46, 11, PALETTE.muted, 'center');
}

function updateMenu() {
  if (screen === 'title') {
    if (input.pressed('ArrowUp') || input.pressed('KeyW')) menuIndex = (menuIndex + TITLE_ITEMS.length - 1) % TITLE_ITEMS.length;
    if (input.pressed('ArrowDown') || input.pressed('KeyS')) menuIndex = (menuIndex + 1) % TITLE_ITEMS.length;
    if (input.pressed('Enter') || input.pressed('Space')) activateTitle(menuIndex);
    for (const click of input.takeClicks()) {
      const target = clickTargets.find((entry) => click.x >= entry.x && click.x <= entry.x + entry.w && click.y >= entry.y && click.y <= entry.y + entry.h);
      if (target) {
        target.action();
        input.mouse.down = false;
      }
    }
    for (const target of clickTargets) {
      if (input.mouse.x >= target.x && input.mouse.x <= target.x + target.w && input.mouse.y >= target.y && input.mouse.y <= target.y + target.h) {
        const index = clickTargets.indexOf(target);
        menuIndex = index;
      }
    }
  } else if (screen === 'pause') {
    const count = 4;
    if (input.pressed('ArrowUp') || input.pressed('KeyW')) menuIndex = (menuIndex + count - 1) % count;
    if (input.pressed('ArrowDown') || input.pressed('KeyS')) menuIndex = (menuIndex + 1) % count;
    if (input.pressed('Enter') || input.pressed('Space')) {
      activatePause(['resume', 'sound', 'save', 'quit'][menuIndex]);
    }
    for (const click of input.takeClicks()) {
      const target = clickTargets.find((entry) => click.x >= entry.x && click.x <= entry.x + entry.w && click.y >= entry.y && click.y <= entry.y + entry.h);
      if (target) {
        target.action();
        input.mouse.down = false;
      }
    }
    if (input.pressed('Escape')) {
      screen = 'play';
      menuIndex = 0;
    }
  } else if (screen === 'play') {
    if (input.pressed('Escape')) {
      screen = 'pause';
      menuIndex = 0;
      announce('Paused.');
    }
  } else if (screen === 'credits') {
    if (input.pressed('Enter') || input.pressed('Space') || input.pressed('Escape')) {
      screen = 'title';
      menuIndex = 0;
      titleTime = 0;
      world.reset();
    }
  }
}

function startGameLoop() {
  input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();
  let titleStep = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min(0.12, (now - last) / 1000);
    last = now;
    updateMenu();

    if (screen === 'play') {
      accumulator += delta;
      playSeconds += delta;
      saveSeconds += delta;
      while (accumulator >= STEP) {
        updateWorld(world, STEP, input.controls());
        accumulator -= STEP;
      }
      audio.handle(world.drainEvents());
      audio.update(world);
      if (saveSeconds > 22) {
        saveSeconds = 0;
        world.save();
      }
      if (world.storyDone && world.creditsTimer > 2.4) {
        screen = 'credits';
        creditsTime = 0;
      }
    } else if (screen === 'title') {
      accumulator += delta;
      titleTime += delta;
      while (accumulator >= STEP) {
        updateWorld(world, STEP, NEUTRAL);
        accumulator -= STEP;
      }
      world.camera.x = Math.max(0, Math.min(3124 - VIEW.width, 720 + Math.sin(titleTime * 0.05) * 260));
      world.camera.y = 1270;
      audio.update(world);
      world.drainEvents();
    } else if (screen === 'credits') {
      accumulator += delta;
      creditsTime += delta;
      while (accumulator >= STEP) {
        updateWorld(world, STEP, NEUTRAL);
        accumulator -= STEP;
      }
      const drift = Math.sin(creditsTime * 0.04) * 200;
      world.camera.x = Math.max(0, Math.min(3124 - VIEW.width, 900 + drift));
      world.camera.y = 1300;
      world.drainEvents();
    } else {
      accumulator = 0;
      audio.update(world);
      world.drainEvents();
    }

    renderer.draw(world, { hud: screen === 'play' || screen === 'pause' });
    if (screen === 'title') {
      drawTitle();
    } else if (screen === 'pause') {
      drawPause();
    } else if (screen === 'credits') {
      drawCredits();
    }
    input.endFrame();
    titleStep += 1;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'pause';
      menuIndex = 0;
    }
  });

  announce('NEON HARBOR. Press Enter to start, or choose Continue.');
  requestAnimationFrame(frame);
}
