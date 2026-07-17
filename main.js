// Falling sand.
//
// The canvas is a grid of cells and each cell holds one material. Every frame
// we walk the grid from the bottom up and let each cell try to move using a
// few simple rules: powders fall and pile, liquids fall and spread, gases
// rise and fade. A handful of materials react when they meet (fire eats fuel,
// water flashes to steam, plants creep along water).

const canvas = document.getElementById('sim');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

// Material ids, kept as small ints so the grid can be a plain typed array.
const EMPTY = 0;
const SAND  = 1;
const WATER = 2;
const STONE = 3;
const WOOD  = 4;
const FIRE  = 5;
const OIL   = 6;
const PLANT = 7;
const SMOKE = 8;
const STEAM = 9;

// Rough density per material. Negative wants to rise. A moving cell can push
// into a neighbour that is empty or a fluid it outweighs, which is enough to
// get sand sinking through water and oil floating on top of it.
const DENSITY = {
  [EMPTY]:  0,
  [SMOKE]: -3,
  [STEAM]: -2,
  [FIRE]:  -1,
  [OIL]:    3,
  [WATER]:  5,
  [SAND]:  10,
  [PLANT]: 90,
  [WOOD]:  99,
  [STONE]: 99,
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
};

// Palette shown in the side panel, in the order I want the buttons.
const MATERIALS = [
  { id: SAND,  name: 'Sand',   key: '1' },
  { id: WATER, name: 'Water',  key: '2' },
  { id: STONE, name: 'Stone',  key: '3' },
  { id: WOOD,  name: 'Wood',   key: '4' },
  { id: OIL,   name: 'Oil',    key: '5' },
  { id: FIRE,  name: 'Fire',   key: '6' },
  { id: PLANT, name: 'Plant',  key: '7' },
  { id: EMPTY, name: 'Eraser', key: '0' },
];

const cells = new Uint8Array(W * H);
const life  = new Uint8Array(W * H); // burn timer, only used by fire
const moved = new Uint8Array(W * H); // stops a cell being moved twice per step
const tint  = new Int8Array(W * H);  // fixed per-pixel shade so surfaces are not flat

for (let i = 0; i < tint.length; i++) {
  tint[i] = (Math.random() * 24 - 12) | 0;
}

const image = ctx.createImageData(W, H);

let current = SAND; // material the panel has selected
let brush = 3;
let paused = false;
let frame = 0;

function isLiquid(t) { return t === WATER || t === OIL; }
function isGas(t)    { return t === SMOKE || t === STEAM; }
function isFluid(t)  { return isLiquid(t) || isGas(t); }
function flammable(t) { return t === WOOD || t === OIL || t === PLANT; }

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
  moved[a] = 1; moved[b] = 1;
}

function set(i, type) {
  cells[i] = type;
  life[i] = type === FIRE ? 60 + (Math.random() * 40 | 0) : 0;
}

function updateSand(x, y, i) {
  if (y + 1 >= H) return;
  const below = i + W;
  if (canSink(SAND, cells[below])) { swap(i, below); return; }

  const dir = Math.random() < 0.5 ? -1 : 1;
  for (const dx of [dir, -dir]) {
    if (x + dx < 0 || x + dx >= W) continue;
    if (canSink(SAND, cells[below + dx])) { swap(i, below + dx); return; }
  }
}

function updateLiquid(x, y, i, type) {
  if (y + 1 < H) {
    const below = i + W;
    if (canSink(type, cells[below])) { swap(i, below); return; }

    const dir = Math.random() < 0.5 ? -1 : 1;
    for (const dx of [dir, -dir]) {
      if (x + dx < 0 || x + dx >= W) continue;
      if (canSink(type, cells[below + dx])) { swap(i, below + dx); return; }
    }
  }

  // Flow along the surface. Reach a few cells sideways so pools level out
  // quickly instead of crawling one pixel at a time.
  const dir = Math.random() < 0.5 ? -1 : 1;
  for (const dx of [dir, -dir]) {
    let dest = -1;
    for (let step = 1; step <= 3; step++) {
      const nx = x + dx * step;
      if (nx < 0 || nx >= W || cells[i + dx * step] !== EMPTY) break;
      dest = i + dx * step;
    }
    if (dest !== -1) { swap(i, dest); return; }
  }
}

function updateGas(x, y, i, type) {
  // Thin out over time so clouds fade instead of filling the screen. Steam
  // sometimes condenses back into water on the way out.
  if (Math.random() < 0.02) {
    cells[i] = (type === STEAM && Math.random() < 0.35) ? WATER : EMPTY;
    moved[i] = 1;
    return;
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

function updateFire(x, y, i) {
  let nearWater = false;

  for (const [dx, dy] of NEIGHBORS) {
    if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H) continue;
    const n = i + dy * W + dx;
    const t = cells[n];
    if (t === WATER) {
      nearWater = true;
    } else if (flammable(t) && Math.random() < (t === OIL ? 0.6 : 0.16)) {
      set(n, FIRE);
    }
  }

  // Water smothers the flame and one nearby drop flashes to steam.
  if (nearWater && Math.random() < 0.5) {
    cells[i] = SMOKE;
    life[i] = 0;
    for (const [dx, dy] of NEIGHBORS) {
      if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H) continue;
      const n = i + dy * W + dx;
      if (cells[n] === WATER) { cells[n] = STEAM; break; }
    }
    moved[i] = 1;
    return;
  }

  if (--life[i] <= 0) {
    cells[i] = Math.random() < 0.35 ? SMOKE : EMPTY;
    moved[i] = 1;
    return;
  }

  // Flames lick upward into open air.
  if (y - 1 >= 0 && cells[i - W] === EMPTY && Math.random() < 0.25) {
    swap(i, i - W);
  }
}

function updatePlant(x, y, i) {
  // Slowly grow into an adjacent water cell so plants vine through pools.
  if (Math.random() > 0.08) return;
  const [dx, dy] = NEIGHBORS[Math.random() * NEIGHBORS.length | 0];
  if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H) return;
  const n = i + dy * W + dx;
  if (cells[n] === WATER) set(n, PLANT);
}

function step() {
  moved.fill(0);
  for (let y = H - 1; y >= 0; y--) {
    // Alternate scan direction each frame so piles stay roughly symmetric.
    const leftFirst = (frame & 1) === 0;
    for (let k = 0; k < W; k++) {
      const x = leftFirst ? k : W - 1 - k;
      const i = y * W + x;
      if (moved[i]) continue;

      switch (cells[i]) {
        case SAND:  updateSand(x, y, i); break;
        case WATER: updateLiquid(x, y, i, WATER); break;
        case OIL:   updateLiquid(x, y, i, OIL); break;
        case SMOKE: updateGas(x, y, i, SMOKE); break;
        case STEAM: updateGas(x, y, i, STEAM); break;
        case FIRE:  updateFire(x, y, i); break;
        case PLANT: updatePlant(x, y, i); break;
      }
    }
  }
  frame++;
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function render() {
  const data = image.data;
  for (let i = 0; i < cells.length; i++) {
    const type = cells[i];
    let r, g, b;

    if (type === FIRE) {
      // Flicker from orange toward yellow based on how hot the cell still is.
      const heat = Math.min(life[i], 60) / 60;
      r = 255;
      g = 90 + (150 * heat | 0);
      b = 20 + (Math.random() * 30 | 0);
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
}

function loop() {
  if (!paused) step();
  render();
  requestAnimationFrame(loop);
}

function paintCircle(cx, cy, type) {
  const r = brush;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      if (type === FIRE && Math.random() < 0.4) continue; // scatter the sparks
      set(y * W + x, type);
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

function selectMaterial(id) {
  current = id;
  for (const b of materialsEl.children) {
    b.classList.toggle('active', Number(b.dataset.id) === id);
  }
}

for (const m of MATERIALS) {
  const btn = document.createElement('button');
  btn.dataset.id = m.id;

  const sw = document.createElement('span');
  sw.className = 'swatch';
  const c = COLORS[m.id];
  sw.style.background = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

  const label = document.createElement('span');
  label.textContent = `${m.name} (${m.key})`;

  btn.append(sw, label);
  btn.addEventListener('click', () => selectMaterial(m.id));
  materialsEl.appendChild(btn);
}
selectMaterial(SAND);

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
});

window.addEventListener('keydown', (e) => {
  const m = MATERIALS.find((x) => x.key === e.key);
  if (m) selectMaterial(m.id);
  if (e.key === ' ') { pauseBtn.click(); e.preventDefault(); }
});

loop();
