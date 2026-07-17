// Falling sand.
//
// The canvas is a grid of cells and each cell holds one material plus a
// temperature in kelvin. Every frame we walk the grid from the bottom up and
// let each cell try to move: powders fall and pile, liquids pool, gases rise.
// Heat conducts between neighbours and everything radiates toward the world's
// ambient temperature, so fire is just a very hot cell, ice is water below
// 273 K, and lava is rock that has not cooled down yet.
//
// Gravity is a setting. Down is the normal sandbox. Mutual computes a coarse
// gravity field from the mass on screen and pulls everything toward
// everything, which is enough to collapse a hydrogen cloud until compression
// heats the core past ignition and a star lights.

const canvas = document.getElementById('sim');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

// Material ids, kept as small ints so the grid can be a plain typed array.
const EMPTY  = 0;
const SAND   = 1;
const WATER  = 2;
const STONE  = 3;
const WOOD   = 4;
const FIRE   = 5;
const OIL    = 6;
const PLANT  = 7;
const SMOKE  = 8;
const STEAM  = 9;
const DIRT   = 10;
const SEED   = 11;
const GLASS  = 12;
const SHARD  = 13;
const BOULDER = 14;
const METAL  = 15;
const RUST   = 16;
const MOLTEN = 17;
const LAVA   = 18;
const GUNPOWDER = 19;
const TNT    = 20;
const NITRO  = 21;
const BLACKHOLE = 22;
const ASH    = 23;
const ICE    = 24;
const HYDROGEN = 25;
const HELIUM = 26;
const CARBON = 27;
const URANIUM = 28;
const STARDUST = 29;
const PLASMA = 30;
const C4     = 31;
const FIREWORK = 32;
const SPARK  = 33;
const THERMITE = 34;

// Pseudo materials for the brush only; they never land in the grid.
const TOOL_HEAT = 250;
const TOOL_COOL = 251;

// Rough density per material. Negative wants to rise. A moving cell can push
// into a neighbour that is empty or a fluid it outweighs, which is enough to
// get sand sinking through water and oil floating on top of it.
const DENSITY = {
  [EMPTY]:  0,
  [SMOKE]: -3,
  [HELIUM]: -4,
  [HYDROGEN]: -3,
  [STEAM]: -2,
  [FIRE]:  -1,
  [SPARK]: -1,
  [OIL]:    3,
  [NITRO]:  4,
  [WATER]:  5,
  [STARDUST]: 7,
  [CARBON]: 8,
  [SHARD]:  9,
  [ASH]:    9,
  [THERMITE]: 9,
  [SAND]:  10,
  [DIRT]:  10,
  [SEED]:  10,
  [RUST]:  10,
  [GUNPOWDER]: 11,
  [LAVA]:  15,
  [URANIUM]: 18,
  [MOLTEN]: 20,
  [BOULDER]: 60,
  [PLANT]: 90,
  [WOOD]:  99,
  [STONE]: 99,
  [GLASS]: 99,
  [METAL]: 99,
  [TNT]:   99,
  [C4]:    99,
  [ICE]:   99,
  [FIREWORK]: 99,
  [PLASMA]: 99,
  [BLACKHOLE]: 99,
};

const COLORS = {
  [EMPTY]: [18, 18, 24],
  [SAND]:  [201, 178, 122],
  [WATER]: [50, 118, 214],
  [STONE]: [122, 122, 132],
  [WOOD]:  [120, 82, 45],
  [FIRE]:  [232, 120, 40],
  [OIL]:   [86, 74, 54],
  [PLANT]: [70, 168, 76],
  [SMOKE]: [78, 78, 86],
  [STEAM]: [196, 202, 214],
  [DIRT]:  [124, 86, 52],
  [SEED]:  [186, 172, 92],
  [GLASS]: [168, 200, 210],
  [SHARD]: [196, 216, 226],
  [BOULDER]: [96, 92, 84],
  [METAL]: [140, 144, 152],
  [RUST]:  [146, 82, 44],
  [MOLTEN]: [255, 150, 48],
  [LAVA]:  [207, 70, 26],
  [GUNPOWDER]: [54, 54, 58],
  [TNT]:   [178, 52, 44],
  [NITRO]: [180, 226, 170],
  [BLACKHOLE]: [26, 12, 36],
  [ASH]:   [120, 116, 110],
  [ICE]:   [170, 214, 232],
  [HYDROGEN]: [126, 148, 196],
  [HELIUM]: [196, 176, 140],
  [CARBON]: [46, 46, 50],
  [URANIUM]: [112, 176, 92],
  [STARDUST]: [172, 152, 190],
  [PLASMA]: [255, 240, 180],
  [C4]:    [222, 214, 180],
  [FIREWORK]: [196, 84, 64],
  [SPARK]: [255, 200, 120],
  [THERMITE]: [152, 140, 128],
};

// Spark burst colours, picked per firework and stored in aux.
const SPARK_HUES = [
  [255, 110, 90], [255, 210, 110], [120, 255, 140],
  [110, 220, 255], [200, 140, 255], [255, 255, 255],
];

// How readily heat moves through each material. Vacuum conducts nothing;
// what EMPTY does depends on the ambient setting (air on Earth, vacuum in
// space).
const CONDUCT = {
  [METAL]: 0.45, [MOLTEN]: 0.35, [PLASMA]: 0.4, [LAVA]: 0.3, [FIRE]: 0.3,
  [WATER]: 0.28, [ICE]: 0.25, [OIL]: 0.2, [NITRO]: 0.2, [STEAM]: 0.2,
  [URANIUM]: 0.2, [SPARK]: 0.2, [SMOKE]: 0.15, [HYDROGEN]: 0.15,
  [THERMITE]: 0.15, [SAND]: 0.12, [HELIUM]: 0.12, [DIRT]: 0.1, [RUST]: 0.1,
  [PLANT]: 0.1, [GUNPOWDER]: 0.1, [CARBON]: 0.1, [STARDUST]: 0.1,
  [ASH]: 0.08, [SHARD]: 0.08, [BOULDER]: 0.08, [STONE]: 0.06, [SEED]: 0.06,
  [GLASS]: 0.05, [WOOD]: 0.04, [TNT]: 0.05, [C4]: 0.05, [FIREWORK]: 0.05,
  [BLACKHOLE]: 0,
};

// What temperature a painted flame burns at. Low is a campfire, high is a
// torch that fuses sand and cuts metal.
const FIRE_TEMP = { 1: 800, 2: 1900, 3: 2600 };

// Chance per frame that open flame spreads into a neighbouring cell of this
// type. Heat can also ignite these on its own through IGNITE below.
const FLAMMABLE = {
  [WOOD]: 0.16,
  [OIL]:  0.6,
  [PLANT]: 0.25,
  [SEED]: 0.3,
  [GUNPOWDER]: 0.95,
  [CARBON]: 0.08,
};

// Auto-ignition temperatures in kelvin.
const IGNITE = {
  [WOOD]: 570, [OIL]: 500, [PLANT]: 520, [SEED]: 520,
  [GUNPOWDER]: 460, [CARBON]: 650,
};

// Palette shown in the side panel, grouped the way the buttons are laid out.
const MATERIALS = [
  { id: SAND,   name: 'Sand',   key: '1', group: 'Powders' },
  { id: DIRT,   name: 'Dirt',   key: '2', group: 'Powders' },
  { id: ASH,    name: 'Ash',    group: 'Powders' },
  { id: CARBON, name: 'Carbon', group: 'Powders' },
  { id: WATER,  name: 'Water',  key: '3', group: 'Liquids' },
  { id: OIL,    name: 'Oil',    key: '4', group: 'Liquids' },
  { id: LAVA,   name: 'Lava',   group: 'Liquids' },
  { id: MOLTEN, name: 'Molten metal', group: 'Liquids' },
  { id: NITRO,  name: 'Nitro',  group: 'Liquids' },
  { id: STONE,  name: 'Stone',  key: '8', group: 'Solids' },
  { id: WOOD,   name: 'Wood',   key: '7', group: 'Solids' },
  { id: METAL,  name: 'Metal',  group: 'Solids' },
  { id: GLASS,  name: 'Glass',  group: 'Solids' },
  { id: ICE,    name: 'Ice',    group: 'Solids' },
  { id: BOULDER, name: 'Boulder', group: 'Solids' },
  { id: SEED,   name: 'Seed',   key: '6', group: 'Life' },
  { id: PLANT,  name: 'Plant',  group: 'Life' },
  { id: SMOKE,  name: 'Smoke',  group: 'Life' },
  { id: FIRE,   name: 'Fire',   key: '5', group: 'Boom' },
  { id: GUNPOWDER, name: 'Gunpowder', group: 'Boom' },
  { id: TNT,    name: 'TNT',    key: '9', group: 'Boom' },
  { id: C4,     name: 'C4',     group: 'Boom' },
  { id: THERMITE, name: 'Thermite', group: 'Boom' },
  { id: FIREWORK, name: 'Firework', group: 'Boom' },
  { id: URANIUM, name: 'Uranium', group: 'Boom' },
  { id: STARDUST, name: 'Stardust', group: 'Space' },
  { id: HYDROGEN, name: 'Hydrogen', group: 'Space' },
  { id: HELIUM, name: 'Helium', group: 'Space' },
  { id: BLACKHOLE, name: 'Black hole', group: 'Space' },
  { id: TOOL_HEAT, name: 'Heat', group: 'Tools' },
  { id: TOOL_COOL, name: 'Cool', group: 'Tools' },
  { id: EMPTY,  name: 'Eraser', key: '0', group: 'Tools' },
];

const cells = new Uint8Array(W * H);
const life  = new Uint8Array(W * H); // burn timer, gas lifetime, fuses, flight
const aux   = new Uint8Array(W * H); // flame heat, dirt state, lit flag, hue
const temp  = new Float32Array(W * H); // kelvin
const moved = new Uint8Array(W * H); // stops a cell being moved twice per step
const tint  = new Int8Array(W * H);  // fixed per-pixel shade so surfaces are not flat

for (let i = 0; i < tint.length; i++) {
  tint[i] = (Math.random() * 24 - 12) | 0;
}

const image = ctx.createImageData(W, H);

let current = SAND;   // material the panel has selected
let fireHeat = 1;     // 1 low, 2 medium, 3 high; set by the flame heat chips
let ambientK = 293;   // what the world radiates toward; 0 is space
let gravityMode = 'down'; // 'down', 'zero', or 'mutual'
let gravityStrength = 1;
let viewHeat = false;
let brush = 3;
let paused = false;
let frame = 0;
let shake = 0;
let fireCount = 0;  // rough activity counts from the last step,
let emberCount = 0; // fed to the crackle ambience
let mouseCell = -1; // where the thermometer reads

temp.fill(ambientK);

// Explosions found during a step are queued and applied afterwards so a blast
// does not interfere with the scan that discovered it.
let blasts = [];
const holes = []; // black hole positions collected each frame

function isLiquid(t) { return t === WATER || t === OIL || t === LAVA || t === MOLTEN || t === NITRO; }
function isGas(t)    { return t === SMOKE || t === STEAM || t === HYDROGEN || t === HELIUM; }
function isFluid(t)  { return isLiquid(t) || isGas(t); }
function isStatic(t) { return DENSITY[t] >= 90 && t !== PLANT; }

// Loose stuff that gravity fields and black holes can drag around. Anchored
// solids resist the pull, though nothing survives touching a black hole.
function isLoose(t) {
  return t !== EMPTY && !isStatic(t) && t !== PLANT && t !== BLACKHOLE;
}

// Can a falling material drop into whatever sits at `target`?
function canSink(mover, target) {
  return target === EMPTY || (isFluid(target) && DENSITY[target] < DENSITY[mover]);
}

// Can a rising gas move up into `target`?
function canRise(gas, target) {
  return target === EMPTY || (isFluid(target) && DENSITY[target] > DENSITY[gas]);
}

function swap(a, b) {
  const c = cells[a]; cells[a] = cells[b]; cells[b] = c;
  const l = life[a];  life[a]  = life[b];  life[b]  = l;
  const x = aux[a];   aux[a]   = aux[b];   aux[b]   = x;
  const t = temp[a];  temp[a]  = temp[b];  temp[b]  = t;
  moved[a] = 1; moved[b] = 1;
}

// Spawn a fresh cell, at whatever temperature that material arrives at.
function set(i, type, heat) {
  morph(i, type, heat);
  if (type === FIRE)        temp[i] = FIRE_TEMP[aux[i]];
  else if (type === LAVA)   temp[i] = 1400;
  else if (type === MOLTEN) temp[i] = 1900;
  else if (type === PLASMA) temp[i] = 8000;
  else if (type === ICE)    temp[i] = Math.min(ambientK, 250);
  else if (type === STEAM)  temp[i] = 380;
  else                      temp[i] = ambientK;
}

// Change what a cell is without touching its temperature. Reactions use
// this; steam boiled off a quench should stay hot.
function morph(i, type, heat) {
  cells[i] = type;
  aux[i] = 0;
  if (type === FIRE) {
    aux[i] = heat || 1;
    // Hotter flames burn faster and shorter.
    life[i] = (aux[i] === 3 ? 35 : aux[i] === 2 ? 55 : 70) + (Math.random() * 30 | 0);
    temp[i] = Math.max(temp[i], FIRE_TEMP[aux[i]]);
  } else if (type === SMOKE) {
    life[i] = 180 + (Math.random() * 75 | 0);
  } else if (type === SPARK) {
    life[i] = 30 + (Math.random() * 25 | 0);
  } else if (type === PLASMA) {
    life[i] = 220 + (Math.random() * 35 | 0);
  } else {
    life[i] = 0;
  }
}

// --- heat ------------------------------------------------------------------

function condOf(i) {
  const t = cells[i];
  if (t === EMPTY) return ambientK < 20 ? 0 : 0.12; // vacuum does not conduct
  return CONDUCT[t] !== undefined ? CONDUCT[t] : 0.1;
}

// One diffusion pass plus radiation toward ambient. Runs every frame.
function flowHeat() {
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      const ki = condOf(i);
      if (ki === 0) continue;
      if (x + 1 < W) {
        const k = Math.min(ki, condOf(i + 1));
        if (k > 0) {
          const d = (temp[i + 1] - temp[i]) * k * 0.5;
          temp[i] += d; temp[i + 1] -= d;
        }
      }
      if (y + 1 < H) {
        const k = Math.min(ki, condOf(i + W));
        if (k > 0) {
          const d = (temp[i + W] - temp[i]) * k * 0.5;
          temp[i] += d; temp[i + W] -= d;
        }
      }
    }
  }
  for (let i = 0; i < temp.length; i++) {
    const t = cells[i];
    // Empty space snaps back to ambient quickly; matter radiates slowly.
    // Plasma keeps its own heat, that is the whole point of it.
    const r = t === EMPTY ? 0.08 : t === PLASMA ? 0 : 0.003;
    temp[i] += (ambientK - temp[i]) * r;
    if (temp[i] < 0) temp[i] = 0;
  }
}

// Temperature-driven changes of state. Returns true if the cell changed and
// should skip its movement update this frame.
function applyPhase(x, y, i) {
  const t = cells[i];
  const k = temp[i];
  switch (t) {
    case WATER:
      if (k > 373 && Math.random() < 0.3) { morph(i, STEAM); sound.sizzle(0.5); return true; }
      if (k < 273 && Math.random() < 0.05) { morph(i, ICE); return true; }
      return false;
    case ICE:
      if (k > 273 && Math.random() < 0.05) { morph(i, WATER); return true; }
      return false;
    case STEAM:
      if (k < 350 && Math.random() < 0.02) { morph(i, WATER); sound.drip(); return true; }
      return false;
    case METAL:
      if (k > 1800 && Math.random() < 0.2) { morph(i, MOLTEN); return true; }
      return false;
    case MOLTEN:
      if (k < 1300 && Math.random() < 0.1) { morph(i, METAL); return true; }
      return false;
    case LAVA:
      if (k < 900 && Math.random() < 0.08) { morph(i, STONE); return true; }
      return false;
    case STONE:
      if (k > 1900 && Math.random() < 0.02) { morph(i, LAVA); return true; }
      return false;
    case SAND:
      if (k > 1200 && Math.random() < 0.05) { morph(i, GLASS); return true; }
      return false;
    case STARDUST:
      // Squeezed and heated long enough, dust becomes rock. This is where
      // planet cores come from.
      if (k > 1300 && Math.random() < 0.05) { morph(i, LAVA); return true; }
      return false;
    case THERMITE:
      // Does not explode, it just starts its own private sun. The burn is
      // handled in updateThermite; this only strikes the match.
      if (k > 900 && aux[i] === 0) { aux[i] = 1; life[i] = 100 + (Math.random() * 50 | 0); }
      return false;
    case NITRO:
      if (k > 450) { morph(i, EMPTY); blasts.push({ x: x, y: y, r: 6 }); return true; }
      return false;
    case TNT:
      if (k > 600 && aux[i] === 0) { aux[i] = 1; life[i] = 20 + (Math.random() * 20 | 0); }
      return false;
    case URANIUM:
      if (k > 1500) { morph(i, EMPTY); blasts.push({ x: x, y: y, r: 22 }); return true; }
      return false;
    case HYDROGEN:
      // Hot enough and it fuses into plasma. That is how stars are born.
      if (k > 3000) { morph(i, PLASMA); return true; }
      // In an atmosphere it burns to water vapour with a thump; in vacuum
      // there is no oxygen, so it just gets hotter.
      if (k > 700 && ambientK > 100) { morph(i, STEAM); blasts.push({ x: x, y: y, r: 2 }); return true; }
      return false;
    default:
      if (IGNITE[t] && k > IGNITE[t]) {
        morph(i, FIRE, k > 2200 ? 3 : k > 1200 ? 2 : 1);
        return true;
      }
      return false;
  }
}

// --- movement ---------------------------------------------------------------

// Weightless drift for when there is no down. Loose matter wanders.
function drift(x, y, i) {
  if (Math.random() > 0.06) return;
  const [dx, dy] = NEIGHBORS[Math.random() * NEIGHBORS.length | 0];
  if (!inBounds(x + dx, y + dy)) return;
  const n = i + dy * W + dx;
  if (cells[n] === EMPTY) swap(i, n);
}

function updatePowder(x, y, i, type) {
  if (gravityMode !== 'down') { drift(x, y, i); return; }
  if (y + 1 >= H) { if (type === BOULDER) life[i] = 0; return; }
  const below = i + W;
  if (canSink(type, cells[below])) {
    // Boulders remember how long they have been falling so a landing can
    // count as an impact.
    if (type === BOULDER) life[i] = Math.min(life[i] + 1, 250);
    swap(i, below);
    return;
  }

  // Boulders fall straight down and punch through soft things instead of
  // sliding off to the side. Everything else behaves like a normal powder.
  if (type === BOULDER) {
    const t = cells[below];
    if (t === PLANT || t === SEED) { morph(below, EMPTY); swap(i, below); return; }
    if (life[i] >= 2) {
      sound.thud();
      if (t === GLASS) { shatter(x, y + 1); }
      if (t === NITRO) { morph(below, EMPTY); blasts.push({ x: x, y: y + 1, r: 6 }); }
    }
    life[i] = 0;
    return;
  }

  const dir = Math.random() < 0.5 ? -1 : 1;
  const slide = type === SHARD ? 0.35 : 1; // shards are jagged, they pile steep
  for (const dx of [dir, -dir]) {
    if (x + dx < 0 || x + dx >= W) continue;
    if (canSink(type, cells[below + dx]) && Math.random() < slide) {
      swap(i, below + dx);
      return;
    }
  }
}

function updateLiquid(x, y, i, type) {
  if (gravityMode !== 'down') { drift(x, y, i); return; }
  if (y + 1 < H) {
    const below = i + W;
    if (canSink(type, cells[below])) {
      // Only nitro cares how far it has fallen.
      if (type === NITRO) life[i] = Math.min(life[i] + 1, 250);
      swap(i, below);
      return;
    }

    const dir = Math.random() < 0.5 ? -1 : 1;
    for (const dx of [dir, -dir]) {
      if (x + dx < 0 || x + dx >= W) continue;
      if (canSink(type, cells[below + dx])) { swap(i, below + dx); return; }
    }
  }

  if (type === NITRO) {
    if (life[i] >= 3) {
      morph(i, EMPTY);
      blasts.push({ x: x, y: y, r: 6 });
      return;
    }
    life[i] = 0;
  }

  // Flow along the surface. Reach a few cells sideways so pools level out
  // quickly instead of crawling one pixel at a time.
  const dir = Math.random() < 0.5 ? -1 : 1;
  const reach = type === LAVA || type === MOLTEN ? 1 : 3; // hot stuff is sluggish
  for (const dx of [dir, -dir]) {
    let dest = -1;
    for (let s = 1; s <= reach; s++) {
      const nx = x + dx * s;
      if (nx < 0 || nx >= W || cells[i + dx * s] !== EMPTY) break;
      dest = i + dx * s;
    }
    if (dest !== -1) { swap(i, dest); return; }
  }
}

function updateGas(x, y, i, type) {
  // Smoke lives on a timer so plants get their chance to drink it. The other
  // gases hang around; steam condenses through the phase rules instead.
  if (type === SMOKE && (frame & 7) === 0 && --life[i] === 0) {
    morph(i, EMPTY);
    moved[i] = 1;
    return;
  }

  if (gravityMode !== 'down') { drift(x, y, i); return; }

  if (y - 1 >= 0) {
    const above = i - W;
    if (canRise(type, cells[above])) { swap(i, above); return; }

    const dir = Math.random() < 0.5 ? -1 : 1;
    for (const dx of [dir, -dir]) {
      if (x + dx < 0 || x + dx >= W) continue;
      if (canRise(type, cells[above + dx])) { swap(i, above + dx); return; }
    }
  }

  const dir = Math.random() < 0.5 ? -1 : 1;
  for (const dx of [dir, -dir]) {
    if (x + dx < 0 || x + dx >= W) continue;
    if (cells[i + dx] === EMPTY) { swap(i, i + dx); return; }
  }
}

const NEIGHBORS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

function inBounds(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }

// --- reactions ---------------------------------------------------------------

function updateFire(x, y, i) {
  const heat = aux[i] || 1;
  temp[i] = Math.max(temp[i], FIRE_TEMP[heat]);
  let nearWater = false;

  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    const t = cells[n];
    if (t === WATER) {
      nearWater = true;
    } else if (FLAMMABLE[t] && Math.random() < FLAMMABLE[t]) {
      morph(n, FIRE, heat);
      // Burning powder crackles.
      if (t === GUNPOWDER && Math.random() < 0.05) {
        blasts.push({ x: x + dx, y: y + dy, r: 3 });
      }
    } else if (t === THERMITE && aux[n] === 0 && Math.random() < 0.1) {
      // Open flame is enough to strike thermite; from there its own heat
      // carries the burn through the pile.
      aux[n] = 1;
      life[n] = 100 + (Math.random() * 50 | 0);
    }
  }

  // Water smothers the flame and one nearby drop flashes to steam.
  if (nearWater && Math.random() < 0.5) {
    sound.sizzle(0.6);
    morph(i, SMOKE);
    for (const [dx, dy] of NEIGHBORS) {
      if (!inBounds(x + dx, y + dy)) continue;
      const n = i + dy * W + dx;
      if (cells[n] === WATER) { morph(n, STEAM); break; }
    }
    moved[i] = 1;
    return;
  }

  if (--life[i] === 0) {
    // Most of a fire drifts off as smoke, but some of it is left as ash,
    // which is what feeds the soil half of the terrarium loop.
    const roll = Math.random();
    morph(i, roll < 0.35 ? SMOKE : roll < 0.45 ? ASH : EMPTY);
    moved[i] = 1;
    return;
  }

  // Flames lick upward into open air.
  if (gravityMode === 'down' && y - 1 >= 0 && cells[i - W] === EMPTY && Math.random() < 0.25) {
    swap(i, i - W);
  }
}

function updatePlant(x, y, i) {
  // Plants only do plant things in a survivable temperature band.
  const comfy = temp[i] > 275 && temp[i] < 325;

  // Breathe in nearby smoke. The carbon feeds the plant, so each breath adds
  // a little growth budget.
  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    if (cells[n] === SMOKE && Math.random() < 0.2) {
      morph(n, EMPTY);
      life[i] = Math.min(life[i] + 1, 40);
      break;
    }
  }

  if (!comfy) return;

  // Spend growth budget pushing the stalk upward.
  if (life[i] > 0 && y - 1 >= 0 && cells[i - W] === EMPTY && Math.random() < 0.15) {
    set(i - W, PLANT);
    life[i - W] = life[i] - 1;
    life[i] = 0;
    // The odd sideways leaf keeps them from being bare poles.
    const dx = Math.random() < 0.5 ? -1 : 1;
    if (inBounds(x + dx, y) && cells[i + dx] === EMPTY && Math.random() < 0.3) {
      set(i + dx, PLANT);
    }
    return;
  }

  // Vine slowly into adjacent water, like pondweed.
  if (Math.random() < 0.02) {
    const [dx, dy] = NEIGHBORS[Math.random() * NEIGHBORS.length | 0];
    if (!inBounds(x + dx, y + dy)) return;
    const n = i + dy * W + dx;
    if (cells[n] === WATER) set(n, PLANT);
  }
}

function updateSeed(x, y, i) {
  // Germinate when resting on soil that can support it, in weather that can.
  if (gravityMode === 'down' && y + 1 < H && temp[i] > 275 && temp[i] < 325) {
    const below = i + W;
    if (cells[below] === DIRT && aux[below] > 0 && Math.random() < 0.05) {
      const budget = aux[below] === 2 ? 14 : 8;
      morph(i, PLANT);
      life[i] = budget;
      sound.sprout();
      return;
    }
  }
  updatePowder(x, y, i, SEED);
}

function updateDirt(x, y, i) {
  // Soak up a touching water cell now and then. Ash on top enriches it.
  if (aux[i] === 0) {
    for (const [dx, dy] of NEIGHBORS) {
      if (!inBounds(x + dx, y + dy)) continue;
      const n = i + dy * W + dx;
      if (cells[n] === WATER && Math.random() < 0.03) {
        morph(n, EMPTY);
        aux[i] = 1;
        break;
      }
    }
  }
  if (aux[i] < 2 && y - 1 >= 0 && cells[i - W] === ASH && Math.random() < 0.05) {
    morph(i - W, EMPTY);
    aux[i] = 2;
  }
  const wet = aux[i];
  updatePowder(x, y, i, DIRT);
  if (cells[i] === DIRT && aux[i] === 0) aux[i] = wet;
}

function updateMetal(x, y, i) {
  // Standing water slowly eats cold metal. Everything thermal happens in the
  // heat pass now; this is just chemistry.
  if (temp[i] < 320 && Math.random() < 0.002) {
    for (const [dx, dy] of NEIGHBORS) {
      if (!inBounds(x + dx, y + dy)) continue;
      if (cells[i + dy * W + dx] === WATER && Math.random() < 0.35) {
        morph(i, RUST);
        return;
      }
    }
  }
}

function updateMolten(x, y, i) {
  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    const t = cells[n];
    if (FLAMMABLE[t] && Math.random() < 0.4) morph(n, FIRE, 2);
    else if (t === WATER && temp[i] > 1500) {
      // Quenched: the water flashes off and the heat pass does the rest.
      sound.sizzle(1);
      morph(n, STEAM);
      temp[i] -= 400;
    }
  }
  updateLiquid(x, y, i, MOLTEN);
}

function updateLava(x, y, i) {
  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    const t = cells[n];
    if (FLAMMABLE[t] && Math.random() < 0.4) morph(n, FIRE, 2);
    else if (t === WATER) {
      sound.sizzle(1);
      morph(n, STEAM);
      morph(i, STONE); // skins over where it meets water
      return;
    }
  }
  updateLiquid(x, y, i, LAVA);
}

function updateTnt(x, y, i) {
  if (aux[i] === 1) {
    // Fuse is lit.
    sound.fuse();
    if (--life[i] === 0) {
      morph(i, FIRE, 2);
      blasts.push({ x: x, y: y, r: 12 });
    }
    return;
  }
  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const t = cells[i + dy * W + dx];
    if (t === FIRE || t === LAVA || t === MOLTEN) {
      aux[i] = 1;
      life[i] = 20 + (Math.random() * 20 | 0);
      return;
    }
  }
}

function updateNitro(x, y, i) {
  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const t = cells[i + dy * W + dx];
    if (t === FIRE || t === LAVA || t === MOLTEN) {
      morph(i, EMPTY);
      blasts.push({ x: x, y: y, r: 6 });
      return;
    }
  }
  updateLiquid(x, y, i, NITRO);
}

function updateUranium(x, y, i) {
  // Radioactive decay keeps it warm to the touch. Push it past critical with
  // a blast or enough heat and applyPhase turns it into a very bad day.
  temp[i] += 0.4;
  updatePowder(x, y, i, URANIUM);
}

function updateThermite(x, y, i) {
  if (aux[i] === 1) {
    // Burning. No blast, just an absurd amount of local heat.
    temp[i] = 2600;
    if ((frame & 3) === 0 && --life[i] === 0) {
      morph(i, Math.random() < 0.5 ? MOLTEN : SMOKE);
      if (cells[i] === MOLTEN) temp[i] = 1900;
      return;
    }
    return;
  }
  updatePowder(x, y, i, THERMITE);
}

function updateFirework(x, y, i) {
  if (aux[i] === 0) {
    // Waiting for a light.
    for (const [dx, dy] of NEIGHBORS) {
      if (!inBounds(x + dx, y + dy)) continue;
      const t = cells[i + dy * W + dx];
      if (t === FIRE || t === LAVA || temp[i] > 400) {
        aux[i] = 1;
        life[i] = 26 + (Math.random() * 14 | 0);
        sound.whoosh();
        break;
      }
    }
    return;
  }

  // In flight. Climb until the timer runs out or something is in the way.
  const done = --life[i] === 0;
  const blockedUp = y - 2 < 0 || cells[i - W] !== EMPTY;
  if (done || blockedUp) {
    const hue = Math.random() * SPARK_HUES.length | 0;
    for (const [dx, dy] of NEIGHBORS) {
      for (let s = 1; s <= 4; s++) {
        if (!inBounds(x + dx * s, y + dy * s)) break;
        const n = i + dy * s * W + dx * s;
        if (cells[n] === EMPTY && Math.random() < 0.75) {
          morph(n, SPARK);
          aux[n] = hue;
        }
      }
    }
    morph(i, SPARK);
    aux[i] = hue;
    shake = Math.min(shake + 4, 24);
    sound.burst();
    return;
  }
  swap(i, i - W);
}

function updateSpark(x, y, i) {
  if ((frame & 1) === 0 && --life[i] === 0) {
    morph(i, EMPTY);
    moved[i] = 1;
    return;
  }
  // Sparks float down lazily, drifting as they go.
  if (gravityMode === 'down' && y + 1 < H && cells[i + W] === EMPTY && Math.random() < 0.3) {
    swap(i, i + W);
    return;
  }
  drift(x, y, i);
}

function updatePlasma(x, y, i) {
  temp[i] = Math.max(temp[i], 6000);
  let fed = false;

  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    if (cells[n] === HYDROGEN) {
      fed = true;
      // Fusion: hydrogen in, helium and heat out. Only some of the fuel
      // joins the star itself, so a cloud leaves a helium shell behind.
      if (Math.random() < 0.1) {
        morph(n, Math.random() < 0.35 ? PLASMA : HELIUM);
        temp[i] = Math.min(temp[i] + 500, 10000);
      }
    }
  }

  // Starlight: radiate to a couple of random nearby cells even through
  // vacuum, so a star warms its system the way conduction cannot.
  for (let k = 0; k < 2; k++) {
    const dx = (Math.random() * 17 | 0) - 8;
    const dy = (Math.random() * 17 | 0) - 8;
    if (!inBounds(x + dx, y + dy) || (dx === 0 && dy === 0)) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 > 64) continue;
    const n = i + dy * W + dx;
    if (cells[n] !== PLASMA) temp[n] = Math.min(temp[n] + 60 / d2 * (temp[i] / 6000), 5000);
  }

  // A star with no fuel left slowly gutters out into helium.
  if (!fed && (frame & 3) === 0 && --life[i] === 0) {
    morph(i, Math.random() < 0.5 ? HELIUM : EMPTY);
    return;
  }
  if (fed) life[i] = Math.min(life[i] + 2, 250);

  if (gravityMode !== 'down') drift(x, y, i);
}

// Turn a glass cell and its glassy neighbourhood into shards.
function shatter(cx, cy) {
  sound.shatter();
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!inBounds(cx + dx, cy + dy)) continue;
      const n = (cy + dy) * W + cx + dx;
      if (cells[n] === GLASS && Math.random() < 0.8) morph(n, SHARD);
    }
  }
}

function applyBlast(bx, by, r) {
  if (r <= 3) sound.pop(); else sound.boom(r);
  shake = Math.min(shake + r, 24);
  const r2 = r * r;
  const outer = Math.ceil(r * 1.4);
  for (let dy = -outer; dy <= outer; dy++) {
    for (let dx = -outer; dx <= outer; dx++) {
      const x = bx + dx, y = by + dy;
      if (!inBounds(x, y)) continue;
      const d2 = dx * dx + dy * dy;
      const i = y * W + x;
      const t = cells[i];
      if (t === BLACKHOLE) continue;

      // Glass shatters out to well past the fireball.
      if (t === GLASS && d2 <= r2 * 2) { morph(i, SHARD); continue; }
      if (d2 > r2) continue;

      const p = 1 - Math.sqrt(d2) / r;
      temp[i] = Math.min(temp[i] + 900 * p + 200, 6000);

      // Chain other explosives with a delay that grows with distance,
      // so a stack ripples instead of going up as one bang.
      if (t === TNT) {
        aux[i] = 1;
        life[i] = 4 + (Math.sqrt(d2) * 2 | 0) + (Math.random() * 6 | 0);
        continue;
      }
      if (t === NITRO) { morph(i, EMPTY); blasts.push({ x: x, y: y, r: 6 }); continue; }
      if (t === C4)    { morph(i, EMPTY); blasts.push({ x: x, y: y, r: 16 }); continue; }
      if (t === URANIUM) { morph(i, EMPTY); blasts.push({ x: x, y: y, r: 22 }); continue; }

      // Stone and metal only give way near the core.
      if ((t === STONE || t === METAL || t === ICE) && d2 > r2 * 0.12) continue;
      if (Math.random() < p * 0.9 + 0.1) {
        const roll = Math.random();
        morph(i, roll < 0.45 ? FIRE : roll < 0.7 ? SMOKE : EMPTY, 2);
      }
    }
  }
}

// Drag loose material toward each black hole and eat whatever touches it.
function feedBlackHoles() {
  const R = 14;
  for (const bh of holes) {
    const hx = bh.x, hy = bh.y;
    const hi = hy * W + hx;
    for (const [dx, dy] of NEIGHBORS) {
      if (!inBounds(hx + dx, hy + dy)) continue;
      const n = hi + dy * W + dx;
      if (cells[n] !== EMPTY && cells[n] !== BLACKHOLE) morph(n, EMPTY);
    }
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = hx + dx, y = hy + dy;
        if (!inBounds(x, y) || (dx === 0 && dy === 0)) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const i = y * W + x;
        if (!isLoose(cells[i])) continue;
        // Inside the accretion zone nothing escapes, loose or not falling.
        if (d2 <= 6) {
          if (Math.random() < 0.5) morph(i, EMPTY);
          continue;
        }
        if (Math.random() > 4 / Math.sqrt(d2 + 1)) continue;
        pullToward(i, x, y, hx, hy, d2 < 64 ? 2 : 1);
      }
    }
  }
}

// Step a cell up to `steps` cells toward a target point, sliding around
// obstacles when the diagonal is blocked.
function pullToward(i, x, y, tx, ty, steps) {
  let ci = i, cx = x, cy = y;
  for (let s = 0; s < steps; s++) {
    const sx = cx === tx ? 0 : cx > tx ? -1 : 1;
    const sy = cy === ty ? 0 : cy > ty ? -1 : 1;
    if (cells[ci + sy * W + sx] === EMPTY) { swap(ci, ci + sy * W + sx); ci += sy * W + sx; cx += sx; cy += sy; }
    else if (sx !== 0 && cells[ci + sx] === EMPTY) { swap(ci, ci + sx); ci += sx; cx += sx; }
    else if (sy !== 0 && cells[ci + sy * W] === EMPTY) { swap(ci, ci + sy * W); ci += sy * W; cy += sy; }
    else return false; // crowded: caller may turn this into compression heat
  }
  return true;
}

// --- mutual gravity -----------------------------------------------------------

// The gravity field is computed on a coarse grid: mass per block, then every
// block attracts every other block. Cheap enough to redo every few frames.
const CB = 8;
const CW = Math.ceil(W / CB);
const CH = Math.ceil(H / CB);
const massGrid = new Float32Array(CW * CH);
const fieldX = new Float32Array(CW * CH);
const fieldY = new Float32Array(CW * CH);

function massOf(t) {
  if (t === EMPTY) return 0;
  if (isGas(t)) return 0.3;
  return Math.abs(DENSITY[t]) || 1;
}

function rebuildField() {
  massGrid.fill(0);
  for (let y = 0; y < H; y++) {
    const by = (y / CB) | 0;
    for (let x = 0; x < W; x++) {
      const t = cells[y * W + x];
      if (t !== EMPTY) massGrid[by * CW + ((x / CB) | 0)] += massOf(t);
    }
  }
  for (let a = 0; a < CW * CH; a++) {
    const ax = a % CW, ay = (a / CW) | 0;
    let gx = 0, gy = 0;
    for (let b = 0; b < CW * CH; b++) {
      const m = massGrid[b];
      if (m === 0) continue;
      const dx = (b % CW) - ax;
      const dy = ((b / CW) | 0) - ay;
      const d2 = dx * dx + dy * dy;
      // Skip the near field. A clump's own mass would otherwise drown out
      // every distant pull and pin it in place; ignoring the closest blocks
      // makes the field mean "everything else", so objects can actually
      // travel while wide clouds still collapse on themselves.
      if (d2 <= 6) continue;
      const f = m / (d2 * Math.sqrt(d2));
      gx += f * dx;
      gy += f * dy;
    }
    fieldX[a] = gx;
    fieldY[a] = gy;
  }
}

function applyMutualGravity() {
  if ((frame & 3) === 0) rebuildField();
  const G = gravityStrength * 0.08;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isLoose(cells[i]) || moved[i]) continue;
      const b = ((y / CB) | 0) * CW + ((x / CB) | 0);
      const gx = fieldX[b], gy = fieldY[b];
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag === 0) continue;
      if (Math.random() > Math.min(0.9, mag * G)) continue;
      const tx = x + (gx / mag > 0.4 ? 1 : gx / mag < -0.4 ? -1 : 0);
      const ty = y + (gy / mag > 0.4 ? 1 : gy / mag < -0.4 ? -1 : 0);
      if (!pullToward(i, x, y, tx + (tx - x) * 8, ty + (ty - y) * 8, 1)) {
        // Nowhere to go: the squeeze turns into heat. This is what ignites
        // the core of a collapsing cloud. Liquids are incompressible, so a
        // settled molten planet stops heating and can crust over.
        if (!isLiquid(cells[i])) temp[i] += 4 * gravityStrength;
      }
    }
  }
}

// --- main loop -----------------------------------------------------------------

function step() {
  moved.fill(0);
  holes.length = 0;
  fireCount = 0;
  emberCount = 0;
  for (let y = H - 1; y >= 0; y--) {
    // Alternate scan direction each frame so piles stay roughly symmetric.
    const leftFirst = (frame & 1) === 0;
    for (let k = 0; k < W; k++) {
      const x = leftFirst ? k : W - 1 - k;
      const i = y * W + x;
      if (moved[i]) continue;
      if (cells[i] !== EMPTY && applyPhase(x, y, i)) continue;

      switch (cells[i]) {
        case SAND:
        case ASH:
        case RUST:
        case SHARD:
        case CARBON:
        case STARDUST:
        case GUNPOWDER:
        case BOULDER: updatePowder(x, y, i, cells[i]); break;
        case URANIUM: updateUranium(x, y, i); break;
        case THERMITE: updateThermite(x, y, i); break;
        case DIRT:  updateDirt(x, y, i); break;
        case SEED:  updateSeed(x, y, i); break;
        case WATER: updateLiquid(x, y, i, WATER); break;
        case OIL:   updateLiquid(x, y, i, OIL); break;
        case NITRO: updateNitro(x, y, i); break;
        case LAVA:  emberCount++; updateLava(x, y, i); break;
        case MOLTEN: emberCount++; updateMolten(x, y, i); break;
        case SMOKE: updateGas(x, y, i, SMOKE); break;
        case STEAM: updateGas(x, y, i, STEAM); break;
        case HYDROGEN: updateGas(x, y, i, HYDROGEN); break;
        case HELIUM: updateGas(x, y, i, HELIUM); break;
        case FIRE:  fireCount++; updateFire(x, y, i); break;
        case PLANT: updatePlant(x, y, i); break;
        case METAL: updateMetal(x, y, i); break;
        case TNT:   updateTnt(x, y, i); break;
        case FIREWORK: updateFirework(x, y, i); break;
        case SPARK: fireCount++; updateSpark(x, y, i); break;
        case PLASMA: emberCount += 4; updatePlasma(x, y, i); break;
        case BLACKHOLE: holes.push({ x: x, y: y }); break;
      }
    }
  }

  // Apply the explosions found during the scan. A blast can queue more
  // (nitro set off by tnt), and those go off next frame, which reads as a
  // ripple rather than one instant crater.
  const queued = blasts;
  blasts = [];
  for (const b of queued) applyBlast(b.x, b.y, b.r);
  feedBlackHoles();
  if (gravityMode === 'mutual') applyMutualGravity();
  flowHeat();
  frame++;
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

// Map a temperature to the heat view gradient: black through blue, red,
// orange, to white.
function heatColor(k) {
  const t = Math.min(k, 3000) / 3000;
  if (t < 0.1)  { const u = t / 0.1;  return [u * 16, u * 24, 16 + u * 80]; }
  if (t < 0.35) { const u = (t - 0.1) / 0.25;  return [16 + u * 112, 24 - u * 8, 96 - u * 64]; }
  if (t < 0.6)  { const u = (t - 0.35) / 0.25; return [128 + u * 127, 16 + u * 80, 32]; }
  if (t < 0.85) { const u = (t - 0.6) / 0.25;  return [255, 96 + u * 96, 32 + u * 32]; }
  const u = (t - 0.85) / 0.15; return [255, 192 + u * 63, 64 + u * 191];
}

function render() {
  const data = image.data;
  for (let i = 0; i < cells.length; i++) {
    const type = cells[i];
    let r, g, b;

    if (viewHeat) {
      const c = heatColor(temp[i]);
      r = c[0]; g = c[1]; b = c[2];
      if (type !== EMPTY) { r = clamp(r + 24); g = clamp(g + 24); b = clamp(b + 24); }
    } else if (type === FIRE) {
      const heat = aux[i] || 1;
      const glow = Math.min(life[i], 60) / 60;
      if (heat === 3) {
        r = 120 + (Math.random() * 60 | 0);
        g = 170 + (60 * glow | 0);
        b = 255;
      } else if (heat === 2) {
        r = 255;
        g = 190 + (50 * glow | 0);
        b = 80 + (Math.random() * 60 | 0);
      } else {
        r = 255;
        g = 90 + (150 * glow | 0);
        b = 20 + (Math.random() * 30 | 0);
      }
    } else if (type === METAL) {
      // Glow with temperature.
      const t = Math.max(0, Math.min(255, (temp[i] - 500) / 5));
      r = clamp(140 + t * 0.45 + tint[i]);
      g = clamp(144 + t * 0.12 + tint[i]);
      b = clamp(152 - t * 0.3 + tint[i]);
    } else if (type === MOLTEN || type === LAVA) {
      const c = COLORS[type];
      const f = (Math.random() * 40 | 0) - 10;
      r = clamp(c[0] + f); g = clamp(c[1] + f * 0.6); b = clamp(c[2]);
    } else if (type === PLASMA) {
      const f = Math.random() * 50 | 0;
      r = 255; g = clamp(220 + f); b = clamp(140 + f + tint[i]);
    } else if (type === SPARK) {
      const c = SPARK_HUES[aux[i] % SPARK_HUES.length];
      const fade = Math.min(life[i], 40) / 40;
      r = clamp(c[0] * fade); g = clamp(c[1] * fade); b = clamp(c[2] * fade);
    } else if (type === THERMITE && aux[i] === 1) {
      const f = Math.random() * 80 | 0;
      r = 255; g = clamp(200 + f); b = clamp(160 + f);
    } else if (type === TNT && aux[i] === 1 && (frame & 4)) {
      r = 255; g = 240; b = 200; // lit fuse flashing
    } else if (type === DIRT) {
      const c = COLORS[type];
      const dark = aux[i] === 2 ? 34 : aux[i] === 1 ? 22 : 0;
      r = clamp(c[0] - dark + tint[i]);
      g = clamp(c[1] - dark * 0.6 + tint[i]);
      b = clamp(c[2] - dark * 0.3 + tint[i]);
    } else if (type === BLACKHOLE) {
      const f = Math.random() * 14 | 0;
      r = 26 + f; g = 12; b = 36 + f;
    } else {
      const c = COLORS[type];
      const s = type === EMPTY ? 0 : tint[i];
      r = clamp(c[0] + s);
      g = clamp(c[1] + s);
      b = clamp(c[2] + s);
    }

    const p = i * 4;
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  if (shake > 0) {
    const s = shake * 0.3;
    canvas.style.transform = `translate(${(Math.random() - 0.5) * s}px, ${(Math.random() - 0.5) * s}px)`;
    shake--;
    if (shake === 0) canvas.style.transform = '';
  }
}

const thermoEl = document.getElementById('thermo');
let ticks = 0; // rAF frames, unlike `frame` this advances while paused

function loop() {
  if (!paused) {
    step();
    sound.ambience(fireCount, emberCount, holes.length);
  }
  render();
  if ((++ticks % 6) === 0 && mouseCell >= 0) {
    thermoEl.textContent = Math.round(temp[mouseCell]) + ' K at cursor';
  }
  requestAnimationFrame(loop);
}

function paintCircle(cx, cy, type) {
  // The heat and cool tools adjust temperature and place nothing.
  if (type === TOOL_HEAT || type === TOOL_COOL) {
    const d = type === TOOL_HEAT ? 60 : -60;
    const r = brush;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx + dx, y = cy + dy;
        if (!inBounds(x, y)) continue;
        const i = y * W + x;
        temp[i] = Math.max(0, Math.min(6000, temp[i] + d));
      }
    }
    return 1;
  }

  // A black hole is a single point, however big the brush is. One is plenty.
  if (type === BLACKHOLE) {
    if (inBounds(cx, cy) && cells[cy * W + cx] === EMPTY) {
      set(cy * W + cx, BLACKHOLE);
      return 1;
    }
    return 0;
  }
  const r = brush;
  let placed = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx, y = cy + dy;
      if (!inBounds(x, y)) continue;
      const i = y * W + x;
      // The brush only paints into open space; the eraser is the exception.
      // Fire has to reach fuel through the physics, not by replacing it.
      if (type !== EMPTY && cells[i] !== EMPTY) continue;
      if (type === FIRE && Math.random() < 0.4) continue; // scatter the sparks
      set(i, type, fireHeat);
      placed++;
    }
  }
  return placed;
}

// What a material sounds like coming off the brush.
function brushSound(type) {
  if (type === EMPTY) return 'erase';
  if (type === TOOL_HEAT || type === TOOL_COOL) return 'gas';
  if (isLiquid(type)) return 'liquid';
  if (isGas(type)) return 'gas';
  if (DENSITY[type] >= 90) return 'solid';
  return 'powder';
}

// --- input ---------------------------------------------------------------

let drawing = false;
let brushType = SAND;

function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width * W) | 0;
  const y = ((e.clientY - rect.top) / rect.height * H) | 0;
  return [x, y];
}

canvas.addEventListener('pointerdown', (e) => {
  sound.unlock(); // audio cannot start until the first real gesture
  drawing = true;
  brushType = e.button === 2 ? EMPTY : current; // right button erases
  const [x, y] = cellFromEvent(e);
  if (paintCircle(x, y, brushType) > 0) sound.paint(brushSound(brushType));
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  const [x, y] = cellFromEvent(e);
  if (inBounds(x, y)) mouseCell = y * W + x;
  if (!drawing) return;
  if (paintCircle(x, y, brushType) > 0) sound.paint(brushSound(brushType));
});

window.addEventListener('pointerup', () => { drawing = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- panel ---------------------------------------------------------------

const materialsEl = document.getElementById('materials');
const buttonsById = {};

function selectMaterial(id) {
  current = id;
  for (const key in buttonsById) {
    buttonsById[key].classList.toggle('active', Number(key) === id);
  }
}

const TOOL_COLORS = { [TOOL_HEAT]: [255, 120, 60], [TOOL_COOL]: [110, 190, 255] };

let lastGroup = null;
for (const m of MATERIALS) {
  if (m.group !== lastGroup) {
    const label = document.createElement('div');
    label.className = 'group-label';
    label.textContent = m.group;
    materialsEl.appendChild(label);
    lastGroup = m.group;
  }

  const btn = document.createElement('button');

  const sw = document.createElement('span');
  sw.className = 'swatch';
  const c = COLORS[m.id] || TOOL_COLORS[m.id];
  sw.style.background = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

  const label = document.createElement('span');
  label.textContent = m.key ? `${m.name} (${m.key})` : m.name;

  btn.append(sw, label);
  btn.addEventListener('click', () => selectMaterial(m.id));
  materialsEl.appendChild(btn);
  buttonsById[m.id] = btn;
}
selectMaterial(SAND);

// Small helper for the rows of setting chips.
function buildChips(id, options, initial, onPick) {
  const el = document.getElementById(id);
  const chips = [];
  for (const opt of options) {
    const chip = document.createElement('button');
    chip.textContent = opt.name;
    chip.addEventListener('click', () => {
      for (const c of chips) c.classList.toggle('active', c === chip);
      onPick(opt.value);
    });
    if (opt.value === initial) chip.classList.add('active');
    el.appendChild(chip);
    chips.push(chip);
  }
  return {
    pick: (value) => {
      for (let k = 0; k < options.length; k++) {
        chips[k].classList.toggle('active', options[k].value === value);
      }
      onPick(value);
    },
  };
}

const heatChips = buildChips('heat', [
  { name: 'Low', value: 1 }, { name: 'Medium', value: 2 }, { name: 'High', value: 3 },
], fireHeat, (v) => { fireHeat = v; });

const gravityChips = buildChips('gravity', [
  { name: 'Down', value: 'down' }, { name: 'Zero', value: 'zero' }, { name: 'Mutual', value: 'mutual' },
], gravityMode, (v) => { gravityMode = v; });

const ambientChips = buildChips('ambient', [
  { name: 'Space', value: 0 }, { name: 'Cold', value: 250 },
  { name: 'Earth', value: 293 }, { name: 'Hot', value: 330 },
], ambientK, (v) => { ambientK = v; });

// World presets bundle the two settings people actually mean.
buildChips('world', [
  { name: 'Earth', value: 'earth' }, { name: 'Space', value: 'space' },
], 'earth', (v) => {
  if (v === 'earth') { gravityChips.pick('down'); ambientChips.pick(293); }
  else { gravityChips.pick('mutual'); ambientChips.pick(0); }
});

const gravInput = document.getElementById('gravstrength');
gravityStrength = Number(gravInput.value);
gravInput.addEventListener('input', () => { gravityStrength = Number(gravInput.value); });

const brushInput = document.getElementById('brush');
brush = Number(brushInput.value);
brushInput.addEventListener('input', () => { brush = Number(brushInput.value); });

const pauseBtn = document.getElementById('pause');
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Play' : 'Pause';
});

document.getElementById('clear').addEventListener('click', () => {
  cells.fill(EMPTY);
  life.fill(0);
  aux.fill(0);
  temp.fill(ambientK);
  blasts = []; // a chain caught mid-cascade should not go off over a blank grid
  shake = 0;
});

const muteBtn = document.getElementById('mute');
muteBtn.textContent = sound.on() ? 'Sound: on' : 'Sound: off';
muteBtn.addEventListener('click', () => {
  muteBtn.textContent = sound.toggle() ? 'Sound: on' : 'Sound: off';
});

const viewBtn = document.getElementById('view');
viewBtn.addEventListener('click', () => {
  viewHeat = !viewHeat;
  viewBtn.textContent = viewHeat ? 'View: heat' : 'View: materials';
});

window.addEventListener('keydown', (e) => {
  const m = MATERIALS.find((x) => x.key === e.key);
  if (m) selectMaterial(m.id);
  if (e.key === ' ') { pauseBtn.click(); e.preventDefault(); }
});

loop();
