@echo off
setlocal
cd /d "%~dp0"
title Cruscotto - Server locale
where python >nul 2>&1
if not errorlevel 1 (
    python -B "%~dp0avvio_locale.py"
) else (
    where py >nul 2>&1
    if errorlevel 1 (
        echo Python non trovato. Installa Python oppure usa il cruscotto dal sito HTTPS.
        pause
        exit /b 1
    )
    py -3 -B "%~dp0avvio_locale.py"
)
if errorlevel 1 pause
