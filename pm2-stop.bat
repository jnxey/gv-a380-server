@echo off
cd /d "%~dp0"

set "PM2_COMMAND=%APPDATA%\npm\pm2.cmd"
if not exist "%PM2_COMMAND%" goto no_pm2

echo ===== pm2 stop =====
call "%PM2_COMMAND%" stop ecosystem.config.cjs
echo.

echo ===== pm2 delete =====
call "%PM2_COMMAND%" delete node-3200
echo.

echo ===== pm2 status =====
call "%PM2_COMMAND%" status
echo.
goto end

:no_pm2
echo ERROR: pm2.cmd not found
echo %PM2_COMMAND%
echo install: npm install -g pm2

:end
pause
