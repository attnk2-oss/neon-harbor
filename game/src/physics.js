// Vehicle handling and the collisions that go with it: a light arcade model with a forward
// axis, lateral grip and speed-dependent steering, plus building and kerb collisions that cost
// the car health and throw sparks. It knows nothing about screens or sound; the world it is
// given supplies the consequences (carImpact, hitPed, addSkid).
import { CITY_SIZE, VEHICLES } from './config.js';

export function specOf(car) {
  return VEHICLES[car.kind];
}

/** The four corners of a car's footprint, in world space. */
export function carCorners(car, x = car.x, y = car.y, angle = car.angle) {
  const spec = VEHICLES[car.kind];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfLength = spec.len / 2;
  const halfWidth = spec.wid / 2;
  return [
    { x: x + cos * halfLength - sin * halfWidth, y: y + sin * halfLength + cos * halfWidth },
    { x: x + cos * halfLength + sin * halfWidth, y: y + sin * halfLength - cos * halfWidth },
    { x: x - cos * halfLength + sin * halfWidth, y: y - sin * halfLength - cos * halfWidth },
    { x: x - cos * halfLength - sin * halfWidth, y: y - sin * halfLength + cos * halfWidth },
    { x: x + cos * halfLength, y: y + sin * halfLength },
    { x: x - cos * halfLength, y: y - sin * halfLength },
  ];
}

export function carFits(city, x, y, angle, kind) {
  const probe = { kind, x, y, angle };
  const bounds = city.bounds;
  for (const point of carCorners(probe)) {
    if (point.x < bounds.minX || point.x > bounds.maxX || point.y < bounds.minY || point.y > bounds.maxY) return false;
    if (city.solidAt(point.x, point.y)) return false;
  }
  return true;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/**
 * Advance one car by one step. `control` is { throttle (-1..1), steer (-1..1), handbrake }.
 * Returns the speed the car had while moving, for the HUD and the engine note.
 */
export function stepCar(world, car, control, dt) {
  const spec = VEHICLES[car.kind];
  const throttle = clamp(control.throttle || 0, -1, 1);
  const steer = clamp(control.steer || 0, -1, 1);
  const handbrake = Boolean(control.handbrake);
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);

  let forward = car.vx * cos + car.vy * sin;
  let lateral = -car.vx * sin + car.vy * cos;
  const entrySpeed = Math.hypot(car.vx, car.vy);

  if (throttle > 0) forward += spec.accel * throttle * dt;
  else if (throttle < 0) {
    if (forward > 10) forward -= spec.accel * 2.1 * dt;
    else forward -= spec.accel * 0.5 * dt;
  } else {
    forward *= Math.exp(-0.55 * dt);
  }

  const maxForward = spec.maxSpeed * (car.boost || 1);
  const maxReverse = spec.maxSpeed * 0.32;
  forward = clamp(forward, -maxReverse, maxForward);

  const speedFactor = Math.min(1, Math.abs(forward) / 110);
  const direction = forward < -2 ? -1 : 1;
  const steerRate = steer * spec.turn * speedFactor * direction * dt;
  car.angle += steerRate * (handbrake ? 1.25 : 1);
  car.steer = steer;
  car.speed = Math.abs(forward);

  const grip = handbrake ? spec.grip * 0.18 : spec.grip;
  lateral *= Math.exp(-grip * dt);

  const newCos = Math.cos(car.angle);
  const newSin = Math.sin(car.angle);
  car.vx = newCos * forward - newSin * lateral;
  car.vy = newSin * forward + newCos * lateral;

  const nextX = car.x + car.vx * dt;
  const nextY = car.y + car.vy * dt;
  let moved = false;
  if (carFits(world.city, nextX, nextY, car.angle, car.kind)) {
    car.x = nextX;
    car.y = nextY;
    moved = true;
  } else if (carFits(world.city, nextX, car.y, car.angle, car.kind)) {
    car.x = nextX;
    car.vy *= -0.16;
    moved = true;
  } else if (carFits(world.city, car.x, nextY, car.angle, car.kind)) {
    car.y = nextY;
    car.vx *= -0.16;
    moved = true;
  } else {
    car.vx *= -0.22;
    car.vy *= -0.22;
  }

  // A kerb or wall hit: the car pays for it, and the world gets the sparks and shake.
  if (car.speed > 58 && !moved) {
    world.carImpact(car, car.speed, car.x + newCos * spec.len * 0.4, car.y + newSin * spec.len * 0.4);
  }

  if (handbrake && car.speed > 55) world.addSkid(car.x, car.y, car.angle, car.speed);

  // People do not stop a car, but they do slow it a little and they do notice.
  for (let index = 0; index < world.peds.length; index += 1) {
    const ped = world.peds[index];
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    if (dx * dx + dy * dy < (spec.len * 0.52 + 7) ** 2) {
      const speed = Math.hypot(car.vx, car.vy);
      if (speed > 36) {
        world.hitPed(ped, car, speed);
        car.vx *= 0.9;
        car.vy *= 0.9;
      }
    }
  }
  return car.speed;
}

/** Nudge a car back onto free ground after a spawn or a respawn. */
export function findFreeCarSpot(city, x, y, kind) {
  if (carFits(city, x, y, 0, kind)) return { x, y, angle: 0 };
  for (let ring = 1; ring < 8; ring += 1) {
    for (let step = 0; step < 8; step += 1) {
      const angle = (step / 8) * Math.PI * 2;
      const px = x + Math.cos(angle) * ring * 16;
      const py = y + Math.sin(angle) * ring * 16;
      if (carFits(city, px, py, 0, kind)) return { x: px, y: py, angle: 0 };
    }
  }
  return { x, y, angle: 0 };
}

/** How far a point is from the harbour edge; used to keep spawns out of the water. */
export function onLand(city, x, y) {
  return x > city.bounds.minX && x < city.bounds.maxX && y > city.bounds.minY && y < city.bounds.maxY;
}

export const CITY_LIMIT = CITY_SIZE;
