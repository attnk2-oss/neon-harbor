// Port Kessel itself: the grid, its blocks and buildings, the parks, market squares and
// container yards, the neon signs of the Lantern Strip, the lamps, the docks and the water,
// plus the handful of named places the story uses. Everything is generated from one seed,
// so the city is the same on every visit and every staged screenshot.
import { CITY, CITY_SIZE, DISTRICTS, PALETTE, NEON } from './config.js';
import { createRandom } from './random.js';

const SOLID_CELL = 128;

const TONES = {
  downtown: ['#1b2331', '#202939', '#171e2a'],
  strip: ['#231c2b', '#1d1a26', '#2a1f2a'],
  resi: ['#211d20', '#1c1a1d', '#262120'],
  market: ['#241f1a', '#1f1b18', '#2a231c'],
  industry: ['#1e2020', '#232323', '#1a1e20'],
  docks: ['#1a2126', '#1e262b', '#171d22'],
};

const HEIGHTS = {
  downtown: [52, 116],
  strip: [28, 68],
  resi: [20, 54],
  market: [16, 38],
  industry: [16, 46],
  docks: [14, 34],
};

const SIGN_WORDS = {
  downtown: ['VESPER', 'KESSEL', 'HARBOUR', 'BANK', 'TOWER', 'PORT AUTHORITY'],
  strip: ['HOTEL', 'NOODLES', 'PAWN', 'TATTOO', 'CLUB', 'LIQUOR', 'MOTEL', 'ARCADE'],
  resi: ['LAUNDRY', 'GROCERY', 'CAFE', 'BUS', 'PHARMACY'],
  market: ['FISH', 'FRUIT', 'SALT', 'TRADERS', 'ICE'],
  industry: ['FOUNDRY', 'SCRAP', 'STEEL', 'WELD', 'HERTZ'],
  docks: ['DOCK 9', 'KETTLE', 'CARGO', 'CRANE', 'PILOT'],
};

/** A rectangle split into one to four lots with a gap between them. */
function splitLots(rng, rect, depth) {
  if (depth <= 0 || rect.w < 96 || rect.h < 96 || rng.chance(0.24)) return [rect];
  const gap = 7;
  if (rng.chance(0.5)) {
    const cut = rect.w * rng.range(0.36, 0.64);
    return [
      ...splitLots(rng, { x: rect.x, y: rect.y, w: cut - gap / 2, h: rect.h }, depth - 1),
      ...splitLots(rng, { x: rect.x + cut + gap / 2, y: rect.y, w: rect.w - cut - gap / 2, h: rect.h }, depth - 1),
    ];
  }
  const cut = rect.h * rng.range(0.36, 0.64);
  return [
    ...splitLots(rng, { x: rect.x, y: rect.y, w: rect.w, h: cut - gap / 2 }, depth - 1),
    ...splitLots(rng, { x: rect.x, y: rect.y + cut + gap / 2, w: rect.w, h: rect.h - cut - gap / 2 }, depth - 1),
  ];
}

function windowGrid(rng, width, elevation) {
  const cols = Math.max(2, Math.floor(width / 14));
  const rows = Math.max(1, Math.floor(elevation / 10));
  const cells = [];
  for (let index = 0; index < cols * rows; index += 1) {
    const roll = rng();
    cells.push(roll < 0.33 ? 0 : roll < 0.72 ? 1 : 2);
  }
  return { cols, rows, cells };
}

function makeBuilding(rng, lot, district) {
  const insetX = rng.range(1.5, 4);
  const insetY = rng.range(1.5, 4);
  const w = lot.w - insetX * 2;
  const h = lot.h - insetY * 2;
  if (w < 20 || h < 20) return null;
  const range = HEIGHTS[district.kind];
  let height = rng.range(range[0], range[1]);
  if (district.kind === 'downtown' && rng.chance(0.35)) height *= 1.25;
  if (district.kind === 'strip' && rng.chance(0.2)) height *= 1.2;
  const elevation = Math.round(height * 0.3);
  const tones = TONES[district.kind];
  const roofProps = [];
  const propCount = rng.int(2, 5);
  for (let index = 0; index < propCount; index += 1) {
    const propW = rng.range(8, 19);
    const propH = rng.range(8, 17);
    roofProps.push({
      x: rng.range(6, Math.max(7, w - propW - 6)),
      y: rng.range(6, Math.max(7, h - propH - 6)),
      w: propW,
      h: propH,
      kind: rng.chance(0.5) ? 'unit' : rng.chance(0.5) ? 'vent' : 'tank',
    });
  }
  const words = SIGN_WORDS[district.kind];
  let sign = null;
  let billboard = null;
  const signChance = district.kind === 'strip' ? 0.86 : district.kind === 'downtown' ? 0.62 : district.kind === 'market' ? 0.46 : 0.2;
  if (rng.chance(signChance)) {
    sign = {
      text: rng.pick(words),
      color: rng.pick(NEON),
      vertical: rng.chance(0.34),
      phase: rng.range(0, Math.PI * 2),
      flicker: rng.chance(0.25),
    };
  }
  if ((district.kind === 'downtown' || district.kind === 'strip') && height > 56 && rng.chance(0.32)) {
    billboard = { text: rng.pick(words), color: rng.pick(NEON), phase: rng.range(0, Math.PI * 2) };
  }
  return {
    x: lot.x + insetX,
    y: lot.y + insetY,
    w,
    h,
    height,
    elevation,
    tone: rng.pick(tones),
    roof: rng.pick(['#1c2330', '#20232c', '#232027', '#1a2028']),
    district: district.kind,
    windowsSouth: windowGrid(rng, w, elevation),
    windowsEast: windowGrid(rng, h, elevation),
    roofProps,
    sign,
    billboard,
  };
}

function addTree(rng, props, x, y, scale = 1) {
  props.push({ type: 'tree', x, y, size: rng.range(7, 13) * scale, tint: rng.chance(0.5) ? 0 : 1 });
}

function fillPark(rng, block, props) {
  const cx = block.x + block.w / 2;
  const cy = block.y + block.h / 2;
  const count = rng.int(7, 11);
  for (let index = 0; index < count; index += 1) {
    const x = block.x + rng.range(30, block.w - 30);
    const y = block.y + rng.range(30, block.h - 30);
    if (Math.abs(x - cx) < 32 && Math.abs(y - cy) < 32) continue;
    addTree(rng, props, x, y, rng.range(0.8, 1.35));
  }
  if (rng.chance(0.6)) props.push({ type: 'pond', x: cx + rng.range(-40, 40), y: cy + rng.range(-35, 35), rx: rng.range(18, 34), ry: rng.range(12, 22) });
  props.push({ type: 'bench', x: cx - 36, y: cy - 10, angle: 0 });
  props.push({ type: 'bench', x: cx + 36, y: cy + 10, angle: Math.PI });
}

function fillSquare(rng, block, props, district) {
  const count = rng.int(3, 6);
  for (let index = 0; index < count; index += 1) {
    const edge = index % 4;
    const t = rng.range(0.2, 0.8);
    const x = edge === 0 || edge === 2 ? block.x + block.w * t : block.x + (edge === 1 ? block.w - 28 : 28);
    const y = edge === 0 || edge === 2 ? block.y + (edge === 0 ? 30 : block.h - 30) : block.y + block.h * t;
    props.push({ type: 'stall', x, y, w: 26, h: 18, angle: edge % 2 ? Math.PI / 2 : 0, color: rng.pick(['#8b3e3e', '#3e6b5a', '#8b743e', '#4a4f8b']) });
  }
  props.push({ type: 'string', x1: block.x + 30, y1: block.y + block.h / 2, x2: block.x + block.w - 30, y2: block.y + block.h / 2, color: PALETTE.neonAmber });
  addTree(rng, props, block.x + 38, block.y + 38, 0.9);
  addTree(rng, props, block.x + block.w - 40, block.y + block.h - 42, 0.9);
}

function fillPlaza(rng, block, props) {
  props.push({ type: 'fountain', x: block.x + block.w / 2, y: block.y + block.h / 2, r: rng.range(18, 26) });
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2 + 0.4;
    props.push({ type: 'bench', x: block.x + block.w / 2 + Math.cos(angle) * 66, y: block.y + block.h / 2 + Math.sin(angle) * 60, angle });
    addTree(rng, props, block.x + block.w / 2 + Math.cos(angle + 1) * 82, block.y + block.h / 2 + Math.sin(angle + 1) * 78, 0.95);
  }
}

function fillYard(rng, block, props, district) {
  const palette = district.kind === 'docks'
    ? ['#2d3b40', '#4a3a2a', '#2c4034', '#5a3a30', '#37424a']
    : ['#4a3a2a', '#2c4034', '#5a3a30', '#37424a', '#3d3a2a'];
  const count = rng.int(4, 8);
  for (let index = 0; index < count; index += 1) {
    const w = rng.range(30, 58);
    const h = rng.range(16, 24);
    const x = block.x + rng.range(26, block.w - w - 26);
    const y = block.y + rng.range(26, block.h - h - 26);
    props.push({ type: 'container', x, y, w, h, angle: rng.chance(0.5) ? 0 : Math.PI / 2, color: rng.pick(palette) });
  }
  for (let index = 0; index < 5; index += 1) {
    props.push({ type: 'crate', x: block.x + rng.range(30, block.w - 34), y: block.y + rng.range(30, block.h - 34), size: rng.range(6, 11), angle: rng.range(0, Math.PI) });
  }
  props.push({ type: 'dumpster', x: block.x + rng.range(30, block.w - 40), y: block.y + rng.range(30, block.h - 34), angle: rng.range(0, Math.PI * 2) });
}

export function generateCity(seed) {
  const rng = createRandom(seed);
  const blocks = [];
  const buildings = [];
  const props = [];
  const lamps = [];
  const signs = [];
  const strings = [];

  for (let r = 0; r < CITY.rows; r += 1) {
    for (let c = 0; c < CITY.cols; c += 1) {
      const x = CITY_SIZE.blockOrigin(c);
      const y = CITY_SIZE.blockOrigin(r);
      const districtIndex = districtOfBlock(c, r);
      const district = DISTRICTS[districtIndex];
      const block = {
        c, r, x, y, w: CITY.block, h: CITY.block,
        district: districtIndex,
        kind: district.kind,
        type: 'city',
        buildings: [],
        props: [],
      };
      const forced = { '1,2': 'park', '6,2': 'park', '3,4': 'plaza', '1,4': 'square', '5,5': 'yard', '2,6': 'yard', '6,6': 'yard' }[`${c},${r}`];
      if (forced) block.type = forced;
      else {
        const roll = rng();
        if (district.kind === 'resi') block.type = roll < 0.22 ? 'park' : roll < 0.32 ? 'plaza' : 'city';
        else if (district.kind === 'downtown') block.type = roll < 0.14 ? 'plaza' : 'city';
        else if (district.kind === 'market') block.type = roll < 0.2 ? 'square' : 'city';
        else if (district.kind === 'industry') block.type = roll < 0.2 ? 'yard' : 'city';
        else if (district.kind === 'docks') block.type = roll < 0.28 ? 'yard' : 'city';
        else block.type = roll < 0.1 ? 'plaza' : 'city';
      }

      if (block.type === 'city') {
        const inner = { x: x + CITY.sidewalk + 8, y: y + CITY.sidewalk + 8, w: CITY.block - (CITY.sidewalk + 8) * 2, h: CITY.block - (CITY.sidewalk + 8) * 2 };
        const lots = splitLots(rng, inner, rng.chance(0.45) ? 2 : 1);
        for (const lot of lots) {
          if (rng.chance(0.14)) {
            block.props.push({ type: 'parking', x: lot.x, y: lot.y, w: lot.w, h: lot.h });
            continue;
          }
          const building = makeBuilding(rng, lot, district);
          if (!building) continue;
          building.block = `${c},${r}`;
          block.buildings.push(building);
          buildings.push(building);
          if (building.sign) signs.push({ building, sign: building.sign });
        }
      } else if (block.type === 'park') fillPark(rng, block, block.props);
      else if (block.type === 'square') fillSquare(rng, block, block.props, district);
      else if (block.type === 'plaza') fillPlaza(rng, block, block.props);
      else if (block.type === 'yard') fillYard(rng, block, block.props, district);
      blocks.push(block);
      for (const prop of block.props) props.push(prop);
    }
  }

  // Overhead string lights across the Lantern Strip's main drag, and a few extra neon tubes.
  const stripY = CITY_SIZE.node(4);
  for (let index = 0; index < 7; index += 1) {
    const x = CITY_SIZE.node(2) + index * 118;
    strings.push({ x, y: stripY, length: 104, color: index % 2 ? PALETTE.neonPink : PALETTE.neonCyan });
  }

  // Street lamps at intersections: two at each corner box, warm sodium with a cold one in the Strip.
  for (let i = 0; i <= CITY.cols; i += 1) {
    for (let j = 0; j <= CITY.rows; j += 1) {
      const nx = CITY_SIZE.node(i);
      const ny = CITY_SIZE.node(j);
      const strip = j === 4 && i > 1 && i < 7;
      const color = strip ? (i % 2 ? PALETTE.neonPink : PALETTE.neonCyan) : PALETTE.sodium;
      const onRingRow = j === 0 || j === CITY.rows;
      if (rng.chance(0.72)) lamps.push({ x: nx - 48, y: ny - 48, color, radius: strip ? 132 : 118 });
      if (rng.chance(0.72)) lamps.push({ x: nx + 48, y: ny + 48, color, radius: strip ? 132 : 118 });
      if (onRingRow && rng.chance(0.35)) lamps.push({ x: nx + 48, y: ny - 48, color, radius: 110 });
    }
  }

  // Mid-block lamps on the longer streets: the pools that make a road read at speed.
  for (let i = 0; i <= CITY.cols; i += 1) {
    for (let j = 0; j < CITY.rows; j += 1) {
      if (!rng.chance(0.5)) continue;
      lamps.push({
        x: CITY_SIZE.node(i) + 46,
        y: CITY_SIZE.node(j) + CITY.cell / 2,
        color: PALETTE.sodium,
        radius: 104,
      });
    }
  }
  for (let j = 0; j <= CITY.rows; j += 1) {
    for (let i = 0; i < CITY.cols; i += 1) {
      if (!rng.chance(0.5)) continue;
      lamps.push({
        x: CITY_SIZE.node(i) + CITY.cell / 2,
        y: CITY_SIZE.node(j) - 46,
        color: PALETTE.sodium,
        radius: 104,
      });
    }
  }

  // The docks: a working quay south of the last road with containers, cranes and bollards.
  const quayY = CITY_SIZE.quayTop;
  const quayProps = [];
  for (let index = 0; index < 9; index += 1) {
    quayProps.push({
      type: 'container',
      x: 360 + index * 280 + rng.range(-40, 40),
      y: quayY + 18 + (index % 2) * 38,
      w: rng.range(42, 70),
      h: rng.range(18, 26),
      angle: index % 3 === 0 ? Math.PI / 2 : 0,
      color: rng.pick(['#2d3b40', '#4a3a2a', '#2c4034', '#5a3a30', '#37424a']),
    });
  }
  quayProps.push({ type: 'crane', x: 520, y: quayY + 42, angle: 0.2 });
  quayProps.push({ type: 'crane', x: 1320, y: quayY + 44, angle: -0.22 });
  quayProps.push({ type: 'crane', x: 1710, y: quayY + 40, angle: -0.35 });
  quayProps.push({ type: 'crane', x: 2660, y: quayY + 44, angle: 0.1 });
  for (let index = 0; index < 12; index += 1) {
    quayProps.push({ type: 'bollard', x: 300 + index * 220, y: quayY + 92 });
  }
  // The Kettle terminal shed, right of the story's terminal marker.
  quayProps.push({ type: 'terminal', x: CITY_SIZE.blockCentre(2) + 10, y: quayY + 42, w: 176, h: 52 });
  props.push(...quayProps);

  // Two rusted freighters ride at anchor in the black water, their decks lit.
  props.push({ type: 'ship', x: 1040, y: 3140, w: 250, h: 58, angle: 0, color: '#202b34' });
  props.push({ type: 'ship', x: 2380, y: 3205, w: 190, h: 46, angle: Math.PI, color: '#1b252d' });
  props.push({ type: 'ship', x: 1580, y: 3168, w: 300, h: 62, angle: 0.03, color: '#27343e' });
  props.push({ type: 'barge', x: 1970, y: 3078, w: 112, h: 36, angle: 0.08, color: '#33424a' });
  props.push({ type: 'boat', x: 580, y: 3092, w: 46, h: 14, angle: 0.16, color: '#2a3b45' });
  props.push({ type: 'boat', x: 1450, y: 3098, w: 62, h: 18, angle: -0.08, color: '#31424a' });
  props.push({ type: 'boat', x: 1830, y: 3230, w: 38, h: 12, angle: 0.4, color: '#273841' });

  // Ring-road lamps: a warm line along the quay and the northern edge, so the ring reads at night.
  for (let x = 340; x < CITY_SIZE.width - 180; x += 168) {
    lamps.push({ x, y: CITY_SIZE.quayTop + 2, color: PALETTE.sodium, radius: 126 });
    lamps.push({ x: x + 70, y: CITY_SIZE.node(0) - 64, color: PALETTE.sodium, radius: 118 });
  }

  const piers = [
    { x: 690, y: CITY_SIZE.waterTop, w: 34, h: 96 },
    { x: 1580, y: CITY_SIZE.waterTop, w: 28, h: 84 },
    { x: 2470, y: CITY_SIZE.waterTop, w: 38, h: 106 },
  ];

  const city = {
    seed,
    blocks,
    buildings,
    props,
    lamps,
    signs,
    strings,
    piers,
    nodes: CITY.cols + 1,
    nodeX: (i) => CITY_SIZE.node(i),
    nodeY: (j) => CITY_SIZE.node(j),
    bounds: { minX: 26, maxX: CITY_SIZE.width - 26, minY: 26, maxY: CITY_SIZE.waterTop - 10 },
    quayTop: CITY_SIZE.quayTop,
    waterTop: CITY_SIZE.waterTop,
    solidGrid: new Map(),
    spots: {},
    anchor: null,
    hospital: null,
    bar: null,
    districtAt: null,
    blockAt: null,
    solidAt: null,
    circleSolid: null,
  };

  // Named places. All coordinates sit on sidewalks or the quay, never inside a building.
  const bx = (c) => CITY_SIZE.blockOrigin(c);
  const mid = (i) => CITY_SIZE.blockCentre(i);
  city.spots = {
    anchor: { x: bx(4) + 9, y: mid(4), label: 'The Anchor' },
    start: { x: bx(4) + 9, y: mid(4) + 92, label: 'The Anchor' },
    docksPier: { x: mid(1) + 26, y: quayY + 54, label: 'Pier Nine' },
    saltVan: { x: mid(1), y: bx(3) - 9, label: 'Saltmarket' },
    foundryBay: { x: mid(6), y: bx(5) - 9, label: 'Foundry loading bay' },
    stripGarage: { x: mid(5), y: bx(3) + CITY.block + 9, label: 'The Strip garage' },
    impound: { x: bx(6) + CITY.block + 9, y: mid(2), label: 'Harbour Patrol impound' },
    terminal: { x: mid(2) - 20, y: quayY + 70, label: 'Kettle terminal' },
    northBridge: { x: mid(4), y: CITY_SIZE.node(0) - 24, label: 'North ring' },
    hospital: { x: bx(2) + 9, y: mid(3), label: "St. Orra's" },
  };
  city.anchor = { ...city.spots.anchor, color: PALETTE.neonPink };
  city.hospital = { ...city.spots.hospital, color: '#ff5a66' };
  city.bar = { x: bx(4) + 2, y: mid(4), color: PALETTE.neonPink };

  city.districtAt = (x, y) => {
    const block = city.blockAt(x, y);
    if (block) return block.district;
    const c = Math.min(CITY.cols - 1, Math.max(0, Math.floor((x - bx(0)) / CITY.cell)));
    const r = Math.min(CITY.rows - 1, Math.max(0, Math.floor((y - bx(0)) / CITY.cell)));
    return districtOfBlock(c, r);
  };
  city.blockAt = (x, y) => {
    const c = Math.floor((x - bx(0)) / CITY.cell);
    const r = Math.floor((y - bx(0)) / CITY.cell);
    if (c < 0 || r < 0 || c >= CITY.cols || r >= CITY.rows) return null;
    const block = blocks[r * CITY.cols + c];
    if (x < block.x || x > block.x + block.w || y < block.y || y > block.y + block.h) return null;
    return block;
  };

  // A coarse grid of solid building cells so collision checks only test nearby footprints.
  for (const building of buildings) {
    const gx0 = Math.floor(building.x / SOLID_CELL);
    const gy0 = Math.floor(building.y / SOLID_CELL);
    const gx1 = Math.floor((building.x + building.w) / SOLID_CELL);
    const gy1 = Math.floor((building.y + building.h) / SOLID_CELL);
    for (let gx = gx0; gx <= gx1; gx += 1) {
      for (let gy = gy0; gy <= gy1; gy += 1) {
        const key = gx * 1000 + gy;
        let list = city.solidGrid.get(key);
        if (!list) {
          list = [];
          city.solidGrid.set(key, list);
        }
        list.push(building);
      }
    }
  }

  city.solidAt = (x, y) => {
    const key = Math.floor(x / SOLID_CELL) * 1000 + Math.floor(y / SOLID_CELL);
    const list = city.solidGrid.get(key);
    if (!list) return null;
    for (const b of list) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    return null;
  };

  city.circleSolid = (x, y, radius) => {
    const gx0 = Math.floor((x - radius) / SOLID_CELL);
    const gx1 = Math.floor((x + radius) / SOLID_CELL);
    const gy0 = Math.floor((y - radius) / SOLID_CELL);
    const gy1 = Math.floor((y + radius) / SOLID_CELL);
    for (let gx = gx0; gx <= gx1; gx += 1) {
      for (let gy = gy0; gy <= gy1; gy += 1) {
        const list = city.solidGrid.get(gx * 1000 + gy);
        if (!list) continue;
        for (const b of list) {
          if (x + radius > b.x && x - radius < b.x + b.w && y + radius > b.y && y - radius < b.y + b.h) return b;
        }
      }
    }
    return null;
  };

  return city;
}

export function districtOfBlock(c, r) {
  const cx = c < 3 ? 0 : c < 6 ? 1 : 2;
  const cy = r < 3 ? 0 : r < 6 ? 1 : 2;
  return cy * 3 + cx;
}

/** A random point on a block's sidewalk ring, for spawning people and parked cars. */
export function sidewalkPoint(city, rng, block) {
  const inset = 9;
  const x = block.x + inset;
  const y = block.y + inset;
  const w = block.w - inset * 2;
  const h = block.h - inset * 2;
  const side = rng.int(0, 3);
  if (side === 0) return { x: x + rng.range(0, w), y };
  if (side === 1) return { x: x + w, y: y + rng.range(0, h) };
  if (side === 2) return { x: x + rng.range(0, w), y: y + h };
  return { x, y: y + rng.range(0, h) };
}

/** Points rounding one block's sidewalk, the loop a pedestrian follows. */
export function blockLoop(city, block, inset = 10) {
  const x = block.x + inset;
  const y = block.y + inset;
  const w = block.w - inset * 2;
  const h = block.h - inset * 2;
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}


