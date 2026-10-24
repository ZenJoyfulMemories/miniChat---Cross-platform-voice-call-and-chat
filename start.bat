@echo off
setlocal
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 18+ first: https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] Installing dependencies...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo [2/2] Starting voice call server...
echo.
echo   Local:   https://localhost:3443
echo   LAN:     https://YOUR-LAN-IP:3443
echo   Android: fill the LAN https address into the app
echo.
node index.js
pause
