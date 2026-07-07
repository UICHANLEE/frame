@echo off
cd /d "%~dp0"
start "" "http://localhost:8778"
python server.py
if errorlevel 1 py -3 server.py
pause
