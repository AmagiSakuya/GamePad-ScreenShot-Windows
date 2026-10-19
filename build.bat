@echo off
rem ============================================================
rem  GamePad ScreenShot - build and release helper
rem  NOTE: keep this file ASCII-only and CRLF line endings.
rem        cmd.exe mis-parses batch files saved as UTF-8 + LF
rem        (Chinese bytes shift the parser and break every line).
rem        All human readable messages are printed by release.js.
rem ============================================================
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"

echo.
echo ==================================================
echo   GamePad ScreenShot - build ^& release
echo ==================================================
echo   usage:
echo     build.bat 2.1.0                    build and pack v2.1.0
echo     build.bat 2.1.0 --notes "fix xxx"  with release notes
echo     build.bat 2.1.0 --nozip            patch only, no full zip
echo     build.bat 2.1.0 --patch-from 2.1.0 exe/dll changed
echo     build.bat                          rebuild current version
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto no_node

node scripts\release.js %*
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" goto failed

echo Release folder is ready. Press any key to open it ...
pause >nul
start "" "release_upload"
exit /b 0

:failed
echo.
echo Build failed. Exit code: %EXITCODE%
pause
exit /b %EXITCODE%

:no_node
echo.
echo [ERROR] node not found in PATH. Please install Node.js first.
pause
exit /b 1
