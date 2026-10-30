@echo off
title Conector local Hikvision - Intersat
cd /d "%~dp0"
echo ==========================================
echo   CONECTOR LOCAL HIKVISION - INTERSAT
echo ==========================================
where py >nul 2>nul
if errorlevel 1 (
  echo No se encontro Python. Instala Python 3.10 o superior desde https://www.python.org/downloads/
  echo Durante la instalacion marca "Add Python to PATH".
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo Preparando el conector por primera vez...
  py -m venv .venv
  if errorlevel 1 (
    echo No se pudo crear el entorno de Python.
    pause
    exit /b 1
  )
  call ".venv\Scripts\python.exe" -m pip install --upgrade pip
  call ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)
echo.
echo Conector activo en http://127.0.0.1:8765
echo Deja esta ventana abierta mientras haces la prueba.
echo Para detenerlo, presiona CTRL+C.
echo.
".venv\Scripts\python.exe" -m uvicorn server:app --host 127.0.0.1 --port 8765
pause
