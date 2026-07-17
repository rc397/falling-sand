# Falling Sand

A small falling-sand sandbox: a cellular automaton where the canvas is a grid
of cells and every frame each cell moves by a few simple rules. Powders pile
up, liquids pool and level out, gases rise, and a lot of things react when
they touch.

It ships two ways from the same code: a plain web page with no dependencies
and no build step, and a native desktop app that wraps that page. The physics
lives once, in `main.js`.

## Materials

Terrain and solids:

- Sand falls and forms slopes. Hot enough fire, lava, or molten metal fuses
  it into glass.
- Dirt is soil. It soaks up touching water and darkens; ash settling on it
  enriches it further.
- Stone and wood stay put. Wood is fuel and burns down to ash and smoke.
- Glass is solid and clear, but brittle: a boulder dropped on it, or any
  explosion nearby, shatters it into a pile of shards.
- Boulders fall straight down, punch through plants, and are what you drop
  on glass when you want shards.
- Metal holds its shape and conducts heat. Flame makes it glow; medium or
  high flame eventually melts it into molten metal. Left standing in water
  it slowly rusts away.

Liquids:

- Water runs downhill and spreads until it finds its level.
- Oil is lighter than water, so it floats on top. It also burns hard.
- Lava sets fire to whatever can burn, turns sand to glass, and skins over
  into stone where it meets water.
- Molten metal behaves like lava but cools back into solid metal, and
  quenches instantly when it hits water.
- Nitroglycerin is a liquid that explodes: from fire, or just from being
  dropped far enough.

Fire and explosives:

- Fire spreads through anything flammable and dies down into smoke. The
  flame heat control sets how hot you paint it: low is a lazy orange flame,
  medium melts metal slowly, high burns blue and fuses sand into glass.
- Gunpowder catches instantly and flashes down a trail with little pops.
- TNT sits inert until flame or a blast reaches it, then its fuse lights,
  it flashes, and it blows a crater. Stacks chain with a ripple.

Life:

- Seeds fall, and on wet or enriched dirt they germinate into plants.
  Enriched soil grows taller plants.
- Plants breathe in nearby smoke, and every breath feeds a little more
  growth. They also vine slowly through water.
- Smoke does not just vanish; it hangs in the air for a long while unless
  plants drink it. Steam rises, cools on stone and glass, and drips back
  down as water.

So there is a full cycle in there if you set it up: fire makes smoke and
ash, ash enriches the dirt, plants eat the smoke and grow, water evaporates
over flame and rains back off the ceiling. A little 2D terrarium.

Exotic:

- A black hole sits where you put it and pulls loose material in from a
  distance. Anchored things resist the pull, but nothing survives touching
  it. Placing one is a decision.

## Run it in a browser

Open `index.html` in any modern browser. If you would rather serve it, run a
static server from the project folder:

    python -m http.server

Then open http://localhost:8000.

## Run it as a desktop app

Needs Python 3. On Windows, double-click `app\run.bat` or:

    pip install -r app/requirements.txt
    python app/main.py

The app uses pywebview, which renders through the WebView2 runtime already
included with Windows 10 and 11. On macOS and Linux it falls back to the
system webview.

To build a standalone executable on Windows:

    pip install pyinstaller
    pyinstaller --onefile --windowed --name FallingSand --add-data "index.html;." --add-data "style.css;." --add-data "main.js;." app/main.py

On macOS and Linux the `--add-data` separator is a colon instead of a
semicolon, so use `--add-data "index.html:."` and so on. The binary lands in
`dist/`.

## Controls

- Drag on the canvas to draw the selected material.
- Right-click and drag to erase.
- Number keys pick the common materials, 0 is the eraser.
- Space pauses and resumes.
- The slider sets the brush size, the flame heat chips set how hot fire
  paints.
- The brush only paints into open space. Fire has to reach fuel through the
  physics, so lay a trail and light one end instead of stamping flame over
  things.

## How it works

The grid is a flat `Uint8Array` of material ids, with two side arrays for
per-cell state: a timer (burn time, gas lifetime, fuses) and a scratch value
(flame heat, metal temperature, soil wetness). Each step walks the grid from
the bottom up so falling cells are not processed twice, and alternates the
left-to-right scan direction every frame to keep piles roughly symmetric.

Movement comes down to a rough density per material: a cell can swap into a
neighbour that is empty or a lighter fluid. That one rule gives you sand
sinking through water and oil floating on top for free. Reactions are local:
each cell only ever looks at its eight neighbours. Explosions found during a
scan are queued and applied after it, so a blast does not interfere with the
pass that discovered it.

## License

MIT. See LICENSE.
