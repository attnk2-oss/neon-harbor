// The story: five jobs from Marrow at the Anchor, the wrong end of Port Kessel's food chain,
// and Sergeant Okonkwo's Harbour Patrol leaning on every step. A mission is a chain of stages
// (drive here, steal this, lose the tail, clear the room) with a marker, a line of dialogue and
// a reward. The fifth ends the story and rolls the credits.
import { makeCar } from './traffic.js';
import { findFreeCarSpot } from './physics.js';

export const MISSIONS = [
  {
    id: 'dock-light',
    title: 'Dock Light',
    client: 'MARROW',
    reward: 250,
    brief: "You came back. The harbour remembers what you owe it. Pier Nine has a crate with my mark on it. Bring it to the Anchor and don't open it.",
    outro: 'Clean. You still move like the harbour owes you something.',
    stages: [
      { kind: 'reach', spot: 'docksPier', radius: 74, text: 'Collect the crate at Pier Nine' },
      { kind: 'reach', spot: 'anchor', radius: 62, text: 'Bring the crate to the Anchor' },
    ],
  },
  {
    id: 'bream-work',
    title: 'Bream Work',
    client: 'MARROW',
    reward: 400,
    brief: "There's a Bream van in Saltmarket with a Foundry delivery. It's hot. The patrol will notice the plate by the time you're moving. Make them chase the plate, not the cargo.",
    outro: "The cargo's in. The plate's burned. That's how I like my mornings.",
    stages: [
      { kind: 'steal', spot: 'saltVan', radius: 60, vehicle: 'bream', text: 'Steal the Bream van in Saltmarket' },
      { kind: 'reach', spot: 'foundryBay', radius: 72, text: 'Deliver the cargo to the Foundry bay', mustBeIn: 'bream' },
      {
        kind: 'evade',
        text: 'Lose the patrol',
        setWanted: 2,
        speaker: 'SGT. OKONKWO',
        line: "Vale. That van is on my board. Stop it and we can talk.",
      },
    ],
  },
  {
    id: 'the-tail',
    title: 'The Tail',
    client: 'MARROW',
    reward: 650,
    brief: "Okonkwo's boys are watching the Strip. Take the Kestrel out of the garage, let them get a look at you, then lose them. If they follow you home I'll be very disappointed.",
    outro: "No tail, no names. Maybe you're worth the trouble after all.",
    stages: [
      { kind: 'steal', spot: 'stripGarage', radius: 58, vehicle: 'kestrel', text: 'Take the Kestrel from the Strip garage' },
      {
        kind: 'evade',
        text: 'Shake the Harbour Patrol',
        setWanted: 3,
        speaker: 'SGT. OKONKWO',
        line: "You're not hard to find, Vale. That's the problem.",
      },
      { kind: 'reach', spot: 'anchor', radius: 62, text: 'Get back to the Anchor' },
    ],
  },
  {
    id: 'impound',
    title: 'Impound',
    client: 'MARROW',
    reward: 900,
    brief: 'They impounded my ledger at Gull Point. Walk in, take it, walk out. If the alarm goes off I hear the Harbour Patrol is hiring.',
    outro: "The ledger's back where it belongs. Okonkwo will feel that in the morning.",
    stages: [
      { kind: 'reach', spot: 'impound', radius: 80, onFoot: true, text: 'Walk into the impound lot' },
      {
        kind: 'reach',
        spot: 'impound',
        radius: 32,
        onFoot: true,
        text: 'Take the ledger from the lock-up',
        setWanted: 3,
        speaker: 'SGT. OKONKWO',
        line: "You're in my house now, Vale.",
      },
      { kind: 'reach', spot: 'anchor', radius: 62, text: 'Carry the ledger back to the Anchor' },
    ],
  },
  {
    id: 'harbor-lights',
    title: 'Harbor Lights',
    client: 'MARROW',
    reward: 2500,
    brief: "Kettle terminal, last job. Okonkwo keeps his files there and six of his people. Clear it out. Then take the north ring and don't look back.",
    outro: "That's the last of it. Port Kessel's yours if you want it, Vale. I'm getting out of the rain.",
    stages: [
      { kind: 'reach', spot: 'terminal', radius: 88, text: 'Drive to the Kettle terminal' },
      {
        kind: 'clear',
        spot: 'terminal',
        radius: 120,
        count: 6,
        text: 'Clear the terminal',
        setWanted: 3,
        speaker: 'SGT. OKONKWO',
        line: 'Terminal is closed, Vale. For good.',
      },
      { kind: 'reach', spot: 'northBridge', radius: 110, text: 'Escape across the north ring', setWanted: 4, speaker: 'SGT. OKONKWO', line: "You're not leaving, Vale. Not tonight." },
    ],
  },
];

export class MissionController {
  constructor() {
    this.completed = 0;
    this.active = null;
    this.cooldown = 0;
    this.idleArmed = true;
    this.stageTime = 0;
  }

  get storyDone() {
    return this.completed >= MISSIONS.length;
  }

  get current() {
    return MISSIONS[this.completed] || null;
  }

  setCompleted(count) {
    this.completed = Math.max(0, Math.min(MISSIONS.length, count));
    this.active = null;
    this.cooldown = 0;
    this.idleArmed = false;
  }

  update(world, dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const player = world.player;
    const anchor = world.city.spots.anchor;
    if (!this.storyDone && !this.active) {
      const distance = Math.hypot(player.x - anchor.x, player.y - anchor.y);
      if (distance > 150) this.idleArmed = true;
      if (this.cooldown <= 0 && this.idleArmed && distance < 72) this.start(world);
      return;
    }
    if (!this.active) return;
    this.stageTime += dt;
    const mission = this.active.def;
    const stage = mission.stages[this.active.stage];
    const point = stage.spot ? world.city.spots[stage.spot] : null;
    const dx = point ? player.x - point.x : 0;
    const dy = point ? player.y - point.y : 0;
    const distance = point ? Math.hypot(dx, dy) : Infinity;

    let done = false;
    if (stage.kind === 'reach') {
      const onFootOkay = !stage.onFoot || player.onFoot;
      const carOkay = !stage.mustBeIn || (player.car && player.car.kind === stage.mustBeIn);
      done = Boolean(point) && onFootOkay && carOkay && distance < stage.radius;
    } else if (stage.kind === 'steal') {
      done = Boolean(player.car && player.car.kind === stage.vehicle);
    } else if (stage.kind === 'evade') {
      done = world.wanted === 0 && this.stageTime > 1.5;
    } else if (stage.kind === 'clear') {
      done = this.active.spawned && world.thugs.length === 0;
    }
    if (done) this.advance(world);
  }

  start(world) {
    if (this.storyDone || this.active) return;
    const def = MISSIONS[this.completed];
    this.active = { def, stage: 0, spawned: false };
    this.stageTime = 0;
    this.idleArmed = false;
    for (const car of world.cars) car.missionCar = false;
    world.say(def.client, def.brief, 8);
    world.toast = { text: `${def.title.toUpperCase()}  ·  ${def.stages[0].text}`, timer: 4, color: '#ffd15c' };
    this.enterStage(world, 0);
  }

  enterStage(world, index) {
    const mission = this.active.def;
    const stage = mission.stages[index];
    this.active.stage = index;
    this.active.spawned = false;
    this.stageTime = 0;
    const point = stage.spot ? world.city.spots[stage.spot] : null;
    world.objective = point ? {
      x: point.x,
      y: point.y,
      radius: stage.radius || 70,
      title: mission.title.toUpperCase(),
      label: stage.text,
      kind: stage.kind,
    } : null;
    if (stage.setWanted) world.setWanted(stage.setWanted);
    if (index > 0 && stage.line) world.say(stage.speaker || mission.client, stage.line, 4.5);

    if (stage.kind === 'steal' && point) {
      const exists = world.cars.some((car) => car.kind === stage.vehicle && Math.hypot(car.x - point.x, car.y - point.y) < 160);
      if (!exists) {
        const spot = findFreeCarSpot(world.city, point.x, point.y, stage.vehicle);
        const car = makeCar(world, stage.vehicle, spot.x, spot.y, 0.35, { driver: null });
        car.missionCar = true;
        world.cars.push(car);
      }
    }
    if (stage.kind === 'clear') {
      world.spawnThugs(stage.count || 6, point.x, point.y, 150);
      this.active.spawned = true;
    }
  }

  advance(world) {
    const mission = this.active.def;
    const next = this.active.stage + 1;
    if (next < mission.stages.length) {
      this.enterStage(world, next);
      return;
    }
    world.player.money += mission.reward;
    world.toast = { text: `MISSION COMPLETE  ·  $${mission.reward}`, timer: 5, color: '#7fe3a1' };
    world.say(mission.client, mission.outro, 6);
    world.thugs.length = 0;
    world.wanted = 0;
    world.clearTimer = 0;
    world.cops.length = 0;
    this.completed += 1;
    this.active = null;
    this.cooldown = 7;
    this.idleArmed = false;
    if (this.completed >= MISSIONS.length) {
      world.storyDone = true;
      world.creditsTimer = 0;
      world.objective = null;
    } else {
      this.setObjectiveToAnchor(world);
    }
    world.save();
  }

  onDeath(world) {
    if (!this.active) return;
    world.thugs.length = 0;
    this.active.stage = 0;
    this.enterStage(world, 0);
    world.say('MARROW', 'Get up. The job is still on.', 4);
  }

  setObjectiveToAnchor(world) {
    const anchor = world.city.spots.anchor;
    world.objective = {
      x: anchor.x,
      y: anchor.y,
      radius: 70,
      title: this.storyDone ? '' : 'THE ANCHOR',
      label: this.storyDone ? '' : 'Find Marrow at The Anchor',
    };
  }
}

export const TOTAL_MISSIONS = MISSIONS.length;
