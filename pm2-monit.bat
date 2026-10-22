@echo off
cd /d "%~dp0"

set "PM2_COMMAND=%APPDATA%\npm\pm2.cmd"
if not exist "%PM2_COMMAND%" goto no_pm2

call "%PM2_COMMAND%" monit
goto end

:no_pm2
echo ERROR: pm2.cmd not found
echo %PM2_COMMAND%
echo install: npm install -g pm2
pause

:end
