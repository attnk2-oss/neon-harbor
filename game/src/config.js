// NEON HARBOR — every tuning number, colour and name in one place.
// Port Kessel is laid out on a grid of blocks measured in world pixels: 8 by 8 blocks,
// 232 px each, split by 92 px roads, a ring road around the lot and harbour water below
// the south quay. Nothing here depends on the window size; the view is a fixed 1280x720.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step: 60 updates a second whatever the display does. */
export const STEP = 1 / 60;

export const SAVE_KEY = 'neon-harbor.save.v1';
export const SOUND_KEY = 'neon-harbor.sound.v1';

export const CITY = {
  cols: 8,
  rows: 8,
  margin: 220,
  road: 92,
  block: 232,
  cell: 324,
  sidewalk: 18,
  lane: 21,
  quay: 110,
  water: 110,
};

export const CITY_SIZE = {
  width: 3124,
  height: 3324,
  node: (index) => CITY.margin + CITY.road / 2 + index * CITY.cell,
  blockOrigin: (index) => CITY.margin + CITY.road + index * CITY.cell,
  blockCentre: (index) => CITY.margin + CITY.road + index * CITY.cell + CITY.block / 2,
  quayTop: 2904,
  waterTop: 3014,
};

/** Nine districts over the 8x8 grid, read row by row from the north-west. */
export const DISTRICTS = [
  { name: 'Rook Hill', kind: 'resi', accent: '#ff9d5c', tag: 'tenements and corner stores' },
  { name: 'Vesper Heights', kind: 'downtown', accent: '#7fdcff', tag: 'glass towers, empty at night' },
  { name: 'Gull Point', kind: 'resi', accent: '#9dffb0', tag: 'salt wind and shuttered guest houses' },
  { name: 'Saltmarket', kind: 'market', accent: '#ffd166', tag: 'fish, fruit, forged papers' },
  { name: 'Lantern Strip', kind: 'strip', accent: '#ff4f9a', tag: 'neon, rain, bad decisions' },
  { name: 'Foundry Ward', kind: 'industry', accent: '#ff8a5c', tag: 'smokestacks that never sleep' },
  { name: 'Kettle Docks', kind: 'docks', accent: '#5ce1e6', tag: 'containers and quiet cranes' },
  { name: 'Southlight', kind: 'resi', accent: '#c5a3ff', tag: 'laundromats and late buses' },
  { name: 'Marrow Yard', kind: 'industry', accent: '#b7ff6b', tag: 'scrap, wire and borrowed cars' },
];

export const PALETTE = {
  void: '#04060a',
  asphalt: '#0a0e15',
  asphaltLight: '#0d121b',
  asphaltEdge: '#111722',
  lane: '#8e98aa',
  laneDim: '#414b5c',
  curb: '#333c4d',
  sidewalk: '#161c27',
  sidewalkTop: '#1c2331',
  sidewalkLine: '#232b3a',
  blockGround: '#0f141e',
  lot: '#0d121b',
  park: '#12241c',
  parkLight: '#183228',
  water: '#050e15',
  waterMid: '#07202b',
  waterLight: '#0b3441',
  rail: '#2a3342',
  shadow: 'rgba(0,0,0,0.5)',
  neonPink: '#ff3d8b',
  neonCyan: '#35e6ff',
  neonAmber: '#ffb347',
  neonLime: '#7dffa8',
  neonViolet: '#a479ff',
  sodium: '#ffb35c',
  windowWarm: '#ffd9a0',
  windowCool: '#a9e9ff',
  windowDim: '#283244',
  headlight: '#fff0bf',
  taillight: '#ff4d5e',
  sirenRed: '#ff3b4d',
  sirenBlue: '#3b8bff',
  marker: '#ffd15c',
  text: '#e9eef7',
  muted: '#8b95a8',
  panel: 'rgba(9,13,20,0.84)',
  panelEdge: 'rgba(120,150,190,0.24)',
  health: '#ff5c6c',
  armour: '#59b7ff',
  money: '#7fe3a1',
  weapon: '#ffd48c',
  danger: '#ff6b57',
};

export const VEHICLES = {
  kestrel: { name: 'Kestrel', len: 48, wid: 21, maxSpeed: 430, accel: 470, turn: 2.9, grip: 7.2, hp: 120, fill: '#dfe7f2', roof: '#9fb0c6', kind: 'coupe' },
  cormorant: { name: 'Cormorant', len: 50, wid: 22, maxSpeed: 360, accel: 400, turn: 2.5, grip: 6.4, hp: 110, fill: '#b9c4d6', roof: '#7d8ba1', kind: 'sedan' },
  pike: { name: 'Pike', len: 54, wid: 23, maxSpeed: 340, accel: 380, turn: 2.4, grip: 5.8, hp: 135, fill: '#8e9aad', roof: '#5c687b', kind: 'pickup' },
  bream: { name: 'Bream', len: 60, wid: 24, maxSpeed: 300, accel: 330, turn: 2.2, grip: 5.2, hp: 170, fill: '#e6e0cf', roof: '#a99f88', kind: 'van' },
  tern: { name: 'Tern', len: 52, wid: 23, maxSpeed: 470, accel: 560, turn: 3.1, grip: 7.6, hp: 150, fill: '#eef3fa', roof: '#2f4d78', kind: 'cruiser', police: true },
};

export const TRAFFIC_KINDS = ['cormorant', 'pike', 'bream', 'kestrel'];
export const TRAFFIC_FILLS = ['#c9d3e2', '#7d8fa8', '#d8cdb8', '#8f4f57', '#47607a', '#b0b7c4', '#5a6f5e', '#c28b55', '#6b5a78'];
export const NEON = [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonAmber, PALETTE.neonLime, PALETTE.neonViolet];

export const PLAYER = {
  radius: 8,
  walk: 128,
  sprint: 220,
  accel: 980,
  friction: 9,
  maxHealth: 100,
  maxArmour: 100,
  fists: { range: 38, damage: 13, cooldown: 0.34 },
  pistol: { range: 620, damage: 27, cooldown: 0.19, speed: 940, spread: 0.035 },
  startMoney: 420,
  ammoStart: 36,
  respawn: 2.6,
  deathPenalty: 0.1,
};

export const POLICE = {
  footSpeed: 158,
  footHealth: 60,
  cruiserHealth: 150,
  sightRadius: 720,
  lostSightSeconds: 9,
  starCooldown: 7,
  maxCruisers: 5,
  shotCooldown: 0.85,
  bulletDamage: 9,
  ramSpeed: 380,
};

export const TRAFFIC = {
  count: 30,
  minSpeed: 130,
  maxSpeed: 200,
  followGap: 74,
  junctionGap: 96,
  turnRate: 2.6,
};

export const PEDS = { groups: 26, groupMin: 2, groupMax: 3, walk: 40, flee: 138, downTime: 2.2 };

export const CLOCK = { start: 23 * 60 + 38, secondsPerMinute: 2.4 };

export const WEAPONS = ['fists', 'pistol'];

export const STORY = {
  giver: 'MARROW',
  officer: 'SGT. OKONKWO',
  hero: 'VALE',
  city: 'PORT KESSEL',
  tagline: 'Every light on the waterfront owes somebody.',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
export const MONO = '"Cascadia Mono", "Consolas", "SFMono-Regular", monospace';

/** How much shake a hit of each kind adds, in pixels. */
export const SHAKE = { crash: 7, shot: 2.5, explosion: 14, ram: 9 };
