@echo off
rem Startet die Offline-Karte: Windows-Python, sonst Python in WSL (Ubuntu).
cd /d "%~dp0"
start "" cmd /c "timeout /t 3 >/dev/null & start http://localhost:8000/konzept"
python -c "import sqlite3" >/dev/null 2>nul
if %errorlevel%==0 (
  python serve.py --no-browser
) else (
  wsl python3 serve.py --no-browser
)
pause
