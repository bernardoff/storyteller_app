@echo off
start "" cmd /k "uvicorn server.main:app --host 0.0.0.0 --port 8000"
ssh -p 443 -R0:127.0.0.1:8000 a.pinggy.io
