@echo off
rem Launch the desktop version. Installs pywebview on the first run.
python -c "import webview" 2>nul || python -m pip install -r "%~dp0requirements.txt"
python "%~dp0main.py"
