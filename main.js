// Falling sand.
//
// The canvas is a grid of cells and each cell holds one material. Every frame
// we walk the grid from the bottom up and let each cell try to move using a
// few simple rules: powders fall and pile, liquids fall and spread, gases
// rise. On top of that sits a layer of chemistry: fire eats fuel, hot enough
// fire turns sand to glass, metal conducts heat and melts, seeds sprout on
// wet dirt, plants breathe in smoke, and black holes eat everything.

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

// Rough density per material. Negative wants to rise. A moving cell can push
// into a neighbour that is empty or a fluid it outweighs, which is enough to
// get sand sinking through water and oil floating on top of it.
const DENSITY = {
  [EMPTY]:  0,
  [SMOKE]: -3,
  [STEAM]: -2,
  [FIRE]:  -1,
  [OIL]:    3,
  [NITRO]:  4,
  [WATER]:  5,
  [SHARD]:  9,
  [ASH]:    9,
  [SAND]:  10,
  [DIRT]:  10,
  [SEED]:  10,
  [RUST]:  10,
  [GUNPOWDER]: 11,
  [LAVA]:  15,
  [MOLTEN]: 20,
  [BOULDER]: 60,
  [PLANT]: 90,
  [WOOD]:  99,
  [STONE]: 99,
  [GLASS]: 99,
  [METAL]: 99,
  [TNT]:   99,
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
};

// Chance per frame that fire spreads into a neighbouring cell of this type.
const FLAMMABLE = {
  [WOOD]: 0.16,
  [OIL]:  0.6,
  [PLANT]: 0.25,
  [SEED]: 0.3,
  [GUNPOWDER]: 0.95,
};

// Palette shown in the side panel, grouped the way the buttons are laid out.
const MATERIALS = [
  { id: SAND,   name: 'Sand',   key: '1', group: 'Powders' },
  { id: DIRT,   name: 'Dirt',   key: '2', group: 'Powders' },
  { id: ASH,    name: 'Ash',    group: 'Powders' },
  { id: GUNPOWDER, name: 'Gunpowder', group: 'Powders' },
  { id: WATER,  name: 'Water',  key: '3', group: 'Liquids' },
  { id: OIL,    name: 'Oil',    key: '4', group: 'Liquids' },
  { id: LAVA,   name: 'Lava',   group: 'Liquids' },
  { id: MOLTEN, name: 'Molten metal', group: 'Liquids' },
  { id: NITRO,  name: 'Nitro',  group: 'Liquids' },
  { id: STONE,  name: 'Stone',  key: '8', group: 'Solids' },
  { id: WOOD,   name: 'Wood',   key: '7', group: 'Solids' },
  { id: METAL,  name: 'Metal',  group: 'Solids' },
  { id: GLASS,  name: 'Glass',  group: 'Solids' },
  { id: BOULDER, name: 'Boulder', group: 'Solids' },
  { id: SEED,   name: 'Seed',   key: '6', group: 'Life' },
  { id: PLANT,  name: 'Plant',  group: 'Life' },
  { id: SMOKE,  name: 'Smoke',  group: 'Life' },
  { id: FIRE,   name: 'Fire',   key: '5', group: 'Boom' },
  { id: TNT,    name: 'TNT',    key: '9', group: 'Boom' },
  { id: BLACKHOLE, name: 'Black hole', group: 'Exotic' },
  { id: EMPTY,  name: 'Eraser', key: '0', group: 'Exotic' },
];

const cells = new Uint8Array(W * H);
const life  = new Uint8Array(W * H); // burn timer, gas lifetime, fall streak, fuse
const aux   = new Uint8Array(W * H); // fire heat, metal temp, dirt state, lit flag
const moved = new Uint8Array(W * H); // stops a cell being moved twice per step
const tint  = new Int8Array(W * H);  // fixed per-pixel shade so surfaces are not flat

for (let i = 0; i < tint.length; i++) {
  tint[i] = (Math.random() * 24 - 12) | 0;
}

const image = ctx.createImageData(W, H);

let current = SAND;   // material the panel has selected
let fireHeat = 1;     // 1 low, 2 medium, 3 high; set by the flame heat chips
let brush = 3;
let paused = false;
let frame = 0;
let shake = 0;

// Explosions found during a step are queued and applied afterwards so a blast
// does not interfere with the scan that discovered it.
let blasts = [];
const holes = []; // black hole positions collected each frame

function isLiquid(t) { return t === WATER || t === OIL || t === LAVA || t === MOLTEN || t === NITRO; }
function isGas(t)    { return t === SMOKE || t === STEAM; }
function isFluid(t)  { return isLiquid(t) || isGas(t); }

// Loose stuff a black hole can drag toward itself. Anchored solids resist
// the pull, though nothing survives actually touching the hole.
function isLoose(t) {
  return t !== EMPTY && t !== STONE && t !== WOOD && t !== METAL && t !== GLASS &&
         t !== TNT && t !== PLANT && t !== BLACKHOLE;
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
  moved[a] = 1; moved[b] = 1;
}

function set(i, type, heat) {
  cells[i] = type;
  aux[i] = 0;
  if (type === FIRE) {
    aux[i] = heat || 1;
    // Hotter flames burn faster and shorter.
    life[i] = (aux[i] === 3 ? 35 : aux[i] === 2 ? 55 : 70) + (Math.random() * 30 | 0);
  } else if (type === SMOKE) {
    life[i] = 180 + (Math.random() * 75 | 0);
  } else if (type === STEAM) {
    life[i] = 120 + (Math.random() * 80 | 0);
  } else if (type === MOLTEN) {
    life[i] = 200 + (Math.random() * 55 | 0);
  } else {
    life[i] = 0;
  }
}

function updatePowder(x, y, i, type) {
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
    if (t === PLANT || t === SEED) { set(below, EMPTY); swap(i, below); return; }
    if (life[i] >= 2) {
      if (t === GLASS) { shatter(x, y + 1); }
      if (t === NITRO) { set(below, EMPTY); blasts.push({ x: x, y: y + 1, r: 6 }); }
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
  if (y + 1 < H) {
    const below = i + W;
    if (canSink(type, cells[below])) {
      // Only nitro cares how far it has fallen. Everything else uses life
      // for its own bookkeeping (molten metal cools on it), so leave it be.
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
      set(i, EMPTY);
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
  // Gases live on a timer instead of vanishing at random. Smoke hangs around
  // long enough for plants to drink it; steam cools back into water.
  if ((frame & 7) === 0 && --life[i] === 0) {
    cells[i] = (type === STEAM && Math.random() < 0.35) ? WATER : EMPTY;
    moved[i] = 1;
    return;
  }

  // Steam touching a cold ceiling condenses and drips.
  if (type === STEAM && y - 1 >= 0) {
    const up = cells[i - W];
    if ((up === STONE || up === GLASS || up === METAL) && Math.random() < 0.02) {
      set(i, WATER);
      return;
    }
  }

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

function updateFire(x, y, i) {
  const heat = aux[i] || 1;
  let nearWater = false;

  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    const t = cells[n];
    if (t === WATER) {
      nearWater = true;
    } else if (FLAMMABLE[t] && Math.random() < FLAMMABLE[t]) {
      set(n, FIRE, heat);
      // Burning powder crackles.
      if (t === GUNPOWDER && Math.random() < 0.05) {
        blasts.push({ x: x + dx, y: y + dy, r: 3 });
      }
    } else if (t === SAND && heat === 3 && Math.random() < 0.08) {
      set(n, GLASS); // hot enough flame fuses sand
    }
  }

  // Water smothers the flame and one nearby drop flashes to steam.
  if (nearWater && Math.random() < 0.5) {
    set(i, SMOKE);
    for (const [dx, dy] of NEIGHBORS) {
      if (!inBounds(x + dx, y + dy)) continue;
      const n = i + dy * W + dx;
      if (cells[n] === WATER) { set(n, STEAM); break; }
    }
    moved[i] = 1;
    return;
  }

  if (--life[i] === 0) {
    set(i, Math.random() < 0.35 ? SMOKE : EMPTY);
    moved[i] = 1;
    return;
  }

  // Flames lick upward into open air.
  if (y - 1 >= 0 && cells[i - W] === EMPTY && Math.random() < 0.25) {
    swap(i, i - W);
  }
}

function updatePlant(x, y, i) {
  // Breathe in nearby smoke. The carbon feeds the plant, so each breath adds
  // a little growth budget.
  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    if (cells[n] === SMOKE && Math.random() < 0.2) {
      set(n, EMPTY);
      life[i] = Math.min(life[i] + 1, 40);
      break;
    }
  }

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
  // Germinate when resting on soil that can support it. Wet dirt grows a
  // decent stalk, fertilised dirt a tall one, dry dirt nothing.
  if (y + 1 < H) {
    const below = i + W;
    if (cells[below] === DIRT && aux[below] > 0 && Math.random() < 0.05) {
      const budget = aux[below] === 2 ? 14 : 8;
      set(i, PLANT);
      life[i] = budget;
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
        set(n, EMPTY);
        aux[i] = 1;
        break;
      }
    }
  }
  if (aux[i] < 2 && y - 1 >= 0 && cells[i - W] === ASH && Math.random() < 0.05) {
    set(i - W, EMPTY);
    aux[i] = 2;
  }
  const wet = aux[i];
  updatePowder(x, y, i, DIRT);
  // updatePowder clears life but not aux; wetness rides along in the swap,
  // this just keeps it if the cell did not move.
  if (cells[i] === DIRT && aux[i] === 0) aux[i] = wet;
}

function updateMetal(x, y, i) {
  let t = aux[i]; // temperature, 0 cold to 255 melting

  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    const nt = cells[n];
    // Only medium flame and up can melt metal; a low flame is not a forge.
    // Hotter burns faster, and there is a visible glow phase either way.
    if (nt === FIRE) {
      const h = aux[n] || 1;
      if (h >= 2 && Math.random() < h / 6) t = Math.min(255, t + h);
    }
    if (nt === LAVA)   t = Math.min(255, t + 6);
    if (nt === MOLTEN) t = Math.min(255, t + 8);
    if (nt === WATER) {
      if (t > 150 && Math.random() < 0.3) set(n, STEAM); // quench hiss
      t = Math.max(0, t - 25);
      // Standing water slowly eats cold metal.
      if (t < 40 && Math.random() < 0.0008) { set(i, RUST); return; }
    }
    // Conduction: neighbouring metal drifts toward this cell's temperature.
    if (nt === METAL && aux[n] < t) aux[n] = Math.min(255, aux[n] + Math.ceil((t - aux[n]) / 8));
  }

  if (t > 2 && Math.random() < 0.1) t--; // radiate a little
  aux[i] = t;
  if (t >= 250) set(i, MOLTEN);
}

function updateMolten(x, y, i) {
  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    const t = cells[n];
    if (FLAMMABLE[t] && Math.random() < 0.4) set(n, FIRE, 2);
    else if (t === SAND && Math.random() < 0.3) set(n, GLASS);
    else if (t === WATER) {
      // Quenched: this cell freezes back to metal, the water flashes off.
      set(n, STEAM);
      set(i, METAL);
      aux[i] = 180;
      return;
    }
  }
  if ((frame & 3) === 0 && --life[i] === 0) {
    set(i, METAL);
    aux[i] = 200; // freshly solidified, still glowing
    return;
  }
  updateLiquid(x, y, i, MOLTEN);
}

function updateLava(x, y, i) {
  for (const [dx, dy] of NEIGHBORS) {
    if (!inBounds(x + dx, y + dy)) continue;
    const n = i + dy * W + dx;
    const t = cells[n];
    if (FLAMMABLE[t] && Math.random() < 0.4) set(n, FIRE, 2);
    else if (t === SAND && Math.random() < 0.08) set(n, GLASS);
    else if (t === WATER) {
      set(n, STEAM);
      set(i, STONE); // skins over where it meets water
      return;
    }
  }
  updateLiquid(x, y, i, LAVA);
}

function updateTnt(x, y, i) {
  if (aux[i] === 1) {
    // Fuse is lit.
    if (--life[i] === 0) {
      set(i, FIRE, 2);
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
      set(i, EMPTY);
      blasts.push({ x: x, y: y, r: 6 });
      return;
    }
  }
  updateLiquid(x, y, i, NITRO);
}

function updateGunpowder(x, y, i) {
  // Fire spread handles ignition; a burning grain sometimes pops.
  updatePowder(x, y, i, GUNPOWDER);
}

// Turn a glass cell and its glassy neighbourhood into shards.
function shatter(cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!inBounds(cx + dx, cy + dy)) continue;
      const n = (cy + dy) * W + cx + dx;
      if (cells[n] === GLASS && Math.random() < 0.8) set(n, SHARD);
    }
  }
}

function applyBlast(bx, by, r) {
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
      if (t === GLASS && d2 <= r2 * 2) { set(i, SHARD); continue; }
      if (d2 > r2) continue;

      // Chain other explosives with a delay that grows with distance,
      // so a TNT stack ripples instead of going up as one bang.
      if (t === TNT) {
        aux[i] = 1;
        life[i] = 4 + (Math.sqrt(d2) * 2 | 0) + (Math.random() * 6 | 0);
        continue;
      }
      if (t === NITRO) {
        set(i, EMPTY);
        blasts.push({ x: x, y: y, r: 6 });
        continue;
      }

      const p = 1 - Math.sqrt(d2) / r;
      // Stone and metal only give way near the core.
      if ((t === STONE || t === METAL) && d2 > r2 * 0.12) continue;
      if (Math.random() < p * 0.9 + 0.1) {
        const roll = Math.random();
        set(i, roll < 0.45 ? FIRE : roll < 0.7 ? SMOKE : EMPTY, 2);
      }
    }
  }
}

// Drag loose material toward each black hole and eat whatever touches it.
function feedBlackHoles() {
  const R = 14;
  for (const bh of holes) {
    const { x: hx, y: hy } = bh;
    const hi = hy * W + hx;
    for (const [dx, dy] of NEIGHBORS) {
      if (!inBounds(hx + dx, hy + dy)) continue;
      const n = hi + dy * W + dx;
      if (cells[n] !== EMPTY && cells[n] !== BLACKHOLE) set(n, EMPTY);
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
          if (Math.random() < 0.5) set(i, EMPTY);
          continue;
        }
        if (Math.random() > 4 / Math.sqrt(d2 + 1)) continue;
        // Step toward the hole, twice when close, so infall beats gravity
        // instead of hovering in a stalemate with it.
        let ci = i, cx = x, cy = y;
        const steps = d2 < 64 ? 2 : 1;
        for (let s = 0; s < steps; s++) {
          const sx = cx === hx ? 0 : cx > hx ? -1 : 1;
          const sy = cy === hy ? 0 : cy > hy ? -1 : 1;
          if (cells[ci + sy * W + sx] === EMPTY) { swap(ci, ci + sy * W + sx); ci += sy * W + sx; cx += sx; cy += sy; }
          else if (sx !== 0 && cells[ci + sx] === EMPTY) { swap(ci, ci + sx); ci += sx; cx += sx; }
          else if (sy !== 0 && cells[ci + sy * W] === EMPTY) { swap(ci, ci + sy * W); ci += sy * W; cy += sy; }
          else break;
        }
      }
    }
  }
}

function step() {
  moved.fill(0);
  holes.length = 0;
  for (let y = H - 1; y >= 0; y--) {
    // Alternate scan direction each frame so piles stay roughly symmetric.
    const leftFirst = (frame & 1) === 0;
    for (let k = 0; k < W; k++) {
      const x = leftFirst ? k : W - 1 - k;
      const i = y * W + x;
      if (moved[i]) continue;

      switch (cells[i]) {
        case SAND:
        case ASH:
        case RUST:
        case SHARD:
        case BOULDER: updatePowder(x, y, i, cells[i]); break;
        case GUNPOWDER: updateGunpowder(x, y, i); break;
        case DIRT:  updateDirt(x, y, i); break;
        case SEED:  updateSeed(x, y, i); break;
        case WATER: updateLiquid(x, y, i, WATER); break;
        case OIL:   updateLiquid(x, y, i, OIL); break;
        case NITRO: updateNitro(x, y, i); break;
        case LAVA:  updateLava(x, y, i); break;
        case MOLTEN: updateMolten(x, y, i); break;
        case SMOKE: updateGas(x, y, i, SMOKE); break;
        case STEAM: updateGas(x, y, i, STEAM); break;
        case FIRE:  updateFire(x, y, i); break;
        case PLANT: updatePlant(x, y, i); break;
        case METAL: updateMetal(x, y, i); break;
        case TNT:   updateTnt(x, y, i); break;
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
  frame++;
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function render() {
  const data = image.data;
  for (let i = 0; i < cells.length; i++) {
    const type = cells[i];
    let r, g, b;

    if (type === FIRE) {
      const heat = aux[i] || 1;
      const glow = Math.min(life[i], 60) / 60;
      if (heat === 3) {
        // Blue-white, the hottest.
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
      const t = aux[i];
      r = clamp(140 + t * 0.45 + tint[i]);
      g = clamp(144 + t * 0.12 + tint[i]);
      b = clamp(152 - t * 0.3 + tint[i]);
    } else if (type === MOLTEN || type === LAVA) {
      const c = COLORS[type];
      const f = (Math.random() * 40 | 0) - 10;
      r = clamp(c[0] + f); g = clamp(c[1] + f * 0.6); b = clamp(c[2]);
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

function loop() {
  if (!paused) step();
  render();
  requestAnimationFrame(loop);
}

function paintCircle(cx, cy, type) {
  // A black hole is a single point, however big the brush is. One is plenty.
  if (type === BLACKHOLE) {
    if (inBounds(cx, cy) && cells[cy * W + cx] === EMPTY) set(cy * W + cx, BLACKHOLE);
    return;
  }
  const r = brush;
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
    }
  }
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
  drawing = true;
  brushType = e.button === 2 ? EMPTY : current; // right button erases
  const [x, y] = cellFromEvent(e);
  paintCircle(x, y, brushType);
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const [x, y] = cellFromEvent(e);
  paintCircle(x, y, brushType);
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
  const c = COLORS[m.id];
  sw.style.background = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

  const label = document.createElement('span');
  label.textContent = m.key ? `${m.name} (${m.key})` : m.name;

  btn.append(sw, label);
  btn.addEventListener('click', () => selectMaterial(m.id));
  materialsEl.appendChild(btn);
  buttonsById[m.id] = btn;
}
selectMaterial(SAND);

const heatEl = document.getElementById('heat');
const heatChips = [];
[['Low', 1], ['Medium', 2], ['High', 3]].forEach(([name, value]) => {
  const chip = document.createElement('button');
  chip.textContent = name;
  chip.addEventListener('click', () => {
    fireHeat = value;
    for (const c of heatChips) c.classList.toggle('active', c === chip);
  });
  if (value === fireHeat) chip.classList.add('active');
  heatEl.appendChild(chip);
  heatChips.push(chip);
});

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
});

window.addEventListener('keydown', (e) => {
  const m = MATERIALS.find((x) => x.key === e.key);
  if (m) selectMaterial(m.id);
  if (e.key === ' ') { pauseBtn.click(); e.preventDefault(); }
});

loop();
