from fastapi import APIRouter, BackgroundTasks

router = APIRouter(prefix='/api/admin', tags=['admin'])

from server.services.google_sheets_sync import sync_all_from_google_sheets

@router.post('/sync-google-sheets')
def sync_google_sheets(background_tasks: BackgroundTasks):
    background_tasks.add_task(sync_all_from_google_sheets)
    return {"status": "sync_started", "message": "Google Sheets synchronization started in the background."}
