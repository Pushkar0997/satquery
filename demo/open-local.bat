@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run the demo locally.
  echo Install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)

start "SatQuery AI demo" "http://127.0.0.1:5173/"
node demo\serve.js 5173
