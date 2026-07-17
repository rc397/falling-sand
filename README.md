# Falling Sand

A small falling-sand sandbox: a cellular automaton where the canvas is a grid
of cells and every frame each cell moves by a few simple rules. Powders pile
up, liquids pool and level out, gases rise and fade, and some materials react
when they touch.

It ships two ways from the same code: a plain web page with no dependencies
and no build step, and a native desktop app that wraps that page. The physics
lives once, in `main.js`.

## Materials

- Sand falls and forms slopes.
- Water runs downhill and spreads until it finds its level.
- Oil is lighter than water, so it floats on top. It also burns.
- Stone and wood stay put. Wood is fuel.
- Fire spreads through anything flammable, then dies down into smoke.
- Plant creeps along water.
- Water thrown on fire flashes into steam, which drifts up and condenses back
  into water.

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
- Number keys 1 to 7 pick a material, 0 is the eraser.
- Space pauses and resumes.
- The slider sets the brush size.

## How it works

The grid is a flat `Uint8Array` of material ids. Each step walks the grid from
the bottom up so falling cells are not processed twice, and alternates the
left-to-right scan direction every frame to keep piles roughly symmetric.
Movement comes down to a rough density per material: a cell can swap into a
neighbour that is empty or a lighter fluid. That one rule gives you sand
sinking through water and oil floating on top for free. Fire, steam, and
plants add the small bit of chemistry on top.

## License

MIT. See LICENSE.
