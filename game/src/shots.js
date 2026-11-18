// The four staged screenshots. Each one resets the real world, sets up a scene out of real
// entities, steps the real simulation forward a fixed number of frames, then freezes it. The
// same query string therefore always yields the same frame, and nothing is drawn that the game
// itself would not draw.
import { CITY_SIZE, PALETTE, STEP, VIEW } from './config.js';
import { makeCar } from './traffic.js';
import { MISSIONS } from './missions.js';
import { updateWorld } from './world.js';

const NEUTRAL = {
  up: false, down: false, left: false, right: false, steer: 0,
  sprint: false, handbrake: false, fire: false, use: false,
  switchWeapon: false, aimX: VIEW.width / 2, aimY: VIEW.height / 2,
};

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function run(world, controls, frames) {
  const merged = { ...NEUTRAL, ...controls };
  for (let frame = 0; frame < frames; frame += 1) updateWorld(world, STEP, merged);
}

function clearTrafficNear(world, x, y, radius) {
  world.cars = world.cars.filter((car) => car.driver !== 'traffic' || Math.hypot(car.x - x, car.y - y) > radius);
}

function aimAtScreen(world, angle) {
  const player = world.player;
  const reach = 240;
  return {
    aimX: player.x + Math.cos(angle) * reach - world.camera.x,
    aimY: player.y + Math.sin(angle) * reach - world.camera.y,
  };
}

function addTraffic(world, i, j, dir, t, kind, fill, cruise = 150) {
  const car = makeCar(world, kind, 0, 0, 0, {
    fromI: i, fromJ: j, dir, t, cruise, fill,
  });
  world.cars.push(car);
  return car;
}

function addWalker(world, x, y, dx, coat, umbrella = false) {
  world.peds.push({
    x, y,
    angle: Math.atan2(0, dx),
    state: 'walk',
    path: [{ x, y }, { x: x + dx, y }],
    target: 1,
    speed: 34,
    block: null,
    fleeX: 0,
    fleeY: 0,
    timer: 0,
    bob: world.rng.range(0, Math.PI * 2),
    umbrella,
    coat,
    skin: '#b98a6c',
  });
}

function smokeAt(world, x, y, count = 8) {
  for (let index = 0; index < count; index += 1) {
    world.particles.push({
      x: x + world.rng.range(-6, 6),
      y: y + world.rng.range(-4, 4),
      vx: world.rng.range(-12, 12),
      vy: world.rng.range(-34, -10),
      life: world.rng.range(0.6, 1.5),
      max: 1,
      size: world.rng.range(5, 11),
      color: '#2b303a',
      kind: 'smoke',
    });
  }
}

function muzzleAt(world, x, y, angle) {
  world.fireBullet(x, y, angle, 930, 20, 'thug');
  world.particles.push({
    x, y, vx: 0, vy: 0, life: 0.3, max: 1, size: 7, color: '#ffe6a1', kind: 'muzzle',
  });
}

function stageStreet(world) {
  world.reset();
  run(world, {}, 90);
  const x = 1668;
  const y = 1614;
  clearTrafficNear(world, x, y, 130);
  world.player.x = x;
  world.player.y = y;
  world.player.money = 1840;
  world.player.health = 100;
  world.player.armour = 70;
  world.player.ammo = 24;
  world.player.weapon = 'pistol';
  world.clock = 23 * 60 + 52;
  world.objective = null;
  world.toast = { text: 'SHOTS FIRED  ·  LANTERN STRIP', timer: 5, color: PALETTE.danger };

  addTraffic(world, 3, 4, 0, 0.83, 'cormorant', '#bcc7d8', 160);
  addTraffic(world, 5, 4, 2, 0.34, 'pike', '#7d8fa8', 145);
  addTraffic(world, 5, 4, 0, 0.63, 'bream', '#d8cdb8', 130);
  addTraffic(world, 4, 4, 3, 0.31, 'kestrel', '#8f4f57', 175);
  addTraffic(world, 4, 4, 1, 0.44, 'cormorant', '#5a6f5e', 150);
  addTraffic(world, 6, 4, 2, 0.58, 'cormorant', '#c28b55', 150);

  addWalker(world, 1530, 1528, 80, '#4d3a46', true);
  addWalker(world, 1730, 1528, -62, '#39465c', false);
  addWalker(world, 1810, 1534, -84, '#5a4b38', true);
  addWalker(world, 1940, 1528, -44, '#6b5a47', false);
  addWalker(world, 1420, 1532, 66, '#4b5a50', true);
  addWalker(world, 1592, 1618, 44, '#3d4d44', false);
  addWalker(world, 1700, 1608, -54, '#584a5c', true);
  addWalker(world, 1885, 1612, -48, '#2f3a4a', false);
  addWalker(world, 1470, 1616, 62, '#5a4b38', false);
  addWalker(world, 1760, 1622, -40, '#49606b', true);

  run(world, { aimX: VIEW.width / 2 + 40, aimY: 150 }, 30);
  clearTrafficNear(world, x, y, 100);
  world.player.x = x;
  world.player.y = y;
  const aim = Math.atan2(1598 - y, 1516 - x);
  world.player.angle = aim;
  world.player.hurt = 0;
  world.player.fireCooldown = 0.14;
  world.setWanted(1);
  world.hudPulse = 0.35;

  world.thugs = [
    { x: 1516, y: 1598, angle: Math.atan2(y - 1598, x - 1516), health: 16, cooldown: 2.4, hit: 0.2, weapon: 'pistol' },
    { x: 1552, y: 1652, angle: Math.atan2(y - 1652, x - 1552), health: 44, cooldown: 2.1, hit: 0, weapon: 'pistol' },
    { x: 1458, y: 1608, angle: Math.atan2(y - 1608, x - 1458), health: 48, cooldown: 2.6, hit: 0, weapon: 'pistol' },
  ];

  world.cops.push(
    { x: 1900, y: 1528, angle: Math.PI, health: 60, state: 'chase', cooldown: 1.1, melee: 0, downTimer: 0 },
    { x: 2040, y: 1614, angle: Math.PI, health: 60, state: 'chase', cooldown: 1.4, melee: 0, downTimer: 0 },
  );
  const cruiser = world.spawnCar('tern', 1990, 1583, Math.PI, { driver: null });
  cruiser.lightsOn = true;

  const copAim = Math.atan2(y - 1528, x - 1900);
  for (const reach of [16, 78, 140]) {
    world.fireBullet(1900 + Math.cos(copAim) * reach, 1528 + Math.sin(copAim) * reach, copAim, 900, 8, 'cop');
  }
  world.particles.push({ x: 1900 + Math.cos(copAim) * 15, y: 1528 + Math.sin(copAim) * 15, vx: 0, vy: 0, life: 0.3, max: 1, size: 6, color: '#ffe6a1', kind: 'muzzle' });

  for (const ped of world.peds) {
    const distance = Math.hypot(ped.x - x, ped.y - y);
    if (distance > 300 || ped.state === 'down') continue;
    const away = Math.atan2(ped.y - y, ped.x - x);
    ped.state = 'flee';
    ped.fleeX = Math.cos(away);
    ped.fleeY = Math.sin(away);
    ped.timer = 4;
  }

  world.particles.push({ x: x + Math.cos(aim) * 18, y: y + Math.sin(aim) * 18, vx: 0, vy: 0, life: 0.3, max: 1, size: 6, color: '#ffe6a1', kind: 'muzzle' });
  world.fireBullet(x + Math.cos(aim) * 26, y + Math.sin(aim) * 26, aim, 940, 27, 'player');
  world.fireBullet(x + Math.cos(aim) * 86, y + Math.sin(aim) * 86, aim, 940, 27, 'player');
  const reply = Math.atan2(y - 1598, x - 1516);
  world.fireBullet(1516 + Math.cos(reply) * 12, 1598 + Math.sin(reply) * 12, reply, 860, 7, 'thug');
  world.fireBullet(1516 + Math.cos(reply) * 58, 1598 + Math.sin(reply) * 58, reply, 860, 7, 'thug');
  world.fireBullet(1516 + Math.cos(reply) * 102, 1598 + Math.sin(reply) * 102, reply, 860, 7, 'thug');
  world.particles.push({ x: 1516 + Math.cos(reply) * 14, y: 1598 + Math.sin(reply) * 14, vx: 0, vy: 0, life: 0.3, max: 1, size: 6, color: '#ffe6a1', kind: 'muzzle' });

  world.camera.x = clamp(x - VIEW.width / 2 + 30, 0, CITY_SIZE.width - VIEW.width);
  world.camera.y = clamp(y - VIEW.height / 2 + 34, 0, CITY_SIZE.height - VIEW.height);
}

function stageDrive(world) {
  world.reset();
  run(world, {}, 60);
  const startX = 930;
  clearTrafficNear(world, startX, 2879, 110);
  world.player.money = 2260;
  world.player.health = 100;
  world.player.armour = 62;
  world.clock = 23 * 60 + 41;
  world.objective = null;
  world.toast = { text: 'KESSEL RING  ·  EASTBOUND', timer: 6, color: PALETTE.neonAmber };

  const car = world.spawnCar('kestrel', startX, 2879, 0, { driver: null, fill: '#38e0cf' });
  world.putPlayerInCar(car);
  car.roof = '#0e4f55';
  car.vx = 380;
  car.vy = 0;
  car.health = 96;

  addTraffic(world, 3, 8, 0, 0.95, 'cormorant', '#c9d3e2', 165);
  addTraffic(world, 4, 8, 0, 0.55, 'kestrel', '#8f4f57', 170);
  addTraffic(world, 5, 8, 0, 0.35, 'bream', '#d8cdb8', 145);
  addTraffic(world, 6, 8, 0, 0.3, 'pike', '#7d8fa8', 150);
  addTraffic(world, 5, 8, 2, 0.55, 'cormorant', '#c28b55', 155);
  addTraffic(world, 6, 8, 2, 0.42, 'cormorant', '#47607a', 160);
  addTraffic(world, 3, 8, 0, 0.22, 'pike', '#b06a45', 150);
  addTraffic(world, 4, 8, 0, 0.8, 'cormorant', '#c9d3e2', 160);
  addTraffic(world, 6, 8, 2, 0.8, 'bream', '#6d8fa0', 150);

  run(world, { up: true }, 46);
  for (let index = 0; index < 8; index += 1) {
    const back = 16 + index * 9;
    world.skids.push({
      x: car.x - Math.cos(car.angle) * back + world.rng.range(-3, 3),
      y: car.y - Math.sin(car.angle) * back + world.rng.range(-3, 3),
      angle: car.angle,
      width: 10 + world.rng.range(-2, 2),
      life: 9,
    });
  }
  const spray = Math.cos(car.angle);
  const sprayY = Math.sin(car.angle);
  for (let index = 0; index < 30; index += 1) {
    const back = 22 + world.rng.range(0, 96);
    world.particles.push({
      x: car.x - spray * back + world.rng.range(-9, 9),
      y: car.y - sprayY * back + world.rng.range(-9, 9),
      vx: -spray * world.rng.range(30, 90),
      vy: -sprayY * world.rng.range(30, 90) + world.rng.range(-14, 14),
      life: world.rng.range(0.3, 0.8),
      max: 1,
      size: world.rng.range(1.1, 2.6),
      color: '#c6e9f4',
      kind: 'spray',
    });
  }
  world.camera.x = clamp(car.x - 500, 0, CITY_SIZE.width - VIEW.width);
  world.camera.y = CITY_SIZE.height - VIEW.height;
  world.player.hurt = 0;
}

function stageChase(world) {
  world.reset();
  run(world, {}, 55);
  world.player.money = 1280;
  world.player.health = 88;
  world.player.armour = 24;
  world.ammo = 17;
  world.clock = 0 * 60 + 12;
  world.objective = null;
  world.toast = null;

  const car = world.spawnCar('kestrel', 1380, 1907, 0, { driver: null, fill: '#38e0cf' });
  world.putPlayerInCar(car);
  car.roof = '#0e4f55';
  car.vx = 310;
  car.health = 58;
  car.maxHealth = 120;
  world.setWanted(3);
  world.hudPulse = 0.8;
  world.policeSpawnTimer = 40;

  const front = world.spawnCar('tern', 2120, 1886, Math.PI, { driver: 'police' });
  front.vx = -260;
  front.copCooldown = 0.1;
  front.lightsOn = true;
  const second = world.spawnCar('tern', 2350, 1907, Math.PI, { driver: 'police' });
  second.vx = -300;
  second.copCooldown = 0.35;
  second.lightsOn = true;
  const behind = world.spawnCar('tern', 1010, 1907, 0, { driver: 'police' });
  behind.vx = 330;
  behind.copCooldown = 0.6;
  behind.lightsOn = true;

  world.cops.push(
    { x: 1710, y: 1830, angle: 0, health: 60, state: 'chase', cooldown: 0.2, melee: 0, downTimer: 0 },
    { x: 1980, y: 1830, angle: 0, health: 60, state: 'chase', cooldown: 0.5, melee: 0, downTimer: 0 },
  );

  run(world, { up: true, aimX: 900, aimY: 300 }, 42);
  const ram = world.spawnCar('tern', car.x + 92, car.y + 32, car.angle + 0.32, { driver: 'police' });
  ram.lightsOn = true;
  ram.vx = 0;
  ram.vy = 0;
  const playerAim = car.angle - 0.12;
  world.fireBullet(car.x + Math.cos(playerAim) * 30, car.y + Math.sin(playerAim) * 30, playerAim, 980, 27, 'player');
  world.fireBullet(car.x + Math.cos(playerAim) * 92, car.y + Math.sin(playerAim) * 92, playerAim, 980, 27, 'player');
  world.particles.push({ x: car.x + Math.cos(playerAim) * 24, y: car.y + Math.sin(playerAim) * 24, vx: 0, vy: 0, life: 0.3, max: 1, size: 7, color: '#ffe6a1', kind: 'muzzle' });
  for (let index = 0; index < 14; index += 1) {
    world.particles.push({
      x: car.x - Math.cos(car.angle) * world.rng.range(16, 56) + world.rng.range(-10, 10),
      y: car.y - Math.sin(car.angle) * world.rng.range(16, 56) + world.rng.range(-10, 10),
      vx: -Math.cos(car.angle) * world.rng.range(30, 90),
      vy: -Math.sin(car.angle) * world.rng.range(30, 90),
      life: world.rng.range(0.2, 0.5),
      max: 1,
      size: world.rng.range(1.2, 2.4),
      color: '#ffb066',
      kind: 'spark',
    });
  }
  world.camera.x = clamp(car.x - 545, 0, CITY_SIZE.width - VIEW.width);
  world.camera.y = clamp(car.y - 380, 0, CITY_SIZE.height - VIEW.height);
  world.player.hurt = 0;
  world.player.invuln = 1;
  smokeAt(world, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 12);
  muzzleAt(world, front.x + Math.cos(front.angle) * 24, front.y + Math.sin(front.angle) * 24, Math.atan2(car.y - front.y, car.x - front.x));
  muzzleAt(world, second.x + Math.cos(second.angle) * 24, second.y + Math.sin(second.angle) * 24, Math.atan2(car.y - second.y, car.x - second.x));
}

function stageMission(world) {
  world.reset();
  run(world, {}, 55);
  world.player.money = 1840;
  world.player.health = 84;
  world.player.armour = 42;
  world.player.ammo = 11;
  world.player.weapon = 'pistol';
  world.clock = 1 * 60 + 8;

  world.mission.completed = 4;
  world.mission.active = { def: MISSIONS[4], stage: 1, spawned: false };
  world.mission.enterStage(world, 1);
  world.setWanted(3);
  world.hudPulse = 0.5;

  const terminal = world.city.spots.terminal;
  world.player.x = terminal.x + 190;
  world.player.y = terminal.y - 130;
  world.player.vx = 0;
  world.player.vy = 0;
  world.player.angle = Math.atan2(terminal.y - 120 - world.player.y, terminal.x - 40 - world.player.x);
  clearTrafficNear(world, world.player.x, world.player.y, 190);
  world.toast = null;

  world.thugs = [];
  const spots = [
    [terminal.x - 120, terminal.y - 56],
    [terminal.x - 40, terminal.y - 110],
    [terminal.x + 50, terminal.y - 130],
    [terminal.x + 200, terminal.y - 80],
    [terminal.x - 80, terminal.y + 2],
    [terminal.x + 12, terminal.y + 16],
  ];
  spots.forEach(([x, y], index) => {
    world.thugs.push({
      x, y,
      angle: Math.atan2(world.player.y - y, world.player.x - x),
      health: 48,
      cooldown: 0.16 + index * 0.13,
      hit: 0,
      weapon: 'pistol',
    });
  });

  const cruiser = world.spawnCar('tern', terminal.x - 340, terminal.y - 30, 0, { driver: null });
  cruiser.lightsOn = true;
  const cruiser2 = world.spawnCar('tern', terminal.x + 430, terminal.y - 50, Math.PI, { driver: null });
  cruiser2.lightsOn = true;

  run(world, { fire: true }, 16);
  world.player.hurt = 0;
  world.player.invuln = 1;
  world.player.health = 78;
  world.player.x = terminal.x + 190;
  world.player.y = terminal.y - 130;
  world.player.angle = Math.atan2(terminal.y - 130 - world.player.y, terminal.x - 40 - world.player.x);
  world.player.fireCooldown = 0.14;
  world.camera.x = clamp(terminal.x - 560, 0, CITY_SIZE.width - VIEW.width);
  world.camera.y = CITY_SIZE.height - VIEW.height;

  muzzleAt(world, terminal.x - 100, terminal.y - 80, Math.atan2(world.player.y - (terminal.y - 80), world.player.x - (terminal.x - 100)));
  muzzleAt(world, terminal.x + 30, terminal.y - 100, Math.atan2(world.player.y - (terminal.y - 100), world.player.x - (terminal.x + 30)));
  world.say('SGT. OKONKWO', 'Terminal is closed, Vale. For good.', 9);
}

/**
 * Stage one of the four screenshots by name (street, drive, chase, mission) and leave the world
 * frozen on the last frame, with the camera where the scene wants it.
 */
export function stageShot(name, world) {
  if (name === 'drive') stageDrive(world);
  else if (name === 'chase') stageChase(world);
  else if (name === 'mission') stageMission(world);
  else stageStreet(world);
  world.paused = true;
  return { name };
}
