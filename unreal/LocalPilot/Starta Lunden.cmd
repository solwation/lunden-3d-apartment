@echo off
setlocal
pushd "%~dp0" || exit /b 1
start "" "Engine\Binaries\Win64\UnrealGame-Win64-Shipping.exe" "..\..\..\Lunden\Lunden.uproject" "-UserDir=%~dp0Pilotdata" -windowed -ResX=1280 -ResY=720
popd
