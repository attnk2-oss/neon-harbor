// Traffic and the people on the pavement. Cars follow the grid's lanes, keep a gap, give way
// at junctions and stop for somebody standing in the road. Pedestrians walk the block loops in
// small groups, cross at the corners now and then, and scatter when a gun goes off or a car
// comes at them. Port Kessel has 30 cars and about 65 people on the street at any time.
import { CITY, PEDS, TRAFFIC, VEHICLES, TRAFFIC_FILLS, TRAFFIC_KINDS } from './config.js';
import { blockLoop, sidewalkPoint } from './city.js';

const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const LANE = CITY.lane;
const SEGMENT = CITY.cell;

export function makeCar(world, kind, x, y, angle, options = {}) {
  const spec = VEHICLES[kind];
  return {
    id: world.nextCarId++,
    kind,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    speed: 0,
    steer: 0,
    driver: options.driver ?? 'traffic',
    fill: options.fill ?? spec.fill,
    health: options.health ?? spec.hp,
    maxHealth: options.maxHealth ?? spec.hp,
    police: Boolean(spec.police),
    lightsOn: options.lightsOn ?? true,
    wrecked: false,
    burning: 0,
    smokeTimer: 0,
    fromI: options.fromI ?? 0,
    fromJ: options.fromJ ?? 0,
    dir: options.dir ?? 0,
    t: options.t ?? 0,
    cruise: options.cruise ?? 160,
    waiting: 0,
    nextDir: options.dir ?? 0,
    route: options.route ?? null,
    stolen: false,
    enteredAt: 0,
  };
}

function lanePoint(car) {
  const a = DIRS[car.dir];
  const nx = CITY.margin + CITY.road / 2 + car.fromI * CITY.cell;
  const ny = CITY.margin + CITY.road / 2 + car.fromJ * CITY.cell;
  const tx = nx + a.x * SEGMENT;
  const ty = ny + a.y * SEGMENT;
  const baseX = nx + (tx - nx) * car.t;
  const baseY = ny + (ty - ny) * car.t;
  // Right-hand traffic: the lane sits to the right of the direction of travel.
  const rightX = -a.y;
  const rightY = a.x;
  return { x: baseX + rightX * LANE, y: baseY + rightY * LANE };
}

function placeTraffic(car) {
  const a = DIRS[car.dir];
  const point = lanePoint(car);
  car.x = point.x;
  car.y = point.y;
  car.angle = Math.atan2(a.y, a.x);
}

export function chooseDirection(rng, i, j, dir) {
  const options = [];
  for (let next = 0; next < 4; next += 1) {
    if (next === (dir + 2) % 4) continue;
    const ni = i + DIRS[next].x;
    const nj = j + DIRS[next].y;
    if (ni < 0 || nj < 0 || ni > CITY.cols || nj > CITY.rows) continue;
    const weight = next === dir ? 3 : 1;
    for (let count = 0; count < weight; count += 1) options.push(next);
  }
  if (options.length === 0) return (dir + 2) % 4;
  return options[Math.floor(rng() * options.length)];
}

export function spawnTraffic(world) {
  world.cars = world.cars.filter((car) => car.driver === 'player' || car.police);
  const player = world.player;
  let attempts = 0;
  while (world.cars.length < TRAFFIC.count && attempts < 400) {
    attempts += 1;
    const i = world.rng.int(0, CITY.cols - 1);
    const j = world.rng.int(0, CITY.rows - 1);
    const dir = world.rng.int(0, 3);
    const t = world.rng.range(0.08, 0.92);
    const car = makeCar(world, world.rng.pick(TRAFFIC_KINDS), 0, 0, 0, {
      fromI: i,
      fromJ: j,
      dir,
      t,
      cruise: world.rng.range(TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
      fill: world.rng.pick(TRAFFIC_FILLS),
    });
    placeTraffic(car);
    if (Math.hypot(car.x - player.x, car.y - player.y) < 80) continue;
    let clear = true;
    for (const other of world.cars) {
      if (Math.hypot(car.x - other.x, car.y - other.y) < 44) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    car.city = world.city;
    world.cars.push(car);
  }
}

function findGap(world, car) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let gap = Infinity;
  for (const other of world.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * cos + dy * sin;
    const side = -dx * sin + dy * cos;
    if (ahead > 4 && ahead < 120 && Math.abs(side) < 24) gap = Math.min(gap, ahead - 22);
  }
  const player = world.player;
  if (!player.onFoot && player.car && player.car !== car) {
    const other = player.car;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * cos + dy * sin;
    const side = -dx * sin + dy * cos;
    if (ahead > 4 && ahead < 120 && Math.abs(side) < 26) gap = Math.min(gap, ahead - 24);
  }
  return gap;
}

function junctionBlocked(world, car, nodeX, nodeY) {
  if (car.waiting > 5) return false;
  for (const other of world.cars) {
    if (other === car) continue;
    const dist = Math.hypot(other.x - nodeX, other.y - nodeY);
    if (dist < 54) return true;
    if (other.driver === 'traffic' && Math.hypot(other.x - nodeX, other.y - nodeY) < 120) {
      const otherAhead = Math.hypot(other.x - car.x, other.y - car.y);
      if (otherAhead < 90 && other.dir !== car.dir) return true;
    }
  }
  const player = world.player;
  const playerDist = Math.hypot(player.x - nodeX, player.y - nodeY);
  if (playerDist < 70) return true;
  if (player.onFoot === false && player.car) {
    const dx = player.car.x - car.x;
    const dy = player.car.y - car.y;
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    const ahead = dx * cos + dy * sin;
    const side = -dx * sin + dy * cos;
    if (ahead > 0 && ahead < 95 && Math.abs(side) < 34) return true;
  }
  return false;
}

export function updateTraffic(world, dt) {
  for (const car of world.cars) {
    if (car.driver !== 'traffic') continue;
    if (car.wrecked) {
      car.speed = 0;
      continue;
    }
    const dir = DIRS[car.dir];
    const nodeX = CITY.margin + CITY.road / 2 + (car.fromI + dir.x) * CITY.cell;
    const nodeY = CITY.margin + CITY.road / 2 + (car.fromJ + dir.y) * CITY.cell;
    const distanceToNode = Math.hypot(nodeX - car.x, nodeY - car.y);
    let target = car.cruise;

    const gap = findGap(world, car);
    if (gap < TRAFFIC.followGap) target = Math.max(0, Math.min(target, (gap - 16) * 3.2));

    if (distanceToNode < TRAFFIC.junctionGap && junctionBlocked(world, car, nodeX, nodeY)) {
      target = 0;
      car.waiting += dt;
    } else {
      car.waiting = Math.max(0, car.waiting - dt * 0.5);
    }

    const player = world.player;
    if (player.onFoot) {
      const dx = player.x - car.x;
      const dy = player.y - car.y;
      const cos = Math.cos(car.angle);
      const sin = Math.sin(car.angle);
      const ahead = dx * cos + dy * sin;
      const side = -dx * sin + dy * cos;
      if (ahead > 0 && ahead < 62 && Math.abs(side) < 30) target = Math.min(target, Math.max(0, (ahead - 24) * 4));
    }

    const change = target > car.speed ? 95 : 260;
    if (car.speed < target) car.speed = Math.min(target, car.speed + change * dt);
    else car.speed = Math.max(target, car.speed - change * dt);

    car.t += (car.speed * dt) / SEGMENT;
    if (car.t >= 1) {
      car.fromI += dir.x;
      car.fromJ += dir.y;
      car.t = 0;
      car.dir = chooseDirection(world.rng, car.fromI, car.fromJ, car.dir);
      car.waiting = 0;
    }
    placeTraffic(car);
  }
}

/** Build the loop of pavement points a pedestrian walks, with the occasional crossing. */
function buildPath(world, block, start, crossChance) {
  const loop = blockLoop(world.city, block, 11);
  let nearest = 0;
  let best = Infinity;
  for (let index = 0; index < 4; index += 1) {
    const dist = Math.hypot(loop[index].x - start.x, loop[index].y - start.y);
    if (dist < best) {
      best = dist;
      nearest = index;
    }
  }
  const path = [{ x: start.x, y: start.y }];
  for (let step = 0; step < 4; step += 1) {
    const point = loop[(nearest + step) % 4];
    path.push({ x: point.x, y: point.y });
    if (world.rng() < crossChance && step === 1) {
      const outward = { x: Math.sign(point.x - (block.x + block.w / 2)), y: Math.sign(point.y - (block.y + block.h / 2)) };
      if (outward.x !== 0 && outward.y !== 0) outward.y = 0;
      const far = { x: point.x + outward.x * (CITY.road + 24), y: point.y + outward.y * (CITY.road + 24) };
      // Crossing the road at a corner, and coming back on the far side.
      path.push(far, { x: point.x, y: point.y });
    }
  }
  path.push({ x: path[0].x, y: path[0].y });
  return path;
}

export function spawnPeds(world) {
  world.peds = [];
  const blocks = world.city.blocks;
  for (let group = 0; group < PEDS.groups; group += 1) {
    const block = blocks[world.rng.int(0, blocks.length - 1)];
    const start = sidewalkPoint(world.city, world.rng, block);
    const count = world.rng.int(PEDS.groupMin, PEDS.groupMax);
    for (let member = 0; member < count; member += 1) {
      const point = member === 0 ? start : sidewalkPoint(world.city, world.rng, block);
      const path = buildPath(world, block, point, world.rng.chance(0.35) ? 0.5 : 0);
      world.peds.push({
        x: point.x,
        y: point.y,
        angle: world.rng.range(0, Math.PI * 2),
        state: 'walk',
        path,
        target: 1,
        speed: PEDS.walk * world.rng.range(0.82, 1.2),
        block,
        fleeX: 0,
        fleeY: 0,
        timer: 0,
        bob: world.rng.range(0, Math.PI * 2),
        umbrella: world.rng.chance(0.4),
        coat: world.rng.pick(['#39465c', '#4d3a46', '#3d4d44', '#5a4b38', '#2f3a4a', '#584a5c']),
        skin: world.rng.pick(['#b98a6c', '#8a5f48', '#d9a681', '#6f4a38']),
      });
    }
  }
}

export function startlePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const dist = Math.hypot(ped.x - x, ped.y - y);
    if (dist < radius) {
      const away = Math.atan2(ped.y - y, ped.x - x) + world.rng.range(-0.4, 0.4);
      ped.state = 'flee';
      ped.fleeX = Math.cos(away);
      ped.fleeY = Math.sin(away);
      ped.timer = world.rng.range(3.2, 5.4);
    }
  }
}

function movePed(world, ped, vx, vy, dt) {
  const nextX = ped.x + vx * dt;
  const nextY = ped.y + vy * dt;
  if (!world.city.solidAt(nextX, nextY)) {
    ped.x = nextX;
    ped.y = nextY;
  } else if (!world.city.solidAt(nextX, ped.y)) {
    ped.x = nextX;
  } else if (!world.city.solidAt(ped.x, nextY)) {
    ped.y = nextY;
  }
  ped.x = Math.max(world.city.bounds.minX, Math.min(world.city.bounds.maxX, ped.x));
  ped.y = Math.max(world.city.bounds.minY, Math.min(world.city.bounds.maxY, ped.y));
}

export function updatePeds(world, dt) {
  const player = world.player;
  for (const ped of world.peds) {
    ped.bob += dt * 7.5;
    if (ped.state === 'down') {
      ped.timer -= dt;
      if (ped.timer <= 0) {
        ped.state = 'flee';
        ped.fleeX = Math.cos(ped.angle);
        ped.fleeY = Math.sin(ped.angle);
        ped.timer = 3.5;
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.timer -= dt;
      movePed(world, ped, ped.fleeX * PEDS.flee, ped.fleeY * PEDS.flee, dt);
      ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
      if (ped.timer <= 0) {
        ped.state = 'walk';
        const block = world.city.blockAt(ped.x, ped.y) || ped.block || world.city.blocks[0];
        const path = buildPath(world, block, { x: ped.x, y: ped.y }, 0);
        ped.path = path;
        ped.target = 1;
      }
      continue;
    }
    if (!player.onFoot && player.car) {
      const dist = Math.hypot(player.car.x - ped.x, player.car.y - ped.y);
      if (dist < 82 && Math.hypot(player.car.vx, player.car.vy) > 150) {
        const away = Math.atan2(ped.y - player.car.y, ped.x - player.car.x);
        ped.state = 'flee';
        ped.fleeX = Math.cos(away);
        ped.fleeY = Math.sin(away);
        ped.timer = 2.2;
        continue;
      }
    }
    const point = ped.path[ped.target];
    if (!point) {
      ped.target = 0;
      continue;
    }
    const dx = point.x - ped.x;
    const dy = point.y - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 5) {
      ped.target = (ped.target + 1) % ped.path.length;
      continue;
    }
    ped.angle = Math.atan2(dy, dx);
    movePed(world, ped, (dx / dist) * ped.speed, (dy / dist) * ped.speed, dt);
  }
}
