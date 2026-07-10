import urllib.request
import json

def test_api():
    try:
        req = urllib.request.Request('http://localhost:8000/api/session/', headers={'Authorization': 'Bearer test'})
        with urllib.request.urlopen(req) as res:
            print("HTTP STATUS:", res.getcode())
            data = json.loads(res.read().decode())
            print("Returned sessions:", len(data))
    except Exception as e:
        print("API Error:", e)
        if hasattr(e, 'read'):
            print(e.read().decode())

if __name__ == '__main__':
    test_api()
