@echo off
cd /d C:\Users\KarlMINNE\source\repos\xmd-md-editeur
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
npx tauri dev > tauri-dev.log 2>&1
