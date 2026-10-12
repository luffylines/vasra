@echo off
cd /d "%~dp0"
set "VASRA_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "VASRA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
echo Open http://127.0.0.1:4173 in Chrome or Edge after the server starts.
echo Keep this window open. Press Ctrl+C to stop.
"%VASRA_NODE%" server.cjs
pause
