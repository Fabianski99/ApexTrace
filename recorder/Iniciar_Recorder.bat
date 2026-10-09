@echo off
cd /d "%~dp0"
title ApexTrace Recorder - F1 25
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 apextrace_recorder.py
) else (
    python apextrace_recorder.py
)
echo.
echo Si el programa no arranco, instala Python 3.10 o superior y marca "Add Python to PATH".
pause
