@echo off
cd /d "%~dp0"

if not exist "%~dp0ecosystem.config.cjs" goto no_eco

set "PM2_COMMAND=%APPDATA%\npm\pm2.cmd"
if not exist "%PM2_COMMAND%" goto no_pm2

echo cwd=%CD%
echo using %PM2_COMMAND%
echo.

echo ===== pm2 delete =====
call "%PM2_COMMAND%" delete ecosystem.config.cjs
echo delete errorlevel=%ERRORLEVEL%
echo.

echo ===== pm2 start =====
call "%PM2_COMMAND%" start ecosystem.config.cjs --update-env
echo start errorlevel=%ERRORLEVEL%
echo.

echo ===== pm2 status =====
call "%PM2_COMMAND%" status
echo.
goto end

:no_eco
echo ERROR: ecosystem.config.cjs not found
goto end

:no_pm2
echo ERROR: pm2.cmd not found
echo %PM2_COMMAND%
echo install: npm install -g pm2

:end
pause
