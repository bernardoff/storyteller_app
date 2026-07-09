import json
import httpx
import sys

with open('temp_prompt.txt', 'r', encoding='utf-8') as f:
    prompt_text = f.read()

prompt_text += '\n\nURLs:\nSESSIONS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhShzXlbh4HEkDMZR_DNp4Mfg0QygU6ejJbh_wpZGaelzVzCfDeM3kL5CzZtLyamik6WrfMnpYwL-/pub?output=csv&gid=801058587"\nXP_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhShzXlbh4HEkDMZR_DNp4Mfg0QygU6ejJbh_wpZGaelzVzCfDeM3kL5CzZtLyamik6WrfMnpYwL-/pub?output=csv&gid=437688875"\nDIABLERIES_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhShzXlbh4HEkDMZR_DNp4Mfg0QygU6ejJbh_wpZGaelzVzCfDeM3kL5CzZtLyamik6WrfMnpYwL-/pub?output=csv&gid=1059318104"\n\nReturn ONLY the raw Python code.'

try:
    response = httpx.post('http://localhost:11434/api/generate', json={
        'model': 'qwen2.5-coder:14b',
        'prompt': prompt_text,
        'stream': False
    }, timeout=300.0)
    response.raise_for_status()
    result = response.json()['response']
    with open('server/services/google_sheets_sync.py', 'w', encoding='utf-8') as f:
        # remove markdown blocks if present
        if result.startswith('```python'):
            result = result[9:]
        if result.startswith('```'):
            result = result[3:]
        if result.endswith('```'):
            result = result[:-3]
        f.write(result.strip() + '\n')
    print('Generated google_sheets_sync.py successfully.')
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
