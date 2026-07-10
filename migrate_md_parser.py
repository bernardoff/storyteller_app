import os
import re
import sqlite3
import json

KB_PATH = r"C:\Users\Pc\Google Drive\Storyteller_app\knowledge_base"
DB_PATH = r"C:\Users\Pc\Google Drive\Storyteller_app\data\storyteller.db"

# Connect to database
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Get all character names from the database to map
cursor.execute("SELECT id, name FROM characters")
db_chars = {row[1].strip().lower(): row[0] for row in cursor.fetchall()}

# Categories
TALENTS = {"Alertness", "Athletics", "Awareness", "Brawl", "Empathy", "Expression", "Intimidation", "Leadership", "Legerdemain", "Subterfuge"}
SKILLS = {"Animal Ken", "Archery", "Commerce", "Crafts", "Etiquette", "Melee", "Performance", "Ride", "Stealth", "Survival"}
KNOWLEDGES = {"Academics", "Enigmas", "Hearth Wisdom", "Investigation", "Law", "Medicine", "Occult", "Politics", "Seneschal", "Theology"}
ATTRIBUTES = ["Strength", "Dexterity", "Stamina", "Charisma", "Manipulation", "Appearance", "Perception", "Intelligence", "Wits"]
VIRTUES = {"Conscience", "Self-Control", "Courage", "Self-control"}

def parse_md_file(filepath):
    data = {
        'attributes': {}, 'talents': {}, 'skills': {}, 'knowledges': {},
        'disciplines': {}, 'backgrounds': {}, 'merits_flaws': [], 'virtues': {},
        'willpower': None, 'blood_pool': None, 'clan': None, 'generation': None
    }
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    current_section = None
    merit_flaw_current = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        lower_line = line.lower()
        if "disciplines" in lower_line and len(lower_line) < 20:
            current_section = "disciplines"
            continue
        elif "backgrounds" in lower_line and len(lower_line) < 20:
            current_section = "backgrounds"
            continue
        elif ("merits & flaws" in lower_line or "merits and flaws" in lower_line) and len(lower_line) < 30:
            current_section = "merits_flaws"
            continue
        elif "combat & gear" in lower_line or "advantages & powers" in lower_line:
            if current_section == "merits_flaws":
                current_section = None
            continue
            
        # Attributes/Abilities often look like: #### Strength: 3 or just Strength 3
        stat_match = re.search(r'^(?:#+\s*)?([A-Za-z\s-]+?)(?:\s*:)?\s+(\d+)$', line)
        if stat_match:
            stat_name = stat_match.group(1).strip()
            stat_val = int(stat_match.group(2))
            
            if stat_name.lower() == 'generation':
                data['generation'] = stat_val
                continue
            elif stat_name.lower() == 'blood pool':
                data['blood_pool'] = stat_val
                continue
            elif stat_name.lower() == 'willpower':
                data['willpower'] = stat_val
                continue

            title_stat = stat_name.title()
            if stat_name == "Self-control" or stat_name == "Self-Control":
                title_stat = "Self-Control"

            if title_stat in ATTRIBUTES:
                data['attributes'][title_stat.lower()] = stat_val
            elif title_stat in TALENTS:
                data['talents'][title_stat] = stat_val
            elif title_stat in SKILLS or stat_name.lower() == "animal ken":
                data['skills']["Animal Ken" if stat_name.lower() == "animal ken" else title_stat] = stat_val
            elif title_stat in KNOWLEDGES:
                data['knowledges'][title_stat] = stat_val
            elif title_stat in VIRTUES:
                vname = "self_control" if "self" in title_stat.lower() else title_stat.lower()
                data['virtues'][vname] = stat_val
            elif current_section == "disciplines":
                data['disciplines'][stat_name] = stat_val
            elif current_section == "backgrounds":
                data['backgrounds'][stat_name] = stat_val

        gen_match = re.search(r'(?:^|#+\s*)Generation\s*:\s*(\d+)', line, re.I)
        if gen_match:
            data['generation'] = int(gen_match.group(1))

        clan_match = re.search(r'(?:^|#+\s*)Clan\s*:\s*([A-Za-z]+)', line, re.I)
        if clan_match:
            data['clan'] = clan_match.group(1)
                
        if current_section == "merits_flaws":
            if line.startswith("#### ") or line.startswith("### "):
                merit_flaw_current = {"name": line.lstrip("# ").strip(), "desc": ""}
                data['merits_flaws'].append(merit_flaw_current)
            elif merit_flaw_current is not None:
                merit_flaw_current["desc"] += line + " "

    return data

for filename in os.listdir(KB_PATH):
    if not filename.endswith('.md'):
        continue
        
    name_match = re.match(r'^([^(]+)', filename)
    if not name_match:
        continue
        
    char_name = name_match.group(1).strip().lower()
    if char_name in db_chars:
        char_id = db_chars[char_name]
        data = parse_md_file(os.path.join(KB_PATH, filename))
        
        updates = []
        params = []
        
        if data['clan']:
            updates.append("clan = ?")
            params.append(data['clan'])
        if data['generation']:
            updates.append("generation = ?")
            params.append(data['generation'])
            
        attr_map = {
            'strength': 'physical_strength', 'dexterity': 'physical_dexterity', 'stamina': 'physical_stamina',
            'charisma': 'social_charisma', 'manipulation': 'social_manipulation', 'appearance': 'social_appearance',
            'perception': 'mental_perception', 'intelligence': 'mental_intelligence', 'wits': 'mental_wits'
        }
        for attr, col in attr_map.items():
            if attr in data['attributes']:
                updates.append(f"{col} = ?")
                params.append(data['attributes'][attr])
                
        if 'conscience' in data['virtues']:
            updates.append("virtue_conscience = ?")
            params.append(data['virtues']['conscience'])
        if 'self_control' in data['virtues']:
            updates.append("virtue_self_control = ?")
            params.append(data['virtues']['self_control'])
        if 'courage' in data['virtues']:
            updates.append("virtue_courage = ?")
            params.append(data['virtues']['courage'])
            
        if data['willpower'] is not None:
            updates.append("willpower_current = ?")
            updates.append("willpower_max = ?")
            params.append(data['willpower'])
            params.append(data['willpower'])
            
        if data['blood_pool'] is not None:
            updates.append("blood_pool_current = ?")
            updates.append("blood_pool_max = ?")
            params.append(data['blood_pool'])
            params.append(data['blood_pool'])
            
        if data['talents']:
            updates.append("abilities_talents_json = ?")
            params.append(json.dumps(data['talents']))
        if data['skills']:
            updates.append("abilities_skills_json = ?")
            params.append(json.dumps(data['skills']))
        if data['knowledges']:
            updates.append("abilities_knowledges_json = ?")
            params.append(json.dumps(data['knowledges']))
        if data['disciplines']:
            updates.append("disciplines_json = ?")
            params.append(json.dumps(data['disciplines']))
        if data['backgrounds']:
            updates.append("backgrounds_json = ?")
            params.append(json.dumps(data['backgrounds']))
        if data['merits_flaws']:
            for mf in data['merits_flaws']:
                mf['desc'] = mf['desc'].strip()
            updates.append("merits_flaws_json = ?")
            params.append(json.dumps(data['merits_flaws']))
            
        if updates:
            sql = f"UPDATE characters SET {', '.join(updates)} WHERE id = ?"
            params.append(char_id)
            cursor.execute(sql, params)
            print(f"Updated character: {char_name.title()} (ID: {char_id})")

conn.commit()
conn.close()
print("Migration completed successfully.")
