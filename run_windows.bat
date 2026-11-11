@echo off
setlocal
cd /d "%~dp0"
title JD ANALYSIS - XAUUSD Chart Intelligence

where node >nul 2>nul
if errorlevel 1 goto :node_error
where npm >nul 2>nul
if errorlevel 1 goto :npm_error

if not exist "node_modules\wrangler\bin\wrangler.js" (
  echo [JD ANALYSIS] Installing Worker dependencies...
  call npm ci
  if errorlevel 1 goto :error
)

if not exist ".dev.vars" (
  if exist ".env" (
    copy ".env" ".dev.vars" >nul
    echo [JD ANALYSIS] Created local Worker variables from .env.
  ) else (
    copy ".dev.vars.example" ".dev.vars" >nul
    echo [JD ANALYSIS] Created .dev.vars from .dev.vars.example.
  )
)

echo.
echo [JD ANALYSIS] Starting the local Cloudflare Worker on port 8787.
echo Open http://127.0.0.1:8787 in this computer's browser.
echo Local authentication is bypassed only for this localhost development server.
echo Keep this window open while using the dashboard. Press Ctrl+C to stop.
call node scripts\run-local-worker.mjs
if errorlevel 1 goto :error
exit /b 0

:node_error
echo.
echo [ERROR] Node.js is required. Install a supported Node.js LTS release and try again.
goto :end_error

:npm_error
echo.
echo [ERROR] npm is required. Install it with Node.js and try again.
goto :end_error

:error
echo.
echo [ERROR] The local Worker failed to start. Check the message above.

:end_error
pause
exit /b 1
