@echo off
set DATABASE_URL=sqlite+aiosqlite:///./data/storyteller_dev.db
set CHROMA_DB_PATH=./chroma_db_dev
set KNOWLEDGE_BASE_PATH=./knowledge_base_dev
start "" cmd /k "uvicorn server.main:app --reload --host 0.0.0.0 --port 8001"
echo Dev server started on port 8001
