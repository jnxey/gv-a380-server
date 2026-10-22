@echo off
cd /d "%~dp0"

set "PM2_COMMAND=%APPDATA%\npm\pm2.cmd"
if not exist "%PM2_COMMAND%" goto no_pm2

REM seconds to wait after each process restarts
set "WAIT_SECONDS=8"

echo ===== rolling restart begin =====
echo wait %WAIT_SECONDS%s after each app
echo.

echo ===== restart node-3200 =====
call "%PM2_COMMAND%" restart node-3200
if errorlevel 1 goto restart_fail

echo.
echo ===== pm2 status =====
call "%PM2_COMMAND%" status
echo.
echo rolling restart done
goto end

:restart_fail
echo ERROR: pm2 restart failed
call "%PM2_COMMAND%" status
goto end

:no_pm2
echo ERROR: pm2.cmd not found
echo %PM2_COMMAND%
echo install: npm install -g pm2

:end
pause
