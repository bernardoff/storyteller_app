from fastapi import APIRouter, BackgroundTasks
import os
import json

router = APIRouter(prefix='/api/admin', tags=['admin'])

from server.services.google_sheets_sync import sync_all_from_google_sheets

@router.post('/sync-google-sheets')
def sync_google_sheets(background_tasks: BackgroundTasks):
    background_tasks.add_task(sync_all_from_google_sheets)
    return {"status": "sync_started", "message": "Google Sheets synchronization started in the background."}

@router.post('/rebuild-brain')
def rebuild_brain(background_tasks: BackgroundTasks):
    from server.scripts.build_brain import build_brain
    background_tasks.add_task(build_brain)
    return {"status": "rebuild_started", "message": "Brain rebuild started in the background."}

@router.get('/rebuild-progress')
def get_rebuild_progress():
    path = './data/rebuild_progress.json'
    if os.path.exists(path):
        with open(path, 'r') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return {"status": "running", "progress": 0, "message": "Reading progress..."}
    return {"status": "not_started", "progress": 0, "message": "No active rebuild process."}
