import json
import os
import re
import requests

CHARACTERS_FILE = "characters.json"

def load_characters() -> dict:
    """Load characters from the JSON file."""
    if not os.path.exists(CHARACTERS_FILE):
        return {}
    with open(CHARACTERS_FILE, 'r') as f:
        return json.load(f)

def save_characters(chars: dict):
    """Save characters to the JSON file."""
    with open(CHARACTERS_FILE, 'w') as f:
        json.dump(chars, f, indent=4)

def add_character(name, url):
    """Add a new character with its Google Docs URL."""
    chars = load_characters()
    if name in chars:
        raise ValueError(f"Character '{name}' already exists.")
    chars[name] = url
    save_characters(chars)

def remove_character(name):
    """Remove an existing character by name."""
    chars = load_characters()
    if name not in chars:
        raise KeyError(f"Character '{name}' does not exist.")
    del chars[name]
    save_characters(chars)

def fetch_character_text(name) -> str:
    """Fetch and return the text content of a character's Google Docs document."""
    chars = load_characters()
    if name not in chars:
        return None
    
    url = chars[name]
    match = re.search(r'd/([a-zA-Z0-9_-]+)', url)
    if not match:
        return "Invalid URL format"
    
    doc_id = match.group(1)
    export_url = f"https://docs.google.com/document/d/{doc_id}/export?format=txt"
    
    try:
        response = requests.get(export_url)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        return str(e)
