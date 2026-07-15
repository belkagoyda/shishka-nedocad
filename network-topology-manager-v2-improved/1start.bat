@echo off
cd /d "%~dp0"
echo Starting Network Topology Manager...
"E:\PHP\php-8.5.8-nts-Win32-vs17-x64\php.exe" -S 127.0.0.1:8000 api/index.php
pause