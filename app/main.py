"""Desktop launcher for the falling sand sandbox.

The simulation lives entirely in the web files at the repo root. This just
opens them in a native window via pywebview, so there is one implementation
of the physics instead of two drifting apart. On Windows the window is backed
by the WebView2 runtime that ships with the OS.
"""

import os
import sys

import webview


def asset_root():
    # When frozen by PyInstaller the web files are unpacked to a temp dir.
    # During normal runs they sit one level above this script.
    if getattr(sys, "frozen", False):
        return sys._MEIPASS
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    page = os.path.join(asset_root(), "index.html")
    webview.create_window(
        "Falling Sand",
        page,
        width=1080,
        height=720,
        min_size=(640, 480),
    )
    webview.start()


if __name__ == "__main__":
    main()
