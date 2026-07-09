import json
import httpx
import sys

prompt_text = """Write a Python file server/routers/admin_routes.py using FastAPI.
It should have a router = APIRouter(prefix='/api/admin', tags=['admin']).
It should have a POST endpoint '/sync-google-sheets'.
The endpoint should take `background_tasks: BackgroundTasks` and call `background_tasks.add_task(sync_all_from_google_sheets)`.
It should import `sync_all_from_google_sheets` from `server.services.google_sheets_sync`.
It should return `{"status": "sync_started", "message": "Google Sheets synchronization started in the background."}`.
Return ONLY the raw Python code without any markdown.
"""

try:
    response = httpx.post('http://localhost:11434/api/generate', json={
        'model': 'qwen2.5-coder:14b',
        'prompt': prompt_text,
        'stream': False
    }, timeout=120.0)
    response.raise_for_status()
    result = response.json()['response']
    with open('server/routers/admin_routes.py', 'w', encoding='utf-8') as f:
        if result.startswith('```python'): result = result[9:]
        if result.startswith('```'): result = result[3:]
        if result.endswith('```'): result = result[:-3]
        f.write(result.strip() + '\n')
    print('Generated admin_routes.py successfully.')
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
