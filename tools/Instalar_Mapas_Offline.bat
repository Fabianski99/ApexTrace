@echo off
setlocal
cd /d "%~dp0.."
echo ======================================================
echo   APEXTRACE v0.8.8 - Calibracion mejorada de curvas F1 25
echo ======================================================
echo No es necesario abrir F1 25 ni ApexTrace Recorder.
echo Descarga y calibra las referencias publicas de los 24 circuitos.
echo.
echo.
echo [INFO] Descargando y calibrando curvas de los 24 circuitos...
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
 py -3 tools\calibrar_curvas.py
) else (
 python tools\calibrar_curvas.py
)
echo.
echo [FIN] Archivos generados en public\data\corners-calibrated\
echo Revisa el archivo _status.json para ver los circuitos pendientes.
echo Los calculos son solo durante esta instalacion; no quedan procesos activos.
pause
