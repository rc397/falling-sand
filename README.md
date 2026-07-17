# Falling Sand

A small falling-sand sandbox: a cellular automaton where the canvas is a grid
of cells and every frame each cell moves by a few simple rules. Powders pile
up, liquids pool and level out, gases rise, and a lot of things react when
they touch.

Every cell also carries a temperature in kelvin. Heat conducts between
neighbours, radiates toward the world's ambient temperature, and drives the
chemistry: fire is just a very hot cell, ice is water that got cold, lava is
rock that has not cooled down yet. Set the ambient to space and the world
sits at absolute zero; vacuum does not conduct, so hot things out there cool
only by radiating.

It ships two ways from the same code: a plain web page with no dependencies
and no build step, and a native desktop app that wraps that page. The physics
lives once, in `main.js`.

## Temperature

- The readout under the sliders is a thermometer for whatever the cursor is
  over. The View button switches the whole canvas to a heat map.
- The Heat and Cool tools in the palette raise or lower temperature under
  the brush without placing anything.
- Ambient temperature is a setting: Space is 0 K, Cold is winter, Earth is
  room temperature, Hot is a bad summer.
- Water boils at 373 K and freezes at 273 K into ice. Steam condenses back.
  Metal glows, then melts at 1800 K. Sand fuses to glass past 1200 K. Stone
  itself melts at 1900 K. Lava under 900 K skins over into stone.
- Plants only germinate and grow between roughly 275 and 325 K. A frozen
  garden stops; a scorched one burns.

## Gravity

Also a setting. Down is the normal sandbox. Zero lets everything float and
drift. Mutual computes gravity from the mass on screen, so matter attracts
matter; the slider sets how hard. The World chips bundle the common pairs:
Earth is down plus room temperature, Space is mutual plus absolute zero.

In mutual gravity a wide hydrogen cloud collapses under its own weight,
compression heats the core, and past ignition it lights into plasma: a star.
The star fuses the hydrogen it touches into helium, radiates warmth through
the vacuum around it, and gutters out when the fuel runs dry. Stardust does
the quieter version: it clumps, melts into a molten core, and crusts over
into a rocky planet. Paint a cloud, raise the gravity, and wait.

## Materials

Terrain and solids:

- Sand falls and forms slopes; enough heat fuses it into glass.
- Dirt is soil. It soaks up touching water; ash settling on it enriches it.
- Stone and wood stay put. Wood is fuel and burns down to ash and smoke.
- Glass is solid but brittle: a dropped boulder or a nearby blast shatters
  it into shards.
- Ice is frozen water. It melts near anything warm.
- Boulders fall straight down and are what you drop on glass.
- Metal conducts heat well, glows as it warms, melts into molten metal, and
  slowly rusts if left wet and cold.

Liquids:

- Water finds its level, freezes, boils, quenches, rusts.
- Oil floats on water and burns hard.
- Lava sets fire to what can burn and turns sand to glass; where it meets
  water it skins over into stone.
- Molten metal is what metal becomes past its melting point; it cools back
  into solid metal.
- Nitroglycerin explodes when dropped, heated, or licked by flame.

Life:

- Seeds fall, and on wet or enriched dirt in survivable weather they
  germinate into plants.
- Plants breathe in nearby smoke and grow on it. They vine through water.
- Smoke lingers unless plants drink it. Steam cools and rains back down.
  Fire, ash, soil, smoke and rain close into a little 2D terrarium.

Fire and explosives:

- The flame heat control paints low (campfire), medium (forge), or high
  (blue, sand-fusing, metal-cutting) fire.
- Gunpowder flashes down a trail with pops.
- TNT waits for flame or heat, lights its fuse, and blows a crater. Stacks
  chain in ripples.
- C4 ignores fire entirely; only a blast sets it off, so you can shape a
  charge and detonate it on purpose.
- Magnesium takes a light from any open flame and burns blinding white at
  3100 K. Water does not put it out; it strips the oxygen and frees
  hydrogen, which then pops.
- Thermite does not explode at all, and ordinary flame will not wake it
  either; it is very hard to light. Pour magnesium on the pile and light
  the magnesium. Once burning, it holds 2600 K and eats through metal
  plate like it is not there.
- Fireworks climb and burst into coloured sparks.
- Uranium is the big one. It sits warm to the touch and needs a real
  detonator: a blast or serious sustained heat. Push it critical and it
  answers with a nuke-sized chain reaction.

Space:

- Stardust is planet seed. Hydrogen is star fuel. Helium is what fusion
  leaves behind.
- A black hole pulls loose matter in from a distance and eats whatever
  touches it. One per click; one is plenty.

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
    pyinstaller --onefile --windowed --name FallingSand --add-data "index.html;." --add-data "style.css;." --add-data "main.js;." --add-data "audio.js;." app/main.py

On macOS and Linux the `--add-data` separator is a colon instead of a
semicolon, so use `--add-data "index.html:."` and so on. The binary lands in
`dist/`.

## Controls

- Drag on the canvas to draw the selected material.
- Right-click and drag to erase.
- Number keys pick the common materials, 0 is the eraser.
- Space pauses and resumes.
- Sliders set brush size and gravity strength; chips set world, gravity
  mode, ambient temperature, and flame heat.
- The brush only paints into open space. Fire has to reach fuel through the
  physics, so lay a trail and light one end instead of stamping flame over
  things.

## Sound

All audio is synthesized live with the Web Audio API in `audio.js`; there are
no sample files. Explosions get a sub thump with a noise tail (nukes get a
second, deeper one), glass breaks into little tinks, lit fuses hiss,
fireworks whoosh and crackle, fire crackles harder the more of it there is,
and a black hole hums while it feeds. Browsers will not start audio until
you interact, so it kicks in on your first click. The Sound button in the
panel turns it off and remembers the choice.

## How it works

The grid is a flat `Uint8Array` of material ids, with side arrays for
per-cell state: a timer (burn time, fuses, flight), a scratch value (flame
heat, soil wetness, spark colour), and a `Float32Array` of temperatures.
Each step walks the grid from the bottom up so falling cells are not
processed twice, alternating scan direction every frame to keep piles
symmetric. Before a cell moves, a phase table checks its temperature and may
change what it is.

Movement comes down to a rough density per material: a cell can swap into a
neighbour that is empty or a lighter fluid. Heat moves in its own pass: one
conduction exchange between neighbours, then radiation toward ambient.
Mutual gravity is computed on a coarse grid of blocks, every block
attracting every other, with the near field excluded so a clump's own mass
does not pin it in place. Explosions found during a scan are queued and
applied after it.

## License

MIT. See LICENSE.
