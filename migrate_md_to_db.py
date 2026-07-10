import os
import json
import sqlite3
import requests
import re

DB_PATH = './data/storyteller.db'
MD_DIR = './knowledge_base/'
OLLAMA_API_URL = 'http://localhost:11434/api/generate'
MODEL_NAME = 'qwen2.5-coder:14b'

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM characters")
    characters = cursor.fetchall()

    for filename in os.listdir(MD_DIR):
        if not filename.endswith('.md'):
            continue
        
        # Match by checking if char name is in filename
        matched_char = None
        for char_id, name in characters:
            if name.lower() in filename.lower():
                matched_char = (char_id, name)
                break
        
        if not matched_char:
            continue
            
        char_id, char_name = matched_char
        print(f"Processing {filename} for character {char_name}...")
        
        with open(os.path.join(MD_DIR, filename), 'r', encoding='utf-8') as f:
            md_content = f.read()

        prompt = f"""
You are an expert data extractor. Extract the character stats from the following markdown text into a valid JSON object.
Return ONLY the JSON object, with no markdown formatting and no extra text.
The JSON must strictly contain the following keys (use null or default integers if not found):
- clan (string or null)
- generation (int or null)
- physical_strength, physical_dexterity, physical_stamina (ints, default 1)
- social_charisma, social_manipulation, social_appearance (ints, default 1)
- mental_perception, mental_intelligence, mental_wits (ints, default 1)
- virtue_conscience, virtue_self_control, virtue_courage (ints, default 1)
- willpower_max, willpower_current (ints, default 1)
- blood_pool_max (int, default 10)
- abilities_talents_json (dict of string to int, e.g. {{"Alertness": 1}})
- abilities_skills_json (dict of string to int)
- abilities_knowledges_json (dict of string to int)
- disciplines_json (dict of string to int, e.g. {{"Daimonion": 3}})
- backgrounds_json (dict of string to int)
- merits_flaws_json (dict with 'merits' and 'flaws' as text)
- equipment_json (dict with 'weapons' (list of dicts: name, damage, concealable, equipped: true), 'armor' (list of dicts: name, rating, penalty, equipped: true))

Markdown text:
{md_content}
"""

        response = requests.post(OLLAMA_API_URL, json={
            "model": MODEL_NAME,
            "prompt": prompt,
            "format": "json",
            "stream": False
        })
        
        if response.status_code == 200:
            res_text = response.json().get("response", "")
            try:
                stats = json.loads(res_text)
                
                # Encode dicts to JSON strings
                for k in ["abilities_talents_json", "abilities_skills_json", "abilities_knowledges_json", "disciplines_json", "backgrounds_json", "merits_flaws_json", "equipment_json"]:
                    if k in stats and stats[k] is not None:
                        stats[k] = json.dumps(stats[k])
                        
                # Build update query dynamically
                keys = list(stats.keys())
                set_clause = ", ".join([f"{k} = ?" for k in keys])
                values = list(stats.values())
                values.append(char_id)
                
                cursor.execute(f"UPDATE characters SET {set_clause} WHERE id = ?", values)
                conn.commit()
                print(f"Successfully updated {char_name}")
            except Exception as e:
                print(f"Failed to parse or update {char_name}: {e}")
        else:
            print(f"API Error for {char_name}: {response.status_code}")

if __name__ == "__main__":
    main()
