@echo off
chcp 65001 >nul
title Text to Voice - Thu thap log
set LOG=%APPDATA%\text-to-voice-desktop\launcher.log
set OUT=%USERPROFILE%\Desktop\ttv-log.txt

echo Dang thu thap log...
echo.

if exist "%LOG%" (
  copy /Y "%LOG%" "%OUT%" >nul
  echo Da luu log tai: %OUT%
  echo.
  echo --- NOI DUNG LOG ---
  type "%LOG%"
) else (
  echo KHONG TIM THAY LOG: %LOG%
  echo.
  echo Kiem tra lai duong dan hoac app chua chay lan nao.
)

echo.
echo --- PORT 3000 / 8000 ---
netstat -ano | findstr ":3000" 
netstat -ano | findstr ":8000"

echo.
echo Nhan phim bat ky de dong...
pause >nul
