@echo off
cd /d "%~dp0.."
echo ====================================================
echo APEXTRACE v0.6 - Mapas y curvas sin conexion
 echo ====================================================
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py -3 tools\descargar_circuitos.py
) else (
  python tools\descargar_circuitos.py
)
echo.
if errorlevel 1 echo Revisa la conexion o tu instalacion de Python.
pause
