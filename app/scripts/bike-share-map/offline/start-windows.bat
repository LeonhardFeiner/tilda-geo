@echo off
rem Startet die Offline-Karte: zuerst Python in WSL (Ubuntu), sonst Windows-Python.
rem Fenster offen lassen, solange die Karte benutzt wird.
cd /d "%~dp0"
wsl python3 -c "import sqlite3" >nul 2>nul
if not errorlevel 1 goto wsl
python -c "import sqlite3" >nul 2>nul
if not errorlevel 1 goto win
echo Kein passendes Python gefunden. In WSL im Ordner starten: python3 serve.py
goto end
:wsl
start "" cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:8000/konzept"
wsl python3 serve.py --no-browser
goto end
:win
start "" cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:8000/konzept"
python serve.py --no-browser
:end
pause
