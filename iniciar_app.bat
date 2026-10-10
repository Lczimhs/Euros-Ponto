@echo off
chcp 65001 > nul
title Dashboard de Ponto e Vale Alimentação (V4)

echo ==============================================================
echo    INICIANDO DASHBOARD DE PONTO E VALE ALIMENTAÇÃO (V4)
echo ==============================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Iniciando servidor local com Node.js...
    node "%~dp0server.js"
    goto end
)

set AGY_NODE="C:\Users\GM\AppData\Roaming\Antigravity\bin\agy-node.cmd"
if exist %AGY_NODE% (
    echo Iniciando servidor local com Node.js...
    %AGY_NODE% "%~dp0server.js"
    goto end
)

echo Servidor dedicado não localizado. Abrindo index.html diretamente no navegador...
start "" "%~dp0index.html"

:end

pause
