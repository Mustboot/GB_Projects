@echo off
chcp 65001 >nul
title DrillingLogs Dashboard
cd /d "%~dp0"

set "PY=..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

echo Запуск дашборда DrillingLogs...
echo База данных: %~dp0DrillingLogs_full.accdb
echo Остановка сервера: Ctrl+C или закрытие этого окна
echo.

"%PY%" dashboard_web\server.py %*
if errorlevel 1 (
  echo.
  echo ОШИБКА ЗАПУСКА. Проверьте:
  echo   - установлен ли Python и пакет pyodbc (pip install pyodbc)
  echo   - установлен ли драйвер Microsoft Access ODBC (*.mdb, *.accdb)
  pause
)
