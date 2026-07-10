import re

with open('client/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add New Character Button listener
new_char_listener = """
    const newCharBtn = document.getElementById('new-character-btn');
    if (newCharBtn) {
        newCharBtn.addEventListener('click', () => {
            window.currentCharacterId = null;
            const sheet = document.getElementById('character-sheet');
            sheet.classList.remove('hidden');
            
            // clear form
            const inputs = sheet.querySelectorAll('input[type="text"], input[type="number"], textarea');
            inputs.forEach(el => el.value = '');
            const checks = sheet.querySelectorAll('input[type="checkbox"]');
            checks.forEach(el => el.checked = false);
            const dots = sheet.querySelectorAll('.dot-rating');
            dots.forEach(d => { d.dataset.value = '0'; Array.from(d.querySelectorAll('.dot')).forEach(dot => {dot.classList.remove('filled'); dot.textContent = '○';}); });
            
            document.getElementById('weapons-container').innerHTML = '';
            document.getElementById('armor-container').innerHTML = '';
        });
    }
"""
if 'new-character-btn' not in content:
    content = content.replace("const createCharacterForm = document.getElementById('create-character-form');", new_char_listener + "\n    const createCharacterForm = document.getElementById('create-character-form');")

# 2. Add Weapon/Armor button logic
equipment_logic = """
    function createWeaponRow(weapon = {name:'', damage:'', conceal:'', equipped:false}) {
        const div = document.createElement('div');
        div.className = 'weapon-item';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <input type="text" class="weapon-name" placeholder="Name" value="${weapon.name}" style="width: 30%;">
            <input type="text" class="weapon-damage" placeholder="Damage" value="${weapon.damage}" style="width: 20%;">
            <input type="text" class="weapon-conceal" placeholder="Conceal" value="${weapon.conceal}" style="width: 20%;">
            <label><input type="checkbox" class="weapon-equipped" ${weapon.equipped ? 'checked' : ''}> Eqp</label>
        `;
        return div;
    }

    function createArmorRow(armor = {name:'', rating:'', penalty:'', equipped:false}) {
        const div = document.createElement('div');
        div.className = 'armor-item';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <input type="text" class="armor-name" placeholder="Name" value="${armor.name}" style="width: 30%;">
            <input type="text" class="armor-rating" placeholder="Rating" value="${armor.rating}" style="width: 20%;">
            <input type="text" class="armor-penalty" placeholder="Penalty" value="${armor.penalty}" style="width: 20%;">
            <label><input type="checkbox" class="armor-equipped" ${armor.equipped ? 'checked' : ''}> Eqp</label>
        `;
        return div;
    }

    const addWeaponBtn = document.getElementById('add-weapon-btn');
    if (addWeaponBtn) addWeaponBtn.onclick = () => document.getElementById('weapons-container').appendChild(createWeaponRow());
    
    const addArmorBtn = document.getElementById('add-armor-btn');
    if (addArmorBtn) addArmorBtn.onclick = () => document.getElementById('armor-container').appendChild(createArmorRow());
"""
if 'createWeaponRow' not in content:
    content = content.replace("function openCharacterSheet(character) {", equipment_logic + "\n    function openCharacterSheet(character) {")

# 3. Update openCharacterSheet to populate equipment
equip_populate = """
        // Populate equipment
        const eq = parseJson(character.equipment_json);
        const wContainer = document.getElementById('weapons-container');
        wContainer.innerHTML = '';
        if (eq.weapons) eq.weapons.forEach(w => wContainer.appendChild(createWeaponRow(w)));
        
        const aContainer = document.getElementById('armor-container');
        aContainer.innerHTML = '';
        if (eq.armor) eq.armor.forEach(a => aContainer.appendChild(createArmorRow(a)));
        
        setVal('sheet-gear', eq.gear || '');
"""
if 'eq = parseJson(character.equipment_json)' not in content:
    content = content.replace("const meritsFlaws = parseJson(character.merits_flaws_json);", equip_populate + "\n        const meritsFlaws = parseJson(character.merits_flaws_json);")

# 4. Update saveCharacterSheet
old_save_start = "async function saveCharacterSheet(id) {"
old_save_bodyData_end = "notes: document.getElementById('sheet-notes').value\n            };"
if old_save_start in content and old_save_bodyData_end in content:
    save_logic = """
            const weapons = Array.from(document.querySelectorAll('.weapon-item')).map(item => ({
                name: item.querySelector('.weapon-name').value,
                damage: item.querySelector('.weapon-damage').value,
                conceal: item.querySelector('.weapon-conceal').value,
                equipped: item.querySelector('.weapon-equipped').checked
            }));
            const armor = Array.from(document.querySelectorAll('.armor-item')).map(item => ({
                name: item.querySelector('.armor-name').value,
                rating: item.querySelector('.armor-rating').value,
                penalty: item.querySelector('.armor-penalty').value,
                equipped: item.querySelector('.armor-equipped').checked
            }));
            const equipment_json = { weapons, armor, gear: document.getElementById('sheet-gear').value };
            bodyData.equipment_json = equipment_json;

            const url = window.currentCharacterId ? `/api/character/${window.currentCharacterId}` : '/api/character/';
            const method = window.currentCharacterId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyData)
            });
"""
    # Replace the fetch part
    content = re.sub(r'const response = await fetch\(`/api/character/\$\{id\}`[^;]+;', save_logic.strip(), content)

with open('client/app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched app.js successfully.")
