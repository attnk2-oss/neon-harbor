// The Harbour Patrol. Stars decide how many cruisers and foot officers come looking; cruisers
// chase the player's car, ram it and, from three stars, shoot. Officers on foot run the pavements,
// close in and fire from two stars. They spawn off camera on the road grid and are dropped once
// the wanted level is gone and they have been out of sight for a while.
import { CITY, CITY_SIZE, POLICE } from './config.js';
import { makeCar } from './traffic.js';
import { stepCar, findFreeCarSpot } from './physics.js';

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function normalise(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function wantedCounts(stars) {
  return {
    cruisers: [0, 1, 2, 3, 4, 5][clamp(stars, 0, 5)],
    foot: [0, 2, 2, 2, 3, 4][clamp(stars, 0, 5)],
  };
}

/** A road point roughly `distance` away, snapped to the nearest lane centre. */
function offscreenRoadPoint(world, distance) {
  const player = world.player;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const angle = world.rng() * Math.PI * 2;
    const range = distance * world.rng.range(0.85, 1.25);
    let x = player.x + Math.cos(angle) * range;
    let y = player.y + Math.sin(angle) * range;
    x = clamp(x, 120, CITY_SIZE.width - 120);
    y = clamp(y, 120, CITY_SIZE.waterTop - 60);
    if (world.rng() < 0.5) {
      const i = clamp(Math.round((x - CITY.margin - CITY.road / 2) / CITY.cell), 0, CITY.cols);
      x = CITY_SIZE.node(i) + (world.rng() < 0.5 ? -CITY.lane : CITY.lane);
      y = clamp(y, 100, CITY_SIZE.waterTop - 60);
    } else {
      const j = clamp(Math.round((y - CITY.margin - CITY.road / 2) / CITY.cell), 0, CITY.rows);
      y = CITY_SIZE.node(j) + (world.rng() < 0.5 ? -CITY.lane : CITY.lane);
      x = clamp(x, 100, CITY_SIZE.width - 100);
    }
    if (world.city.solidAt(x, y)) continue;
    if (Math.hypot(x - player.x, y - player.y) < distance * 0.7) continue;
    return { x, y };
  }
  return null;
}

function spawnCruiser(world) {
  const point = offscreenRoadPoint(world, 920);
  if (!point) return false;
  const angle = Math.atan2(world.player.y - point.y, world.player.x - point.x);
  const spot = findFreeCarSpot(world.city, point.x, point.y, 'tern');
  const car = makeCar(world, 'tern', spot.x, spot.y, angle, {
    driver: 'police',
    health: POLICE.cruiserHealth,
    maxHealth: POLICE.cruiserHealth,
  });
  car.angle = angle;
  car.vx = Math.cos(angle) * 120;
  car.vy = Math.sin(angle) * 120;
  car.copCooldown = world.rng.range(0.4, 1.2);
  car.stuckTime = 0;
  car.reverseTime = 0;
  world.cars.push(car);
  return true;
}

function spawnFootCop(world) {
  const point = offscreenRoadPoint(world, 780);
  if (!point) return false;
  world.cops.push({
    x: point.x,
    y: point.y,
    angle: 0,
    health: POLICE.footHealth,
    state: 'chase',
    cooldown: world.rng.range(0.3, 1.1),
    melee: 0,
    downTimer: 0,
  });
  return true;
}

export function spawnPoliceForShot(world, stars) {
  world.wanted = stars;
  const counts = wantedCounts(stars);
  for (let index = 0; index < counts.cruisers; index += 1) spawnCruiser(world);
  for (let index = 0; index < counts.foot; index += 1) spawnFootCop(world);
}

export function updatePolice(world, dt) {
  const stars = world.wanted;
  const counts = wantedCounts(stars);

  if (stars > 0) {
    world.policeSpawnTimer -= dt;
    const activeCars = world.cars.filter((car) => car.driver === 'police' && !car.wrecked).length;
    if (world.policeSpawnTimer <= 0 && activeCars < counts.cruisers) {
      world.policeSpawnTimer = 1.6;
      spawnCruiser(world);
    }
    const activeFoot = world.cops.filter((cop) => cop.state !== 'down').length;
    if (world.policeSpawnTimer <= 0.8 && activeFoot < counts.foot) spawnFootCop(world);
  } else {
    world.clearTimer = (world.clearTimer || 0) + dt;
    if (world.clearTimer > 6) {
      world.cars = world.cars.filter((car) => car.driver !== 'police');
      world.cops.length = 0;
    }
  }

  const player = world.player;
  const playerX = player.onFoot ? player.x : player.car.x;
  const playerY = player.onFoot ? player.y : player.car.y;

  for (const car of world.cars) {
    if (car.driver !== 'police') continue;
    if (car.wrecked) {
      car.speed = 0;
      continue;
    }
    const dx = playerX - car.x;
    const dy = playerY - car.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 2600) {
      car.driver = null;
      continue;
    }
    let desired = Math.atan2(dy, dx);
    let difference = normalise(desired - car.angle);
    let throttle = 1;
    let steer = clamp(difference * 1.9, -1, 1);
    car.reverseTime = Math.max(0, (car.reverseTime || 0) - dt);
    if (car.reverseTime > 0) {
      throttle = -0.65;
      steer = -steer;
    } else if (Math.abs(difference) > 1.7 && distance < 170) {
      car.reverseTime = 0.8;
    } else if (distance < 62 && car.speed > 180) {
      throttle = 0.25;
    }
    if (car.speed < 12) car.stuckTime = (car.stuckTime || 0) + dt;
    else car.stuckTime = 0;
    if (car.stuckTime > 1.1) {
      car.reverseTime = 0.9;
      car.stuckTime = 0;
    }
    stepCar(world, car, { throttle, steer, handbrake: false }, dt);

    // Ramming is just driving very close; the contact is handled with the other car.
    car.copCooldown -= dt;
    if (stars >= 3 && distance < 570 && car.copCooldown <= 0) {
      car.copCooldown = POLICE.shotCooldown * world.rng.range(0.8, 1.3);
      const aim = Math.atan2(dy, dx) + world.rng.range(-0.1, 0.1);
      const cos = Math.cos(car.angle);
      const sin = Math.sin(car.angle);
      world.fireBullet(car.x + cos * 26, car.y + sin * 26, aim, 980, POLICE.bulletDamage, 'cop');
      world.particles.push({ x: car.x + cos * 30, y: car.y + sin * 30, vx: 0, vy: 0, life: 0.3, max: 1, size: 5, color: '#ffe6a1', kind: 'muzzle' });
      world.events.push({ type: 'shot', at: { x: car.x, y: car.y } });
    }

    if (player.onFoot && distance < 34 && car.speed > 20) {
      world.damagePlayer(45 * dt, 'car');
    }
  }

  for (const cop of world.cops) {
    if (cop.state === 'down') {
      cop.downTimer -= dt;
      continue;
    }
    const dx = playerX - cop.x;
    const dy = playerY - cop.y;
    const distance = Math.hypot(dx, dy);
    cop.cooldown -= dt;
    if (distance > 40) {
      const angle = Math.atan2(dy, dx);
      const step = POLICE.footSpeed * dt;
      const nextX = cop.x + Math.cos(angle) * step;
      const nextY = cop.y + Math.sin(angle) * step;
      if (!world.city.circleSolid(nextX, nextY, 7)) {
        cop.x = nextX;
        cop.y = nextY;
      } else if (!world.city.circleSolid(nextX, cop.y, 7)) cop.x = nextX;
      else if (!world.city.circleSolid(cop.x, nextY, 7)) cop.y = nextY;
      cop.angle = angle;
    } else if (player.onFoot) {
      cop.melee -= dt;
      if (cop.melee <= 0) {
        cop.melee = 1.1;
        world.damagePlayer(7, 'cop');
        world.shake = Math.max(world.shake, 4);
        world.events.push({ type: 'punch' });
      }
    }
    if (stars >= 2 && distance < 440 && cop.cooldown <= 0) {
      cop.cooldown = 1.35 * world.rng.range(0.8, 1.25);
      const angle = Math.atan2(dy, dx) + world.rng.range(-0.08, 0.08);
      world.fireBullet(cop.x + Math.cos(angle) * 12, cop.y + Math.sin(angle) * 12, angle, 900, 8, 'cop');
      world.particles.push({ x: cop.x + Math.cos(angle) * 15, y: cop.y + Math.sin(angle) * 15, vx: 0, vy: 0, life: 0.3, max: 1, size: 4, color: '#ffe6a1', kind: 'muzzle' });
      world.events.push({ type: 'shot', at: { x: cop.x, y: cop.y } });
    }
  }

  world.cops = world.cops.filter((cop) => !(cop.state === 'down' && cop.downTimer < -8));
}

/** A parked cruiser used by the impound mission and by one staged screenshot. */
export function parkCruiser(world, x, y, angle) {
  const spot = findFreeCarSpot(world.city, x, y, 'tern');
  const car = makeCar(world, 'tern', spot.x, spot.y, angle, {
    driver: null,
    health: POLICE.cruiserHealth,
    maxHealth: POLICE.cruiserHealth,
  });
  car.lightsOn = false;
  world.cars.push(car);
  return car;
}

