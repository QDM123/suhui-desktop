@echo off
rem Suhui Desktop Release - double-click to run
chcp 65001 >nul
title Suhui Desktop Release
cd /d "%~dp0"
node scripts/release.mjs
echo.
pause
