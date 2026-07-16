@echo off
setlocal

set "ROOT=%~dp0"
set "PORT=4287"
set "URL=http://127.0.0.1:%PORT%/"

cd /d "%ROOT%"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Node/npm was not found on PATH. Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($listener) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo Starting PA Nostromo dashboard on %URL%
  start "PA Nostromo Dashboard" /min cmd /k "cd /d ""%ROOT%"" && npm run start"
) else (
  echo PA Nostromo dashboard is already running on %URL%
)

echo Waiting for dashboard to respond...
for /L %%i in (1,1,25) do (
  curl.exe -I -sS --max-time 2 "%URL%" >nul 2>&1
  if not errorlevel 1 goto ready
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 1" >nul 2>&1
)

echo Dashboard did not respond at %URL% yet.
echo Check the PA Nostromo Dashboard command window for startup errors.
pause
exit /b 1

:ready
echo Dashboard is ready: %URL%
start "" "%URL%"
exit /b 0
