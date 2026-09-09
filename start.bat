@echo off
REM Starts TaskAlign after install.bat has been run once. A desktop shortcut
REM is also created by the installer.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\start.ps1"
