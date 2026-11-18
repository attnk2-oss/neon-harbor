// The simulation: the player on foot and behind the wheel, the wanted level and everything it
// drags in, gunplay, pedestrians, cars, thugs, particles, the camera, the clock and the save
// slot. Drawing lives in render.js and hud.js; nothing here touches the canvas.
import { CITY_SIZE, CLOCK, DISTRICTS, PALETTE, PLAYER, POLICE, SHAKE, STEP, VEHICLES } from './config.js';
import { createRandom } from './random.js';
import { generateCity } from './city.js';
import { spawnPeds, spawnTraffic, updatePeds, updateTraffic, startlePeds, makeCar } from './traffic.js';
import { updatePolice } from './police.js';
import { stepCar, findFreeCarSpot, carCorners } from './physics.js';
import { MissionController } from './missions.js';
import { SAVE_KEY } from './config.js';

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

function createPlayer(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    onFoot: true,
    car: null,
    health: PLAYER.maxHealth,
    armour: 0,
    money: PLAYER.startMoney,
    ammo: PLAYER.ammoStart,
    weapon: 'pistol',
    fireCooldown: 0,
    hurt: 0,
    invuln: 0,
    dead: false,
    deadTimer: 0,
    footstep: 0,
    moving: false,
    sprinting: false,
    wade: 0,
  };
}

export function createWorld(seed) {
  const world = {
    seed,
    city: generateCity(seed ^ 0x51ed270b),
    player: createPlayer(0, 0),
    cars: [],
    peds: [],
    cops: [],
    thugs: [],
    bullets: [],
    particles: [],
    skids: [],
    events: [],
    camera: { x: 0, y: 0, shake: 0 },
    wanted: 0,
    wantedSeen: 0,
    wantedDecay: 0,
    clearTimer: 0,
    policeSpawnTimer: 0,
    time: 0,
    clock: CLOCK.start,
    district: 4,
    dialogue: null,
    toast: null,
    objective: null,
    storyDone: false,
    creditsTimer: 0,
    hudPulse: 0,
    nextCarId: 1,
    mission: new MissionController(),
    rng: createRandom(seed >>> 0),
    paused: false,
  };

  world.spot = (name) => world.city.spots[name];
  world.say = (speaker, text, seconds = 5) => {
    world.dialogue = { speaker, text, timer: seconds, max: seconds };
  };
  world.setWanted = (stars) => {
    const next = clamp(Math.round(stars), 0, 5);
    if (next > world.wanted) {
      world.wantedSeen = 0;
      world.wantedDecay = 0;
      world.clearTimer = 0;
      world.policeSpawnTimer = 0;
      world.hudPulse = 1;
    }
    world.wanted = next;
    if (next === 0) {
      world.wantedSeen = 0;
      world.wantedDecay = 0;
    }
  };
  world.addWanted = (stars) => {
    if (world.wanted >= 5) return;
    world.setWanted(Math.min(5, world.wanted + stars));
  };
  world.fireBullet = (x, y, angle, speed, damage, owner) => {
    world.bullets.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.95,
      damage,
      owner,
      trail: [],
    });
  };
  world.damagePlayer = (amount, source) => {
    const player = world.player;
    if (player.dead || player.invuln > 0) return;
    let damage = amount;
    if (player.armour > 0) {
      const absorbed = Math.min(player.armour, damage * 0.62);
      player.armour -= absorbed;
      damage -= absorbed;
    }
    player.health -= damage;
    player.hurt = 0.42;
    player.invuln = 0.22;
    world.camera.shake = Math.max(world.camera.shake, SHAKE.shot + 2);
    world.events.push({ type: 'hurt', at: { x: player.x, y: player.y } });
    if (player.health <= 0 && !player.dead) {
      player.dead = true;
      player.deadTimer = PLAYER.respawn;
      world.camera.shake = Math.max(world.camera.shake, SHAKE.explosion);
      world.events.push({ type: 'death' });
      if (player.car) exitCar(world, true);
    }
  };
  world.hitPed = (ped, car, speed) => {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.timer = 2.2;
    ped.angle = car ? Math.atan2(ped.y - car.y, ped.x - car.x) : ped.angle;
    if (car && car.driver === 'player') world.addWanted(1);
    world.camera.shake = Math.max(world.camera.shake, 4 + Math.min(6, speed * 0.02));
    burst(world, ped.x, ped.y, '#c9d2e0', 7, 90, 'dust');
    world.events.push({ type: 'thud', at: { x: ped.x, y: ped.y } });
  };
  world.carImpact = (car, speed, x, y) => {
    const damage = Math.max(2.5, speed * 0.055);
    car.health -= damage;
    burst(world, x, y, '#ffd479', 6, 130, 'spark');
    world.camera.shake = Math.max(world.camera.shake, Math.min(SHAKE.crash, speed * 0.03));
    world.events.push({ type: 'crash', at: { x, y } });
    if (car.health <= 0) wreckCar(world, car);
  };
  world.addSkid = (x, y, angle, speed) => {
    if (world.skids.length > 520) world.skids.shift();
    world.skids.push({ x, y, angle, life: 13, width: 3 + Math.min(5, speed * 0.012) });
  };
  world.spawnThugs = (count, x, y, radius) => {
    world.thugs = [];
    for (let index = 0; index < count; index += 1) {
      const angle = world.rng() * Math.PI * 2;
      const distance = 50 + world.rng() * (radius - 50);
      let px = x + Math.cos(angle) * distance;
      let py = y + Math.sin(angle) * distance;
      if (world.city.circleSolid(px, py, 9)) {
        px = x + world.rng.range(-40, 40);
        py = y + world.rng.range(-40, 40);
      }
      px = clamp(px, world.city.bounds.minX, world.city.bounds.maxX);
      py = clamp(py, world.city.bounds.minY, world.city.waterTop - 26);
      world.thugs.push({
        x: px,
        y: py,
        angle: angle + Math.PI,
        health: 48,
        cooldown: world.rng.range(0.4, 1.4),
        hit: 0,
        weapon: world.rng() < 0.65 ? 'pistol' : 'fists',
      });
    }
  };
  world.spawnCar = (kind, x, y, angle, options = {}) => {
    const spot = findFreeCarSpot(world.city, x, y, kind);
    const car = makeCar(world, kind, spot.x, spot.y, angle, options);
    world.cars.push(car);
    return car;
  };
  world.putPlayerInCar = (car) => {
    const player = world.player;
    player.onFoot = false;
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    car.driver = 'player';
    car.vx = 0;
    car.vy = 0;
  };
  world.nearbyCar = () => {
    const player = world.player;
    let best = null;
    let bestDistance = 62;
    for (const car of world.cars) {
      if (car.driver === 'player') continue;
      const distance = Math.hypot(car.x - player.x, car.y - player.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = car;
      }
    }
    return best;
  };
  world.drainEvents = () => {
    const events = world.events;
    world.events = [];
    return events;
  };
  world.reset = (fresh = true) => {
    world.rng = createRandom((world.seed + 0x9e37) >>> 0);
    const start = world.city.spots.start;
    world.player = createPlayer(start.x, start.y);
    world.cars = [];
    world.peds = [];
    world.cops = [];
    world.thugs = [];
    world.bullets = [];
    world.particles = [];
    world.skids = [];
    world.events = [];
    world.wanted = 0;
    world.wantedSeen = 0;
    world.wantedDecay = 0;
    world.clearTimer = 0;
    world.policeSpawnTimer = 0;
    world.time = 0;
    world.clock = CLOCK.start;
    world.camera.x = clamp(start.x - 640, 0, CITY_SIZE.width - 1280);
    world.camera.y = clamp(start.y - 360, 0, CITY_SIZE.height - 720);
    world.camera.shake = 0;
    world.dialogue = null;
    world.toast = { text: 'THE ANCHOR  ·  find Marrow at the bar', timer: 6, color: PALETTE.marker };
    world.storyDone = false;
    world.creditsTimer = 0;
    world.mission = new MissionController();
    world.mission.setObjectiveToAnchor(world);
    world.district = world.city.districtAt(start.x, start.y);
    world.nextCarId = 1;
    spawnTraffic(world);
    spawnPeds(world);
    // A Kestrel waits by the Anchor so the first job starts with a car, not a walk.
    world.spawnCar('kestrel', start.x + 26, start.y + 70, 0.2, { driver: null, fill: '#dfe7f2' });
    if (!fresh) world.mission.setCompleted(0);
  };
  world.save = () => {
    try {
      const player = world.player;
      const payload = {
        v: 1,
        seed: world.seed,
        x: Math.round(player.onFoot ? player.x : player.car.x),
        y: Math.round(player.onFoot ? player.y : player.car.y),
        car: player.onFoot ? null : player.car.kind,
        money: player.money,
        health: Math.max(1, Math.round(player.health)),
        armour: Math.round(player.armour),
        ammo: player.ammo,
        wanted: world.wanted,
        mission: world.mission.completed,
        clock: world.clock,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };
  world.hasSave = () => {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data && data.v === 1 && Number.isFinite(data.x) && Number.isFinite(data.y);
    } catch {
      return false;
    }
  };
  world.load = () => {
    let data;
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!data || data.v !== 1) return false;
    world.reset();
    const player = world.player;
    player.money = Number(data.money) || PLAYER.startMoney;
    player.health = clamp(Number(data.health) || PLAYER.maxHealth, 1, PLAYER.maxHealth);
    player.armour = clamp(Number(data.armour) || 0, 0, PLAYER.maxArmour);
    player.ammo = clamp(Number(data.ammo) || 0, 0, 999);
    world.wanted = clamp(Number(data.wanted) || 0, 0, 5);
    world.mission.setCompleted(Number(data.mission) || 0);
    if (world.mission.storyDone) {
      world.storyDone = true;
      world.objective = null;
    }
    let px = clamp(Number(data.x) || world.city.spots.start.x, 40, CITY_SIZE.width - 40);
    let py = clamp(Number(data.y) || world.city.spots.start.y, 40, world.city.bounds.maxY - 10);
    if (world.city.circleSolid(px, py, 9)) {
      const free = findFreeCarSpot(world.city, px, py, 'kestrel');
      px = free.x;
      py = free.y;
    }
    player.x = px;
    player.y = py;
    if (data.car) {
      const car = world.spawnCar(data.car, px, py, 0, { driver: null });
      world.putPlayerInCar(car);
    }
    world.camera.x = clamp(px - 640, 0, CITY_SIZE.width - 1280);
    world.camera.y = clamp(py - 360, 0, CITY_SIZE.height - 720);
    world.toast = { text: 'CONTINUED  ·  Port Kessel remembers', timer: 4, color: PALETTE.money };
    return true;
  };

  world.reset();
  return world;
}

function exitCar(world, forced) {
  const player = world.player;
  const car = player.car;
  if (!car) {
    player.onFoot = true;
    return;
  }
  const spec = VEHICLES[car.kind];
  player.onFoot = true;
  player.car = null;
  car.driver = null;
  const side = car.angle + Math.PI / 2;
  let px = car.x + Math.cos(side) * (spec.wid / 2 + 18);
  let py = car.y + Math.sin(side) * (spec.wid / 2 + 18);
  if (world.city.circleSolid(px, py, PLAYER.radius)) {
    px = car.x - Math.cos(side) * (spec.wid / 2 + 18);
    py = car.y - Math.sin(side) * (spec.wid / 2 + 18);
  }
  if (world.city.circleSolid(px, py, PLAYER.radius)) {
    px = car.x;
    py = car.y;
  }
  player.x = px;
  player.y = py;
  player.vx = 0;
  player.vy = 0;
  if (!forced) world.events.push({ type: 'exit' });
}

function ejectDriver(world, car) {
  const angle = car.angle;
  for (const dir of [1, -1]) {
    const x = car.x + Math.cos(angle + Math.PI / 2) * dir * 30;
    const y = car.y + Math.sin(angle + Math.PI / 2) * dir * 30;
    if (!world.city.circleSolid(x, y, 7)) {
      world.peds.push({
        x, y, angle: angle + Math.PI, state: 'flee',
        path: [{ x, y }], target: 0, speed: 120, block: null,
        fleeX: Math.cos(angle + Math.PI / 2) * dir,
        fleeY: Math.sin(angle + Math.PI / 2) * dir,
        timer: 4, bob: 0, umbrella: false,
        coat: '#39465c', skin: '#b98a6c',
      });
      startlePeds(world, x, y, 90);
      return;
    }
  }
}

function wreckCar(world, car) {
  if (car.wrecked) return;
  car.wrecked = true;
  car.health = 0;
  car.burning = 4.2;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  burst(world, car.x, car.y, '#ffb347', 22, 220, 'spark');
  burst(world, car.x, car.y, '#2b303a', 12, 70, 'smoke');
  world.camera.shake = Math.max(world.camera.shake, SHAKE.explosion);
  world.events.push({ type: 'explosion', at: { x: car.x, y: car.y } });
  if (world.player.car === car) {
    world.damagePlayer(34, 'explosion');
    exitCar(world, true);
  }
}

function burst(world, x, y, color, count, speed, kind) {
  for (let index = 0; index < count; index += 1) {
    const angle = world.rng() * Math.PI * 2;
    const velocity = speed * world.rng.range(0.35, 1.2);
    world.particles.push({
      x, y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: kind === 'smoke' ? world.rng.range(0.8, 1.8) : world.rng.range(0.22, 0.62),
      max: 1,
      size: kind === 'smoke' ? world.rng.range(5, 13) : world.rng.range(1.4, 3.4),
      color,
      kind,
    });
  }
}

function firePlayerWeapon(world) {
  const player = world.player;
  if (player.fireCooldown > 0 || player.dead) return;
  if (player.weapon === 'pistol') {
    if (player.ammo <= 0) {
      player.fireCooldown = 0.4;
      world.events.push({ type: 'dry' });
      return;
    }
    player.ammo -= 1;
    player.fireCooldown = PLAYER.pistol.cooldown;
    const spread = (world.rng() - 0.5) * PLAYER.pistol.spread * 2;
    const angle = player.angle + spread;
    const muzzleX = player.x + Math.cos(angle) * 18;
    const muzzleY = player.y + Math.sin(angle) * 18;
    world.fireBullet(muzzleX, muzzleY, angle, PLAYER.pistol.speed, PLAYER.pistol.damage, 'player');
    burst(world, muzzleX, muzzleY, '#ffe6a1', 4, 80, 'muzzle');
    world.camera.shake = Math.max(world.camera.shake, SHAKE.shot);
    world.events.push({ type: 'shot', at: { x: muzzleX, y: muzzleY } });
    startlePeds(world, player.x, player.y, 430);
    if (world.wanted === 0) world.setWanted(1);
  } else {
    player.fireCooldown = PLAYER.fists.cooldown;
    let target = null;
    let best = PLAYER.fists.range;
    const candidates = [...world.peds, ...world.cops, ...world.thugs];
    for (const other of candidates) {
      if (other.state === 'down') continue;
      const dx = other.x - player.x;
      const dy = other.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > best) continue;
      let delta = Math.atan2(dy, dx) - player.angle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) < 1.1) {
        best = distance;
        target = other;
      }
    }
    world.events.push({ type: 'punch' });
    world.camera.shake = Math.max(world.camera.shake, 2);
    if (target) {
      target.health = (target.health || 20) - PLAYER.fists.damage;
      if (target.health <= 0) {
        if (world.peds.includes(target)) {
          target.state = 'down';
          target.timer = 3;
          world.addWanted(1);
        } else if (world.cops.includes(target)) {
          target.state = 'down';
          target.downTimer = 9;
          world.addWanted(2);
        } else {
          world.thugs = world.thugs.filter((thug) => thug !== target);
        }
        burst(world, target.x, target.y, '#ffd0a0', 5, 90, 'dust');
      }
    }
  }
}

function updateBullets(world, dt) {
  const player = world.player;
  const survivors = [];
  for (const bullet of world.bullets) {
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.trail.push({ x: bullet.x, y: bullet.y });
    if (bullet.trail.length > 3) bullet.trail.shift();
    let dead = bullet.life <= 0;
    if (!dead && world.city.solidAt(bullet.x, bullet.y)) {
      burst(world, bullet.x, bullet.y, '#c8d3e6', 3, 70, 'spark');
      world.events.push({ type: 'impact', at: { x: bullet.x, y: bullet.y } });
      dead = true;
    }
    if (!dead) {
      // Cars soak bullets and break down.
      for (const car of world.cars) {
        if (car.wrecked) continue;
        const spec = VEHICLES[car.kind];
        if (Math.abs(bullet.x - car.x) < spec.len * 0.42 && Math.abs(bullet.y - car.y) < spec.wid * 0.62) {
          car.health -= bullet.damage;
          burst(world, bullet.x, bullet.y, '#ffcf7a', 4, 90, 'spark');
          if (car.health <= 0) wreckCar(world, car);
          dead = true;
          break;
        }
      }
    }
    if (!dead && bullet.owner !== 'player' && !player.dead) {
      if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < PLAYER.radius + 3) {
        world.damagePlayer(bullet.damage, bullet.owner);
        dead = true;
      }
    }
    if (!dead && bullet.owner === 'player') {
      for (const cop of world.cops) {
        if (cop.state === 'down') continue;
        if (Math.hypot(bullet.x - cop.x, bullet.y - cop.y) < 12) {
          cop.health -= bullet.damage;
          burst(world, bullet.x, bullet.y, '#ff9a8a', 3, 70, 'spark');
          if (cop.health <= 0) {
            cop.state = 'down';
            cop.downTimer = 9;
            world.addWanted(2);
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead && bullet.owner !== 'thug') {
      for (const thug of world.thugs) {
        if (Math.hypot(bullet.x - thug.x, bullet.y - thug.y) < 12) {
          thug.health -= bullet.damage;
          thug.hit = 0.25;
          burst(world, bullet.x, bullet.y, '#ff9a8a', 3, 70, 'spark');
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const ped of world.peds) {
          if (ped.state === 'down') continue;
          if (Math.hypot(bullet.x - ped.x, bullet.y - ped.y) < 9) {
            ped.state = 'down';
            ped.timer = 2.6;
            burst(world, bullet.x, bullet.y, '#ffb0a0', 4, 60, 'dust');
            if (bullet.owner === 'player') world.addWanted(1);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead) survivors.push(bullet);
  }
  world.bullets = survivors;
  world.thugs = world.thugs.filter((thug) => thug.health > 0);
}

function updateThugs(world, dt) {
  const player = world.player;
  for (const thug of world.thugs) {
    thug.cooldown -= dt;
    thug.hit = Math.max(0, thug.hit - dt);
    const dx = player.x - thug.x;
    const dy = player.y - thug.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 120) {
      const angle = Math.atan2(dy, dx);
      const speed = 118;
      const nextX = thug.x + Math.cos(angle) * speed * dt;
      const nextY = thug.y + Math.sin(angle) * speed * dt;
      if (!world.city.circleSolid(nextX, nextY, 8)) {
        thug.x = nextX;
        thug.y = nextY;
      } else if (!world.city.circleSolid(nextX, thug.y, 8)) thug.x = nextX;
      else if (!world.city.circleSolid(thug.x, nextY, 8)) thug.y = nextY;
      thug.angle = angle;
    }
    if (thug.cooldown <= 0 && distance < 430) {
      thug.cooldown = 1.15 * world.rng.range(0.8, 1.5);
      const angle = Math.atan2(dy, dx) + world.rng.range(-0.1, 0.1);
      world.fireBullet(thug.x, thug.y, angle, 850, 7, 'thug');
      burst(world, thug.x + Math.cos(angle) * 11, thug.y + Math.sin(angle) * 11, '#ffe6a1', 4, 80, 'muzzle');
      world.events.push({ type: 'shot', at: { x: thug.x, y: thug.y } });
    }
  }
}

function updateCarContacts(world) {
  const dynamic = world.cars.filter((car) => car.driver === 'player' || car.driver === 'police');
  for (const car of dynamic) {
    for (const other of world.cars) {
      if (other === car) continue;
      const specA = VEHICLES[car.kind];
      const specB = VEHICLES[other.kind];
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = (specA.len + specB.len) * 0.36;
      if (distance >= minDistance || distance === 0) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const push = (minDistance - distance) / 2;
      if (!world.city.solidAt(other.x + nx * push, other.y + ny * push)) {
        other.x += nx * push;
        other.y += ny * push;
      }
      if (!world.city.solidAt(car.x - nx * push, car.y - ny * push)) {
        car.x -= nx * push;
        car.y -= ny * push;
      }
      const closing = Math.abs((car.vx - other.vx) * nx + (car.vy - other.vy) * ny);
      if (closing > 70) {
        car.health -= closing * 0.03;
        other.health -= closing * 0.04;
        world.camera.shake = Math.max(world.camera.shake, Math.min(SHAKE.ram, closing * 0.03));
        burst(world, (car.x + other.x) / 2, (car.y + other.y) / 2, '#ffd27a', 5, 120, 'spark');
        world.events.push({ type: 'crash', at: { x: car.x, y: car.y } });
        if (car.health <= 0) wreckCar(world, car);
        if (other.health <= 0) wreckCar(world, other);
        if (other.driver === 'traffic') ejectDriver(world, other);
      }
      car.vx *= 0.55;
      car.vy *= 0.55;
      other.vx *= 0.4;
      other.vy *= 0.4;
    }
  }
}

function updatePlayer(world, dt, controls) {
  const player = world.player;
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.hurt = Math.max(0, player.hurt - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.hudPulse = 0;

  if (player.dead) {
    player.deadTimer -= dt;
    if (player.deadTimer <= 0) {
      const hospital = world.city.spots.hospital;
      const lost = Math.floor(player.money * PLAYER.deathPenalty);
      player.money = Math.max(0, player.money - lost);
      player.health = PLAYER.maxHealth;
      player.armour = 0;
      player.ammo = Math.max(player.ammo, 8);
      player.dead = false;
      player.invuln = 2.4;
      player.onFoot = true;
      player.car = null;
      player.x = hospital.x;
      player.y = hospital.y;
      player.vx = 0;
      player.vy = 0;
      world.wanted = 0;
      world.wantedSeen = 0;
      world.clearTimer = 0;
      world.cops.length = 0;
      world.cars = world.cars.filter((car) => car.driver !== 'police');
      world.camera.x = clamp(hospital.x - 640, 0, CITY_SIZE.width - 1280);
      world.camera.y = clamp(hospital.y - 360, 0, CITY_SIZE.height - 720);
      world.toast = { text: `ST. ORRA'S  ·  $${lost} taken for the patch-up`, timer: 6, color: PALETTE.danger };
      world.say('MARROW', 'You are harder to kill than you look. Get back to the Anchor.', 5);
      world.mission.onDeath(world);
    }
    return;
  }

  const aimX = controls.aimX + world.camera.x;
  const aimY = controls.aimY + world.camera.y;

  if (controls.switchWeapon) {
    player.weapon = player.weapon === 'pistol' ? 'fists' : 'pistol';
    world.toast = { text: player.weapon === 'pistol' ? 'PISTOL' : 'FISTS', timer: 1.6, color: PALETTE.weapon };
  }

  if (player.onFoot) {
    let dirX = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    let dirY = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
    const length = Math.hypot(dirX, dirY) || 1;
    dirX /= length;
    dirY /= length;
    const speed = controls.sprint ? PLAYER.sprint : PLAYER.walk;
    const targetX = dirX * speed * (dirX === 0 && dirY === 0 ? 0 : 1);
    const targetY = dirY * speed * (dirX === 0 && dirY === 0 ? 0 : 1);
    player.vx = approach(player.vx, targetX, PLAYER.accel * dt);
    player.vy = approach(player.vy, targetY, PLAYER.accel * dt);
    const radius = PLAYER.radius;
    const nextX = player.x + player.vx * dt;
    const nextY = player.y + player.vy * dt;
    if (!world.city.circleSolid(nextX, player.y, radius)) player.x = nextX;
    else player.vx = 0;
    if (!world.city.circleSolid(player.x, nextY, radius)) player.y = nextY;
    else player.vy = 0;
    player.x = clamp(player.x, world.city.bounds.minX, world.city.bounds.maxX);
    player.y = clamp(player.y, world.city.bounds.minY, world.city.bounds.maxY);
    player.angle = Math.atan2(aimY - player.y, aimX - player.x);
    const speedNow = Math.hypot(player.vx, player.vy);
    player.moving = speedNow > 12;
    player.sprinting = controls.sprint && player.moving;
    if (player.moving) {
      player.footstep -= dt;
      if (player.footstep <= 0) {
        player.footstep = controls.sprint ? 0.3 : 0.48;
        world.events.push({ type: 'step', at: { x: player.x, y: player.y } });
      }
    }
    if (controls.fire) firePlayerWeapon(world);
    if (controls.use) {
      const car = world.nearbyCar();
      if (car) {
        if (car.driver === 'traffic') ejectDriver(world, car);
        if (car.police && car.driver !== 'player') world.addWanted(2);
        world.putPlayerInCar(car);
        world.events.push({ type: 'enter' });
        world.toast = { text: `${VEHICLES[car.kind].name.toUpperCase()}  ·  F to get out`, timer: 2.4, color: PALETTE.text };
      }
    }
  } else {
    const car = player.car;
    const throttle = (controls.up ? 1 : 0) - (controls.down ? 1 : 0);
    stepCar(world, car, { throttle, steer: controls.steer, handbrake: controls.handbrake }, dt);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (controls.use) {
      exitCar(world, false);
    }
    if (car.wrecked) {
      exitCar(world, true);
    }
    if (controls.horn) {
      player.hornCooldown = (player.hornCooldown || 0) - dt;
      if (player.hornCooldown <= 0) {
        player.hornCooldown = 1.2;
        world.events.push({ type: 'horn' });
        startlePeds(world, car.x, car.y, 150);
      }
    }
  }
}

function updateWanted(world, dt) {
  if (world.wanted === 0) {
    world.wantedSeen = 0;
    world.wantedDecay = 0;
    return;
  }
  const player = world.player;
  const px = player.onFoot ? player.x : player.car.x;
  const py = player.onFoot ? player.y : player.car.y;
  let seen = false;
  for (const car of world.cars) {
    if (car.driver !== 'police') continue;
    if (Math.hypot(car.x - px, car.y - py) < POLICE.sightRadius) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    for (const cop of world.cops) {
      if (cop.state === 'down') continue;
      if (Math.hypot(cop.x - px, cop.y - py) < POLICE.sightRadius) {
        seen = true;
        break;
      }
    }
  }
  if (seen) {
    world.wantedSeen = 0;
    world.wantedDecay = 0;
  } else {
    world.wantedSeen += dt;
    if (world.wantedSeen > POLICE.lostSightSeconds) {
      world.wantedDecay += dt;
      if (world.wantedDecay > POLICE.starCooldown) {
        world.wantedDecay = 0;
        world.wantedSeen = 0;
        world.setWanted(world.wanted - 1);
        if (world.wanted === 0) world.toast = { text: 'WANTED CLEARED', timer: 3, color: PALETTE.money };
      }
    }
  }
}

function updateParticles(world, dt) {
  for (const particle of world.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.exp(-3.2 * dt);
    particle.vy *= Math.exp(-3.2 * dt);
    if (particle.kind === 'smoke') particle.size += dt * 9;
  }
  world.particles = world.particles.filter((particle) => particle.life > 0);
  for (const skid of world.skids) skid.life -= dt;
  world.skids = world.skids.filter((skid) => skid.life > 0);
}

export function updateWorld(world, dt, controls) {
  world.time += dt;
  world.clock = (world.clock + dt / CLOCK.secondsPerMinute) % 1440;
  world.camera.shake = Math.max(0, world.camera.shake - dt * 26);
  world.hudPulse = Math.max(0, world.hudPulse - dt * 2.2);
  if (world.dialogue) {
    world.dialogue.timer -= dt;
    if (world.dialogue.timer <= 0) world.dialogue = null;
  }
  if (world.toast) {
    world.toast.timer -= dt;
    if (world.toast.timer <= 0) world.toast = null;
  }

  updatePlayer(world, dt, controls);
  updateTraffic(world, dt);
  updatePeds(world, dt);
  updateThugs(world, dt);
  updatePolice(world, dt);
  updateBullets(world, dt);
  updateCarContacts(world);
  updateParticles(world, dt);
  updateWanted(world, dt);
  world.mission.update(world, dt);

  const district = world.city.districtAt(world.player.x, world.player.y);
  if (district !== world.district) {
    world.district = district;
    world.toast = { text: DISTRICTS[district].name.toUpperCase(), timer: 2.6, color: DISTRICTS[district].accent };
  }

  const player = world.player;
  const target = player.onFoot ? player : player.car;
  const leadX = (player.onFoot ? 0.16 : 0.42) * (player.onFoot ? player.vx : target.vx);
  const leadY = (player.onFoot ? 0.16 : 0.42) * (player.onFoot ? player.vy : target.vy);
  const desiredX = clamp(target.x + leadX - 640, 0, CITY_SIZE.width - 1280);
  const desiredY = clamp(target.y + leadY - 360, 0, CITY_SIZE.height - 720);
  const easing = 1 - Math.exp(-dt * 5.2);
  world.camera.x += (desiredX - world.camera.x) * easing;
  world.camera.y += (desiredY - world.camera.y) * easing;

  if (world.storyDone) world.creditsTimer += dt;
}

export { STEP };
