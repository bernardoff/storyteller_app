import json
import urllib.request
import re
import sys

def generate_code(prompt: str, model="qwen2.5-coder:14b") -> str:
    url = "http://127.0.0.1:11434/api/generate"
    data = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 8000}
    }
    
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as response:
        result = json.loads(response.read().decode('utf-8'))
        return result.get("response", "")

def extract_code(text: str, lang: str) -> str:
    pattern = re.compile(rf'```{lang}\r?\n(.*?)\r?\n```', re.DOTALL | re.IGNORECASE)
    match = pattern.search(text)
    if match:
        return match.group(1).strip() + "\n"
    # fallback to any block
    pattern_any = re.compile(r'```.*?\r?\n(.*?)\r?\n```', re.DOTALL)
    match_any = pattern_any.search(text)
    if match_any:
        return match_any.group(1).strip() + "\n"
    return text.strip()

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: generate_with_ollama.py <prompt_file> <output_file> <lang>")
        sys.exit(1)
        
    prompt_file = sys.argv[1]
    output_file = sys.argv[2]
    lang = sys.argv[3]
    
    with open(prompt_file, 'r', encoding='utf-8') as f:
        prompt = f.read()
        
    print(f"Generating code for {output_file}...")
    try:
        response = generate_code(prompt)
        code = extract_code(response, lang)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"Success! Wrote to {output_file}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
