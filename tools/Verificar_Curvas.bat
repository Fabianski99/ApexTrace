@echo off
cd /d "%~dp0.."
python tools\Verificar_Curvas.py
if errorlevel 1 py -3 tools\Verificar_Curvas.py
pause
