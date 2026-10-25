@echo off
chcp 65001 >nul
title Gomitas - Pruebas automaticas
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro Python 3.11 o superior.
  pause
  exit /b 1
)

python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Se necesita Python 3.11 o superior. Instala la version mas reciente desde
  echo         https://www.python.org/downloads/  ^(marca "Add python.exe to PATH"^)
  pause
  exit /b 1
)

if not exist "back\.venv\Scripts\python.exe" (
  echo Creando entorno de Python...
  python -m venv "back\.venv" || goto :error
)
"back\.venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r "back\requirements.txt" || goto :error
if not exist "back\.env" copy "back\.env.example" "back\.env" >nul

echo.
echo Corriendo pruebas ^(usan una base de datos temporal, no tocan gomitas.db^)...
echo.
pushd back
".venv\Scripts\python.exe" -m pytest -v -W ignore
set RESULTADO=%errorlevel%
popd

echo.
if %RESULTADO%==0 (echo TODAS LAS PRUEBAS PASARON) else (echo HAY PRUEBAS QUE FALLARON)
pause
exit /b %RESULTADO%

:error
echo [ERROR] No se pudieron instalar las dependencias. Revisa tu conexion a internet.
pause
exit /b 1
