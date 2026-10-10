@echo off
cd /d "%~dp0.."
echo ======================================================
echo APEXTRACE v0.8.5 - Referencias de curvas automaticas
 echo ======================================================
if exist "public\data\f1-circuits.geojson" (
 echo [OK] Atlas de circuitos ya instalado. No es necesario descargarlo otra vez.
) else (
 echo [INFO] Falta el atlas: instalando mapas base y anotaciones...
 where py >nul 2>nul
 if %ERRORLEVEL% EQU 0 (
   py -3 tools\descargar_circuitos.py
 ) else (
   python tools\descargar_circuitos.py
 )
)
echo.
echo [INFO] Obteniendo posiciones automaticas de curvas de F1 2025...
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py -3 tools\descargar_curvas_f125.py
) else (
  python tools\descargar_curvas_f125.py
)
echo.
echo [FIN] Actualiza tu navegador despues de terminar.
pause
