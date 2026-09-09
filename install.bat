@echo off
REM Double-click this to install and start TaskAlign. Requires an internet
REM connection the first time (to download Python/Node/PostgreSQL).
REM
REM Elevates itself if needed: if you're not already an administrator, this
REM window closes and a single new admin window takes over -- accept the
REM UAC prompt and watch that one, not this one.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator rights...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\install.ps1"
pause
