@echo off
REM Double-click this to install and start TaskAlign. Requires an internet
REM connection the first time (to download Python/Node/PostgreSQL).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\install.ps1"
pause
