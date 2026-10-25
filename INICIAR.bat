@echo off
chcp 65001 >nul
title Gomitas - Metodos de cobro
cd /d "%~dp0"

echo ============================================================
echo   Gomitas Dulce Vicio - Tienda + Backoffice GraphQL en vivo
echo ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro Python. Instala Python 3.11 o superior desde
  echo         https://www.python.org/downloads/  ^(marca "Add python.exe to PATH"^)
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro Node.js. Instala Node 22 ^(LTS^) o superior desde https://nodejs.org/
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

echo [1/4] Preparando el backend ^(Python^)...
if not exist "back\.venv\Scripts\python.exe" (
  python -m venv "back\.venv" || goto :error
)
"back\.venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r "back\requirements.txt" || goto :error
if not exist "back\.env" copy "back\.env.example" "back\.env" >nul

echo [2/4] Preparando el frontend ^(Node^)...
rem Siempre se corre: si ya esta todo instalado tarda 1-2 segundos, y si falta un paquete nuevo lo agrega.
pushd front
call npm install --no-audit --no-fund || (popd & goto :error)
popd

echo [3/4] Arrancando servidores en dos ventanas nuevas...
start "Backend - http://localhost:8000" /D "%~dp0back" cmd /k ".venv\Scripts\python.exe -m fastapi dev app/main.py"
start "Frontend - http://localhost:5173" /D "%~dp0front" cmd /k "npm run dev"

echo [4/4] Abriendo el navegador...
timeout /t 8 /nobreak >nul
start "" http://localhost:5173

echo.
echo Listo. Tienda:   http://localhost:5173
echo        API docs: http://localhost:8000/docs
echo.
echo Usuarios de prueba:
echo   Admin       ^(backoffice completo^):   admin@gomitas.com       / admin12345
echo   Trabajador  ^(mostrador/recogida^):    trabajador@gomitas.com  / trabajador12345
echo   Cliente:                             cliente@prueba.com      / cliente12345
echo.
echo   GraphQL: http://localhost:8000/graphql  ^(GraphiQL para probar queries^)
echo.
echo Para apagar todo, cierra las ventanas "Backend" y "Frontend".
pause
exit /b 0

:error
echo.
echo [ERROR] Algo fallo en la instalacion. Revisa que tengas internet y vuelve a intentar.
pause
exit /b 1
