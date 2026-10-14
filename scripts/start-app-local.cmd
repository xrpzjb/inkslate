@echo off
rem ============================================================================
rem  Inkslate launcher for this confined environment.
rem
rem  Every executable whose image lives INSIDE the project folder is confined to
rem  that folder here: writes to APPDATA / TEMP / USERPROFILE are denied (EPERM).
rem  electron.exe lives in node_modules, so Chromium cannot create its caches and
rem  SQLite cannot create its WAL -> the app dies instantly (exit 0x80000003, no
rem  logs), and the encrypted git token cannot be decrypted (DPAPI needs
rem  APPDATA\Microsoft\Protect).
rem
rem  Fix: run the same electron binary from OUTSIDE the project folder. The app
rem  code, native modules and app data are still used from their usual places.
rem
rem  This script: 1) keeps the electron runtime in %USERPROFILE%\inkslate-electron
rem               2) starts the Vite dev server if port 5199 is not listening
rem               3) launches the app detached (no stdio pipe -> no EPIPE crash)
rem ============================================================================
setlocal
rem ? agent/IDE ?????????????????? electron ??????? node
set "ELECTRON_RUN_AS_NODE="
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
if defined USERPROFILE goto have_profile
set "USERPROFILE=%SystemDrive%\Users\%USERNAME%"
:have_profile
set "EXT=%USERPROFILE%\inkslate-electron"
if exist "%EXT%\dist\electron.exe" goto have_electron
echo [1/3] Copying the electron runtime outside the project folder (one time)...
if not exist "%EXT%" mkdir "%EXT%"
xcopy "%ROOT%\node_modules\electron\dist" "%EXT%\dist" /E /I /Q /Y >nul
:have_electron
netstat -an | findstr /C:":5199 " >nul
if not errorlevel 1 goto launch
echo [2/3] Starting Vite dev server...
start "inkslate-vite" /min cmd /c "cd /d %ROOT% && npm run dev:vite"
timeout /t 5 /nobreak >nul
:launch
echo [3/3] Starting Inkslate...
cd /d "%ROOT%"
start "" "%EXT%\dist\electron.exe" "%ROOT%" > NUL 2>&1
endlocal
