import sqlite3

def init_db():
    conn = sqlite3.connect('./data/storyteller.db')
    c = conn.cursor()
    
    c.execute('''
    CREATE TABLE IF NOT EXISTS equipment_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        damage VARCHAR(50),
        range INTEGER,
        conceal VARCHAR(20),
        min_str INTEGER,
        parry_diff INTEGER,
        attack_penalty INTEGER,
        rating INTEGER,
        penalty INTEGER,
        era VARCHAR(50),
        notes TEXT,
        special_effects TEXT
    )
    ''')
    
    # Pre-load Treasury (Weapons and Shields from images)
    initial_equipment = [
        # Swords and Knives
        ('Knife', 'Melee', 'Str', None, 'P', 1, None, None, None, None, 'General', '', None),
        ('Dagger/Short Sword', 'Melee', 'Str + 1L', None, 'C', 1, None, None, None, None, 'General', 'Armor Piercing: 2', None),
        ('Estoc', 'Melee', 'Str + 2L', None, 'N', 2, None, None, None, None, 'General', 'Armor Piercing: 3', None),
        ('Falchion', 'Melee', 'Str + 2L', None, 'L', 2, None, None, None, None, 'General', 'Shorter than other swords', None),
        ('Knightly Sword', 'Melee', 'Str + 2L', None, 'N', 2, None, None, None, None, 'General', '', None),
        ('Longsword', 'Melee', 'Str + 3L', None, 'N', 3, None, None, None, None, 'General', '', None),
        ('Saif', 'Melee', 'Str + 2L', None, 'N', 2, None, None, None, None, 'General', '', None),
        
        # Ranged Weapons
        ('Bow (Compound or Self)', 'Ranged', '2L', 60, 'N', 2, None, None, None, None, 'General', 'Compound usable from horseback at no penalty; self at +2 diff. Armor Piercing: 2', None),
        ('Crossbow', 'Ranged', '3L', 90, 'N', 2, None, None, None, None, 'General', 'Usable from horseback at no penalty but must be reloaded on foot. Reload takes one turn; Armor Piercing: 2', None),
        ('Heavy Crossbow', 'Ranged', '4L', 90, 'N', 3, None, None, None, None, 'General', 'Reload takes 5 turns - Archery dots; Armor Piercing: 3', None),
        ('Dagger (Thrown)', 'Ranged', 'Str + 1L', 20, 'C', 1, None, None, None, None, 'General', '+1 difficulty', None),
        ('Dart', 'Ranged', 'Str + 1L', 30, 'L', 1, None, None, None, None, 'General', '', None),
        ('Hurlbat', 'Ranged', 'Str + 2B', 30, 'L', 2, None, None, None, None, 'General', 'Sharp metal versions inflict Str + 1L', None),
        ('Knife (Thrown)', 'Ranged', 'Str + 0L', 15, 'P', 1, None, None, None, None, 'General', '+1 difficulty', None),
        ('Javelin', 'Ranged', 'Str + 2L', 50, 'N', 2, None, None, None, None, 'General', 'Armor Piercing: 2', None),
        ('Rock', 'Ranged', 'Str + 0B', 40, 'N', 1, None, None, None, None, 'General', '+1 difficulty', None),
        ('Spear (Thrown)', 'Ranged', 'Str + 2L', 40, 'N', 3, None, None, None, None, 'General', 'Armor Piercing: 2', None),
        ('Sling', 'Ranged', '2B', 20, 'P', 2, None, None, None, None, 'General', '', None),
        ('Staff Sling', 'Ranged', '4B', 50, 'N', 3, None, None, None, None, 'General', '', None),
        ('Throwing Ax', 'Ranged', 'Str + 1L', 20, 'C', 2, None, None, None, None, 'General', '+1 difficulty', None),
        
        # Shields
        ('Buckler', 'Shield', 'Str + 1B', None, 'L', 1, 4, 0, None, None, 'General', '', None),
        ('Pavis', 'Shield', 'Str + 2B', None, 'N', 3, 7, 1, None, None, 'General', 'Good cover vs. ranged when planted; +2 diff to use as weapon', None),
        ('Standard Shield', 'Shield', 'Str + 2B', None, 'N', 2, 6, 1, None, None, 'General', '+1 diff to use as weapon', None)
    ]
    
    # Check if data already exists to avoid duplicates
    c.execute('SELECT count(*) FROM equipment_catalog')
    if c.fetchone()[0] == 0:
        c.executemany('''
        INSERT INTO equipment_catalog (name, type, damage, range, conceal, min_str, parry_diff, attack_penalty, rating, penalty, era, notes, special_effects)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', initial_equipment)
        print("Inserted initial treasury.")
        
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
