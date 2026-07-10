import time
from pyngrok import ngrok

try:
    public_url = ngrok.connect(8000).public_url
    print(f"NGROK_URL: {public_url}", flush=True)
    while True:
        time.sleep(1)
except Exception as e:
    print(f"ERROR: {e}", flush=True)
