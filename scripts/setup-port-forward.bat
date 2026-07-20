@echo off
REM === Comet-Panel LAN Port Forwarding ===
REM Run this ONCE as Administrator on Windows to make comet-panel
REM reachable from other machines on the LAN.
REM
REM Prerequisites:
REM   1. comet-panel must run with --bind 0.0.0.0 inside WSL2
REM   2. Get WSL2 IP: wsl hostname -I
REM   3. This script forwards Windows:8989 -> WSL2:8989

echo Checking WSL2 IP...
for /f "tokens=*" %%i in ('wsl hostname -I') do set WSL_IP=%%i
echo WSL2 IP: %WSL_IP%

echo.
echo Setting up port forwarding: %WSL_IP%:8989 -> Windows:8989
netsh interface portproxy add v4tov4 listenport=8989 listenaddress=0.0.0.0 connectport=8989 connectaddress=%WSL_IP%

echo.
echo Opening Windows Firewall...
netsh advfirewall firewall add rule name="Comet Panel" dir=in action=allow protocol=TCP localport=8989

echo.
echo === Done ===
echo Share URL base: http://YOUR_WINDOWS_IP:8989
echo Get your Windows IP: ipconfig | findstr IPv4
echo.
echo Run comet-panel with: --bind 0.0.0.0 --share-url http://YOUR_WINDOWS_IP:8989
pause
