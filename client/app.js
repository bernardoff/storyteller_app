window.addEventListener('error', (event) => {
    alert(`JS ERROR: ${event.message}\nAt: ${event.filename}:${event.lineno}`);
});

window.addEventListener('unhandledrejection', (event) => {
    alert(`JS PROMISE REJECTION: ${event.reason}`);
});

let connectedPlayers = [];

function updatePlayersList(playerName, isJoining) {
    if (!playerName) return;
    const playerList = document.getElementById('player-list');
    if (!playerList) return;
    
    if (isJoining) {
        if (!connectedPlayers.includes(playerName)) {
            connectedPlayers.push(playerName);
            const listItem = document.createElement('li');
            listItem.textContent = playerName;
            listItem.setAttribute('data-player-name', playerName);
            listItem.style.padding = '0.5rem';
            listItem.style.borderBottom = '1px solid #3a1a1a';
            playerList.appendChild(listItem);
        }
    } else {
        connectedPlayers = connectedPlayers.filter(player => player !== playerName);
        const itemToRemove = playerList.querySelector(`li[data-player-name="${playerName}"]`);
        if (itemToRemove) {
            playerList.removeChild(itemToRemove);
        }
    }
}

window.handleCredentialResponse = async (response) => {
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('access_token', data.access_token);
            window.location.reload();
        } else {
            const err = await res.json();
            alert('Google login failed: ' + (err.detail || 'Unknown error'));
        }
    } catch (e) {
        console.error(e);
        alert('An error occurred during Google login.');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const setupBtn = document.getElementById('setup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const welcomeMessage = document.getElementById('welcome-message');

    let ws = null;
    let currentUser = null;
    let combatEncounterId = localStorage.getItem('combat_encounter_id');

    // Auto-login on load
    const token = localStorage.getItem('access_token');
    if (token) {
        fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => {
            if (res.ok) {
                return res.json();
            } else {
                throw new Error("Invalid token");
            }
        }).then(user_data => {
            currentUser = user_data;
            loginScreen.classList.add('hidden');
            dashboardScreen.classList.remove('hidden');
            welcomeMessage.textContent = `Welcome, ${user_data.display_name || user_data.username} (${user_data.role})`;
            
            if (user_data.role === 'storyteller') {
                document.getElementById('nav-st-dashboard').classList.remove('hidden');
                fetchSTCharacters();
            }
            
            // Connect socket and load UI panels
            connectWebSocket(token);
            loadCharacters();
            fetchSessions();
            if (combatEncounterId) {
                loadCombatState();
            }
        }).catch(() => {
            localStorage.removeItem('access_token');
            localStorage.removeItem('combat_encounter_id');
            loginScreen.classList.remove('hidden');
            dashboardScreen.classList.add('hidden');
            document.getElementById('nav-st-dashboard').classList.add('hidden');
        });
    } else {
        loginScreen.classList.remove('hidden');
        dashboardScreen.classList.add('hidden');
    }

    // Connect WebSocket
    function connectWebSocket(token) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/1?token=${token}`);
        
        ws.onopen = () => {
            appendSystemMessage("Connected to live game chat.");
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'chat') {
                    appendChatMessage(message.sender_name || 'System', message.text);
                } else if (message.type === 'roll') {
                    appendRollMessage(message.sender_name || 'System', message);
                } else if (message.type === 'combat') {
                    appendCombatMessage(message);
                    if (combatEncounterId) {
                        loadCombatState();
                    }
                } else if (message.type === 'vtt_update') {
                    if (window.handleVttUpdate && message.sender_id !== currentUser?.id) {
                        window.handleVttUpdate(message.data);
                    }
                } else if (message.type === 'player_joined') {
                    updatePlayersList(message.display_name, true);
                    appendSystemMessage(`${message.display_name} has joined the game.`);
                } else if (message.type === 'player_left') {
                    updatePlayersList(message.display_name, false);
                    appendSystemMessage(`${message.display_name} has left the game.`);
                }
            } catch (err) {
                console.error("Error processing WebSocket message:", err);
            }
        };

        ws.onclose = () => {
            appendSystemMessage("Disconnected from live game chat. Reconnecting in 5s...");
            setTimeout(() => connectWebSocket(token), 5000);
        };
    }

    function appendSystemMessage(text) {
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            const div = document.createElement('div');
            div.style.color = '#888';
            div.style.fontStyle = 'italic';
            div.style.marginBottom = '0.5rem';
            div.textContent = text;
            chatMessages.appendChild(div);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function appendChatMessage(sender, text) {
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            const div = document.createElement('div');
            div.style.marginBottom = '0.5rem';
            div.innerHTML = `<strong style="color: #ff4d4f;">${sender}:</strong> <span>${text}</span>`;
            chatMessages.appendChild(div);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function appendRollMessage(sender, roll) {
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            const div = document.createElement('div');
            div.style.marginBottom = '0.5rem';
            div.style.padding = '0.5rem';
            div.style.background = 'rgba(139,0,0,0.15)';
            div.style.borderLeft = '3px solid #8b0000';
            div.innerHTML = `
                <strong style="color: #ff4d4f;">${sender} rolled dice:</strong><br>
                <span>Pool: ${roll.pool} | Difficulty: ${roll.diff}</span><br>
                <span style="font-weight: bold;">Successes: ${roll.successes} (${roll.result})</span><br>
                <span style="color: #aaa; font-size: 0.85rem;">Rolls: [${roll.rolls.join(', ')}]</span>
            `;
            chatMessages.appendChild(div);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function appendCombatMessage(msg) {
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            const div = document.createElement('div');
            div.style.marginBottom = '0.5rem';
            div.style.color = '#ff4d4f';
            div.style.fontWeight = 'bold';
            div.textContent = `[Combat] ${msg.text}`;
            chatMessages.appendChild(div);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // Chat Form Submit
    const sendChatBtn = document.getElementById('send-chat-btn');
    const chatInput = document.getElementById('chat-input');
    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', () => {
            const text = chatInput.value.trim();
            if (!text || !ws) return;
            ws.send(JSON.stringify({ type: 'chat', text: text }));
            chatInput.value = '';
        });
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatBtn.click();
            }
        });
    }

    // Login Handler
    loginBtn.addEventListener('click', async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('access_token', data.access_token);
                
                // Fetch profile
                const profileRes = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                });
                currentUser = await profileRes.json();
                
                loginScreen.classList.add('hidden');
                dashboardScreen.classList.remove('hidden');
                welcomeMessage.textContent = `Welcome, ${currentUser.display_name || currentUser.username} (${currentUser.role})`;
                
                connectWebSocket(data.access_token);
                loadCharacters();
                fetchSessions();
            } else {
                alert('Login failed: Incorrect username or password');
            }
        } catch (error) {
            console.error('Error during login:', error);
        }
    });

    // Setup Account Handler
    if (setupBtn) {
        setupBtn.addEventListener('click', async () => {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            if (!username || !password) {
                alert("Please fill in Username and Password inputs first.");
                return;
            }
            const setup_key = prompt("Enter the Storyteller Setup Key:");
            if (!setup_key) return;

            try {
                const response = await fetch('/api/auth/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: username,
                        password: password,
                        display_name: username,
                        setup_key: setup_key
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    localStorage.setItem('access_token', data.access_token);
                    currentUser = { username, role: 'storyteller', display_name: username };
                    loginScreen.classList.add('hidden');
                    dashboardScreen.classList.remove('hidden');
                    welcomeMessage.textContent = `Welcome, ${data.display_name || username} (storyteller)`;
                    
                    connectWebSocket(data.access_token);
                    loadCharacters();
                    fetchSessions();
                    alert("Setup successful! Welcome Storyteller.");
                } else {
                    const err = await response.json();
                    alert('Setup failed: ' + (err.detail || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error during setup:', error);
            }
        });
    }

    // Logout Handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('access_token');
            localStorage.removeItem('combat_encounter_id');
            if (ws) ws.close();
            loginScreen.classList.remove('hidden');
            dashboardScreen.classList.add('hidden');
            welcomeMessage.textContent = '';
        });
    }

    // Sidebar Navigation
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            document.querySelectorAll('.panel section').forEach(section => {
                section.classList.add('hidden');
            });
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    // Character Sheet Tabs
    const sheetTabBtns = document.querySelectorAll('.sheet-tab-btn');
    sheetTabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // Remove active from all tabs
            sheetTabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.sheet-tab-content').forEach(c => c.classList.add('hidden'));
            document.querySelectorAll('.sheet-tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active to clicked tab
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.remove('hidden');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Dice Roller Handler
    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) {
        rollBtn.addEventListener('click', async () => {
            const pool = parseInt(document.getElementById('pool-size').value) || 5;
            const diff = parseInt(document.getElementById('difficulty').value) || 6;
            const token = localStorage.getItem('access_token');

            try {
                const response = await fetch('/api/dice/roll', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        pool_size: pool,
                        difficulty: diff,
                        specialty: false,
                        context: 'Manual Roll'
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const resultsDiv = document.getElementById('dice-results');
                    resultsDiv.classList.remove('hidden');
                    resultsDiv.innerHTML = `
                        <h4 style="color: #ff4d4f; margin-bottom: 0.5rem;">Roll Result: ${data.result_label}</h4>
                        <p style="margin-bottom: 0.25rem;"><strong>Successes:</strong> ${data.successes}</p>
                        <p style="margin-bottom: 0rem; color: #aaa;"><strong>Individual Rolls:</strong> [${data.rolls_json}]</p>
                    `;

                    // Broadcast via WebSocket
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        const rollsArray = JSON.parse(data.rolls_json);
                        ws.send(JSON.stringify({
                            type: 'roll',
                            pool: pool,
                            diff: diff,
                            successes: data.successes,
                            rolls: rollsArray,
                            result: data.result_label
                        }));
                    }
                } else {
                    alert("Dice roll failed.");
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    // Character Panel - Load
    async function loadCharacters() {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const response = await fetch('/api/character/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const characters = await response.json();
                const characterContainer = document.getElementById('characters-container');
                characterContainer.innerHTML = '';

                // Group characters by character_type
                const groupedCharacters = characters.reduce((acc, character) => {
                    let ctype = character.character_type || "PC";
                    acc[ctype] = acc[ctype] || [];
                    acc[ctype].push(character);
                    return acc;
                }, {});

                Object.keys(groupedCharacters).forEach(type => {
                    const detailsElement = document.createElement('details');
                    detailsElement.open = true;

                    const summaryElement = document.createElement('summary');
                    summaryElement.textContent = type === "PC" ? "PCs" : (type === "NPC_Lore" ? "NPCs (Lore)" : "NPCs (Critters)");
                    summaryElement.style.fontWeight = 'bold';
                    summaryElement.style.color = '#ff4d4f';
                    summaryElement.style.cursor = 'pointer';
                    summaryElement.style.marginBottom = '0.5rem';
                    detailsElement.appendChild(summaryElement);

                    const ulElement = document.createElement('ul');
                    ulElement.style.listStyle = 'none';
                    ulElement.style.padding = 0;

                    groupedCharacters[type].forEach(character => {
                        const liElement = document.createElement('li');
                        liElement.style.padding = "0.5rem";
                        liElement.style.borderBottom = "1px solid #333";
                        liElement.style.cursor = 'pointer';
                        liElement.style.display = 'flex';
                        liElement.style.justifyContent = 'space-between';

                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = `${character.name} (${character.clan || 'No Clan'}, Gen ${character.generation || 'Unknown'})`;
                        nameSpan.addEventListener('click', () => openCharacterSheet(character));
                        
                        const deleteButton = document.createElement('button');
                        deleteButton.textContent = '✖';
                        deleteButton.style.backgroundColor = 'transparent';
                        deleteButton.style.border = 'none';
                        deleteButton.style.color = 'red';
                        deleteButton.style.cursor = 'pointer';
                        deleteButton.style.marginLeft = '0.5rem';
                        deleteButton.title = "Delete Character";

                        deleteButton.addEventListener('click', async (event) => {
                            event.stopPropagation();
                            if(confirm(`Are you sure you want to delete ${character.name}?`)) {
                                await deleteCharacter(character.id);
                                loadCharacters(); // Reload characters after deletion
                            }
                        });

                        liElement.appendChild(nameSpan);
                        liElement.appendChild(deleteButton);
                        ulElement.appendChild(liElement);
                    });

                    detailsElement.appendChild(ulElement);
                    characterContainer.appendChild(detailsElement);
                });
            }
        } catch (error) {
            console.error('Error loading characters:', error);
        }
    }

    // Delete Character
    async function deleteCharacter(id) {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
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

            if (response.ok) {
                console.log('Character deleted successfully');
            } else {
                console.error('Error deleting character:', await response.text());
            }
        } catch (error) {
            console.error('Error in delete request:', error);
        }
    }

    // Dot Rating Logic (from Qwen 2.5)
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('dot')) {
            const container = event.target.closest('.dot-rating');
            if (container.hasAttribute('disabled')) return;
            const dots = Array.from(container.querySelectorAll('.dot'));
            const index = dots.indexOf(event.target);
            
            // Check if clicking the only filled dot to toggle it off
            if (index === 0 && dots[0].classList.contains('filled') && (!dots[1] || !dots[1].classList.contains('filled'))) {
                dots.forEach(d => { d.classList.remove('filled'); d.textContent = '○'; });
                container.dataset.value = "0";
                return;
            }

            dots.forEach((dot, i) => {
                if (i <= index) {
                    dot.classList.add('filled');
                    dot.textContent = '●';
                } else {
                    dot.classList.remove('filled');
                    dot.textContent = '○';
                }
            });
            container.dataset.value = (index + 1).toString();
        }
    });

    function setDots(selector, value) {
        const container = document.querySelector(`.dot-rating[data-stat="${selector}"]`);
        if (!container) return;
        value = parseInt(value) || 0;
        container.dataset.value = value.toString();
        const dots = container.querySelectorAll('.dot');
        dots.forEach((dot, i) => {
            if (i < value) {
                dot.classList.add('filled');
                dot.textContent = '●';
            } else {
                dot.classList.remove('filled');
                dot.textContent = '○';
            }
        });
    }

    function getDots(selector) {
        const container = document.querySelector(`.dot-rating[data-stat="${selector}"]`);
        if (!container) return 0;
        return parseInt(container.dataset.value) || 0;
    }

    function setCustomList(category, dataObj) {
        let keys = Object.keys(dataObj || {});
        let index = 0;
        keys.forEach(k => {
            const input = document.querySelector(`.${category}-custom-name[data-index="${index}"]`);
            if (input) {
                input.value = k;
                setDots(`${category}-custom_${index}`, dataObj[k]);
                index++;
            }
        });
        // clear remaining
        while(index < 6) { // max 6 custom
            const input = document.querySelector(`.${category}-custom-name[data-index="${index}"]`);
            if (input) { input.value = ''; setDots(`${category}-custom_${index}`, 0); }
            index++;
        }
    }

    function getCustomList(category) {
        let obj = {};
        for(let i=0; i<6; i++) {
            const input = document.querySelector(`.${category}-custom-name[data-index="${i}"]`);
            if (input && input.value.trim() !== '') {
                obj[input.value.trim()] = getDots(`${category}-custom_${i}`);
            }
        }
        return obj;
    }

    
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

    function openCharacterSheet(character) {
        window.currentCharacterId = character.id;
        const sheet = document.getElementById('character-sheet');
        sheet.classList.remove('hidden');
        
        const isLocked = character.is_locked && (!currentUser || currentUser.role !== 'storyteller');
        const elementsToDisable = sheet.querySelectorAll('input, textarea, button');
        elementsToDisable.forEach(el => {
            if (el.id !== 'close-sheet-btn' && el.id !== 'suggest-actions-btn') {
                el.disabled = isLocked;
            }
        });
        
        const dotRatings = sheet.querySelectorAll('.dot-rating');
        dotRatings.forEach(dr => {
            if (isLocked) dr.setAttribute('disabled', 'true');
            else dr.removeAttribute('disabled');
        });

        // Header
        const setVal = (id, val) => { const e=document.getElementById(id); if(e) e.value = val; };
        setVal('sheet-name', character.name || '');
        setVal('sheet-clan', character.clan || '');
        setVal('sheet-gen', character.generation || 13);
        setVal('sheet-nature', character.nature || '');
        setVal('sheet-demeanor', character.demeanor || '');
        setVal('sheet-road', character.road || '');
        setVal('sheet-concept', character.concept || '');
        setVal('sheet-specializations', character.specializations || '');
        
        // Attributes
        setDots('attr-strength', character.physical_strength);
        setDots('attr-dexterity', character.physical_dexterity);
        setDots('attr-stamina', character.physical_stamina);
        setDots('attr-charisma', character.social_charisma);
        setDots('attr-manipulation', character.social_manipulation);
        setDots('attr-appearance', character.social_appearance);
        setDots('attr-perception', character.mental_perception);
        setDots('attr-intelligence', character.mental_intelligence);
        setDots('attr-wits', character.mental_wits);

        // JSON parser
        const parseJson = (j) => {
            if (!j) return {};
            if (typeof j === 'object') return j;
            try { return JSON.parse(j); } catch(e) { return {}; }
        };

        const talents = parseJson(character.abilities_talents_json);
        ['Alertness', 'Athletics', 'Awareness', 'Brawl', 'Empathy', 'Expression', 'Intimidation', 'Leadership', 'Legerdemain', 'Subterfuge'].forEach(t => {
            setDots(`talents-${t.toLowerCase().replace(' ', '_')}`, talents[t]);
            delete talents[t];
        });
        setCustomList('talents', talents);

        const skills = parseJson(character.abilities_skills_json);
        ['Animal Ken', 'Archery', 'Commerce', 'Crafts', 'Etiquette', 'Melee', 'Performance', 'Ride', 'Stealth', 'Survival'].forEach(t => {
            setDots(`skills-${t.toLowerCase().replace(' ', '_')}`, skills[t]);
            delete skills[t];
        });
        setCustomList('skills', skills);

        const knowledges = parseJson(character.abilities_knowledges_json);
        ['Academics', 'Enigmas', 'Hearth Wisdom', 'Investigation', 'Law', 'Medicine', 'Occult', 'Politics', 'Seneschal', 'Theology'].forEach(t => {
            setDots(`knowledges-${t.toLowerCase().replace(' ', '_')}`, knowledges[t]);
            delete knowledges[t];
        });
        setCustomList('knowledges', knowledges);

        setCustomList('disciplines', parseJson(character.disciplines_json));
        setCustomList('backgrounds', parseJson(character.backgrounds_json));
        setCustomList('other', parseJson(character.other_traits_json));

        setDots('virtue-conscience', character.virtue_conscience);
        setDots('virtue-self_control', character.virtue_self_control);
        setDots('virtue-courage', character.virtue_courage);

        setDots('road-rating', character.road_rating);
        setDots('willpower-max', character.willpower_max);
        
        setVal('willpower-current', character.willpower_current);
        setVal('blood-pool-pts', character.blood_pool_pts || 1);
        setVal('blood-pool-max', character.blood_pool_max || 10);
        setVal('blood-pool-current', character.blood_pool_current || 10);
        
        let health = parseJson(character.health_json);
        ['bruised', 'hurt', 'injured', 'wounded', 'mauled', 'crippled', 'incapacitated'].forEach(lvl => {
            const el = document.getElementById('hp-' + lvl);
            if (el) el.checked = !!health[lvl];
        });

        
        // Populate equipment
        const eq = parseJson(character.equipment_json);
        const wContainer = document.getElementById('weapons-container');
        wContainer.innerHTML = '';
        if (eq.weapons) eq.weapons.forEach(w => wContainer.appendChild(createWeaponRow(w)));
        
        const aContainer = document.getElementById('armor-container');
        aContainer.innerHTML = '';
        if (eq.armor) eq.armor.forEach(a => aContainer.appendChild(createArmorRow(a)));
        
        setVal('sheet-gear', eq.gear || '');

        const meritsFlaws = parseJson(character.merits_flaws_json);
        setVal('sheet-merits', meritsFlaws.merits || '');
        setVal('sheet-flaws', meritsFlaws.flaws || '');
        setVal('sheet-notes', character.notes || '');

        const saveButton = document.getElementById('save-character-sheet-btn');
        if (saveButton) {
            saveButton.onclick = () => saveCharacterSheet(character.id);
            if (isLocked) saveButton.style.display = 'none';
            else saveButton.style.display = 'inline-block';
        }
        
        const closeBtn = document.getElementById('close-sheet-btn');
        if (closeBtn) closeBtn.onclick = () => document.getElementById('character-sheet').classList.add('hidden');
    }

    async function saveCharacterSheet(id) {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        try {
            const healthJson = {};
            ['bruised', 'hurt', 'injured', 'wounded', 'mauled', 'crippled', 'incapacitated'].forEach(lvl => {
                const el = document.getElementById('hp-' + lvl);
                if (el) healthJson[lvl] = el.checked;
            });

            const getTalents = () => {
                let obj = getCustomList('talents');
                ['Alertness', 'Athletics', 'Awareness', 'Brawl', 'Empathy', 'Expression', 'Intimidation', 'Leadership', 'Legerdemain', 'Subterfuge'].forEach(t => {
                    let val = getDots(`talents-${t.toLowerCase().replace(' ', '_')}`);
                    if (val > 0) obj[t] = val;
                });
                return obj;
            };

            const getSkills = () => {
                let obj = getCustomList('skills');
                ['Animal Ken', 'Archery', 'Commerce', 'Crafts', 'Etiquette', 'Melee', 'Performance', 'Ride', 'Stealth', 'Survival'].forEach(t => {
                    let val = getDots(`skills-${t.toLowerCase().replace(' ', '_')}`);
                    if (val > 0) obj[t] = val;
                });
                return obj;
            };

            const getKnowledges = () => {
                let obj = getCustomList('knowledges');
                ['Academics', 'Enigmas', 'Hearth Wisdom', 'Investigation', 'Law', 'Medicine', 'Occult', 'Politics', 'Seneschal', 'Theology'].forEach(t => {
                    let val = getDots(`knowledges-${t.toLowerCase().replace(' ', '_')}`);
                    if (val > 0) obj[t] = val;
                });
                return obj;
            };

            const meritsFlaws = {
                merits: document.getElementById('sheet-merits').value,
                flaws: document.getElementById('sheet-flaws').value
            };

            const bodyData = {
                name: document.getElementById('sheet-name').value,
                nature: document.getElementById('sheet-nature').value,
                clan: document.getElementById('sheet-clan').value,
                demeanor: document.getElementById('sheet-demeanor').value,
                generation: parseInt(document.getElementById('sheet-gen').value, 10),
                road: document.getElementById('sheet-road').value,
                concept: document.getElementById('sheet-concept').value,
                specializations: document.getElementById('sheet-specializations').value,
                
                physical_strength: getDots('attr-strength') || 1,
                physical_dexterity: getDots('attr-dexterity') || 1,
                physical_stamina: getDots('attr-stamina') || 1,
                social_charisma: getDots('attr-charisma') || 1,
                social_manipulation: getDots('attr-manipulation') || 1,
                social_appearance: getDots('attr-appearance') || 1,
                mental_perception: getDots('attr-perception') || 1,
                mental_intelligence: getDots('attr-intelligence') || 1,
                mental_wits: getDots('attr-wits') || 1,
                
                abilities_talents_json: getTalents(),
                abilities_skills_json: getSkills(),
                abilities_knowledges_json: getKnowledges(),
                disciplines_json: getCustomList('disciplines'),
                backgrounds_json: getCustomList('backgrounds'),
                other_traits_json: getCustomList('other'),
                merits_flaws_json: meritsFlaws,
                specializations: document.getElementById('sheet-specializations').value,
                
                virtue_conscience: getDots('virtue-conscience'),
                virtue_self_control: getDots('virtue-self_control'),
                virtue_courage: getDots('virtue-courage'),
                
                road_rating: getDots('road-rating'),
                willpower_max: getDots('willpower-max'),
                willpower_current: parseInt(document.getElementById('willpower-current').value, 10) || 0,
                blood_pool_pts: parseInt(document.getElementById('blood-pool-pts').value, 10) || 1,
                blood_pool_max: parseInt(document.getElementById('blood-pool-max').value, 10) || 10,
                blood_pool_current: parseInt(document.getElementById('blood-pool-current').value, 10) || 10,
                
                health_json: healthJson,
                notes: document.getElementById('sheet-notes').value
            };

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

            if (response.ok) {
                document.getElementById('character-sheet').classList.add('hidden');
                loadCharacters();
                alert('Character saved successfully!');
            } else {
                alert('Failed to save character.');
            }
        } catch (error) {
            console.error('Error saving character:', error);
            alert(error.message);
        }
    }

    // Character Panel - Create
    
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

    const createCharacterForm = document.getElementById('create-character-form');
    if (createCharacterForm) {
        createCharacterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('char-name').value;
            const clan = document.getElementById('char-clan').value;
            const generation = parseInt(document.getElementById('char-gen').value);
            const token = localStorage.getItem('access_token');

            try {
                const response = await fetch('/api/character/', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, clan, generation })
                });

                if (response.ok) {
                    loadCharacters();
                    createCharacterForm.reset();
                } else {
                    alert('Failed to create character');
                }
            } catch (error) {
                console.error('Error creating character:', error);
            }
        });
    }

    // Combat Panel Tracker
    const startNewCombatBtn = document.getElementById('start-new-combat-btn');
    const setupPhase = document.getElementById('setup-phase');
    const initiativePhase = document.getElementById('initiative-phase');
    const activePhase = document.getElementById('active-phase');
    const addCharacterForm = document.getElementById('add-character-form');
    const generateNPCForm = document.getElementById('generate-npc-form');
    const rollInitiativesBtn = document.getElementById('roll-initiatives-btn');
    const startRoundBtn = document.getElementById('start-round-btn');
    const nextTurnBtn = document.getElementById('next-turn-btn');
    const endCombatBtn = document.getElementById('end-combat-btn');

    // Show the correct phase based on the current combat state
    async function loadCombatState() {
        const token = localStorage.getItem('access_token');
        if (!combatEncounterId || !token) {
            if (setupPhase) setupPhase.classList.add('hidden');
            if (initiativePhase) initiativePhase.classList.add('hidden');
            if (activePhase) activePhase.classList.add('hidden');
            if (startNewCombatBtn) startNewCombatBtn.classList.remove('hidden');
            const stateInfo = document.getElementById('combat-state-info');
            if (stateInfo) stateInfo.innerHTML = "No active encounter.";
            return;
        }

        try {
            const response = await fetch(`/api/combat/${combatEncounterId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                if (response.status === 404) {
                    combatEncounterId = null;
                    localStorage.removeItem('combat_encounter_id');
                    loadCombatState();
                }
                return;
            }
            const data = await response.json();
            const stateInfo = document.getElementById('combat-state-info');
            if (stateInfo) stateInfo.innerHTML = `Active Encounter ID: ${data.id} | Phase: ${data.phase.toUpperCase()} | Round: ${data.round_number}`;

            if (startNewCombatBtn) startNewCombatBtn.classList.add('hidden');

            if (data.phase === 'setup') {
                setupPhase.classList.remove('hidden');
                initiativePhase.classList.add('hidden');
                activePhase.classList.add('hidden');

                // Populate character select
                const charSelect = document.getElementById('setup-character-select');
                if (charSelect && charSelect.children.length === 0) {
                    // Fetch all available characters to add
                    fetch('/api/character/', { headers: { 'Authorization': `Bearer ${token}` } })
                        .then(r => r.json())
                        .then(chars => {
                            charSelect.innerHTML = '';
                            chars.forEach(c => {
                                const opt = document.createElement('option');
                                opt.value = c.id;
                                opt.textContent = `${c.name} (${c.character_type})`;
                                charSelect.appendChild(opt);
                            });
                        });
                }

                // Show combatants
                const combatantsList = document.getElementById('combatants-list');
                if (combatantsList) {
                    combatantsList.innerHTML = '';
                    data.combatants.forEach(c => {
                        const li = document.createElement('li');
                        li.textContent = `✔ ${c.name} (${c.type})`;
                        combatantsList.appendChild(li);
                    });
                }
            } else if (data.phase === 'initiative') {
                setupPhase.classList.add('hidden');
                initiativePhase.classList.remove('hidden');
                activePhase.classList.add('hidden');

                const initiativeList = document.getElementById('initiative-combatants-list');
                if (initiativeList) {
                    initiativeList.innerHTML = '';
                    data.combatants.forEach(c => {
                        const li = document.createElement('li');
                        li.style.marginBottom = '0.5rem';
                        if (c.has_rolled) {
                            li.innerHTML = `<strong>${c.name}</strong> - Initiative: ${c.initiative}`;
                        } else {
                            li.innerHTML = `<strong>${c.name}</strong> - Pending `;
                            const rollBtn = document.createElement('button');
                            rollBtn.textContent = 'Roll Initiative';
                            rollBtn.addEventListener('click', async () => {
                                await fetch(`/api/combat/${combatEncounterId}/roll-initiative`, {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ character_id: c.character_id })
                                });
                                if (ws) ws.send(JSON.stringify({ type: 'combat', text: `${c.name} rolled initiative!` }));
                                loadCombatState();
                            });
                            li.appendChild(rollBtn);
                        }
                        initiativeList.appendChild(li);
                    });
                }
                
                if (currentUser && currentUser.role === 'storyteller' && startRoundBtn) {
                    startRoundBtn.classList.remove('hidden');
                } else if (startRoundBtn) {
                    startRoundBtn.classList.add('hidden');
                }

            } else if (data.phase === 'active') {
                setupPhase.classList.add('hidden');
                initiativePhase.classList.add('hidden');
                activePhase.classList.remove('hidden');

                const activeList = document.getElementById('active-combatants-list');
                if (activeList) {
                    activeList.innerHTML = '';
                    data.combatants.forEach((c, idx) => {
                        const li = document.createElement('li');
                        li.style.padding = '0.5rem';
                        li.style.marginBottom = '0.25rem';
                        li.style.borderRadius = '4px';
                        if (idx === data.current_turn_index) {
                            li.style.background = 'rgba(139,0,0,0.3)';
                            li.style.borderLeft = '4px solid #ff4d4f';
                            li.innerHTML = `👉 <strong>${c.name}</strong> (Initiative: ${c.initiative}) - CURRENT TURN`;
                        } else {
                            li.style.background = '#1a1a1f';
                            li.innerHTML = `${c.name} (Initiative: ${c.initiative})`;
                        }
                        activeList.appendChild(li);
                    });
                }
            }
        } catch (err) {
            console.error(err);
        }
    }

    if (startNewCombatBtn) {
        startNewCombatBtn.addEventListener('click', async () => {
            const token = localStorage.getItem('access_token');
            try {
                const response = await fetch('/api/combat/start', { 
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    combatEncounterId = data.id;
                    localStorage.setItem('combat_encounter_id', combatEncounterId);
                    loadCombatState();
                } else {
                    alert(`Failed to start combat. Server returned ${response.status}. (Did you forget to restart the server?)`);
                }
            } catch (err) {
                console.error("Error starting combat:", err);
                alert("Network error. Is the server running?");
            }
        });
    }

    if (addCharacterForm) {
        addCharacterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = localStorage.getItem('access_token');
            const charSelect = document.getElementById('setup-character-select');
            await fetch(`/api/combat/${combatEncounterId}/add-character`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ character_id: parseInt(charSelect.value) })
            });
            loadCombatState();
        });
    }

    if (generateNPCForm) {
        generateNPCForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = localStorage.getItem('access_token');
            const nameInput = document.getElementById('npc-name-input');
            const conceptInput = document.getElementById('npc-concept-input');
            
            // Show loading state
            const btn = generateNPCForm.querySelector('button');
            const oldText = btn.textContent;
            btn.textContent = 'Generating...';
            btn.disabled = true;

            await fetch(`/api/combat/${combatEncounterId}/generate-npc`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nameInput.value, concept: conceptInput.value, character_type: "NPC_Critter" })
            });
            
            btn.textContent = oldText;
            btn.disabled = false;
            nameInput.value = '';
            conceptInput.value = '';
            loadCombatState();
        });
    }

    if (rollInitiativesBtn) {
        rollInitiativesBtn.addEventListener('click', async () => {
            const token = localStorage.getItem('access_token');
            await fetch(`/api/combat/${combatEncounterId}/phase`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ phase: "initiative" })
            });
            loadCombatState();
        });
    }

    if (startRoundBtn) {
        startRoundBtn.addEventListener('click', async () => {
            const token = localStorage.getItem('access_token');
            await fetch(`/api/combat/${combatEncounterId}/phase`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ phase: "active" })
            });
            loadCombatState();
        });
    }

    // Rules Search Panel
    const searchRulesBtn = document.getElementById('search-rules-btn');
    if (searchRulesBtn) {
        searchRulesBtn.addEventListener('click', async () => {
            const query = document.getElementById('rules-query').value;
            const token = localStorage.getItem('access_token');
            if (!query) return;

            const resultsContainer = document.getElementById('rules-results');
            resultsContainer.innerHTML = '<p style="color: #ff4d4f;">Searching rules... This may take a moment.</p>';
            searchRulesBtn.disabled = true;

            try {
                const response = await fetch(`/api/rules/search?q=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    resultsContainer.innerHTML = '';
                    if (data.length === 0) {
                        resultsContainer.innerHTML = '<p>No results found.</p>';
                    } else {
                        data.forEach(rule => {
                            const li = document.createElement('li');
                            li.style.marginBottom = "1.5rem";
                            li.style.borderBottom = "1px solid #333";
                            li.style.paddingBottom = "1rem";
                            li.innerHTML = `
                                <p style="color: #ccc; font-style: italic;">"${rule.text}"</p>
                                <p style="font-size: 0.85rem; color: #888; margin-top: 0.25rem;">
                                    <strong>Source:</strong> ${rule.source} | <strong>Relevance:</strong> ${(1 - (rule.distance || 0)).toFixed(2)}
                                </p>
                            `;
                            resultsContainer.appendChild(li);
                        });
                    }
                } else {
                    resultsContainer.innerHTML = `<p style="color: red;">Search failed: Server error.</p>`;
                }
            } catch (error) {
                console.error('Error searching rules:', error);
                resultsContainer.innerHTML = `<p style="color: red;">Search error: ${error.message}</p>`;
            } finally {
                searchRulesBtn.disabled = false;
            }
        });
    }

    // Sessions Panel - Load
    async function fetchSessions() {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const response = await fetch('/api/session/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const sessionsHeading = document.getElementById('sessions-heading');
                if (sessionsHeading) {
                    sessionsHeading.textContent = `Sessions (${data.length})`;
                }
                const sessionsList = document.getElementById('sessions-list');
                sessionsList.innerHTML = '';
                data.forEach(session => {
                    const div = document.createElement('div');
                    div.style.marginBottom = "1.5rem";
                    div.style.padding = "1rem";
                    div.style.background = "#1a1a1f";
                    div.style.border = "1px solid #3a1a1a";
                    div.style.borderRadius = "8px";
                    div.innerHTML = `
                        <h4 style="margin-bottom: 0.5rem; color: #ff4d4f;">Session #${session.session_number}: ${session.title}</h4>
                        <p style="margin-bottom: 0.5rem;"><strong>Log:</strong> ${session.detailed_log}</p>
                        ${(currentUser && currentUser.role === 'storyteller') ? `
                            <form id="upload-audio-form-${session.id}" style="margin-top: 1rem; border-top: 1px solid #3a1a1a; padding-top: 1rem;">
                                <label style="display:block; margin-bottom: 0.5rem;">Upload Audio Session (.m4a):</label>
                                <input type="file" id="audio-file-${session.id}" accept=".m4a,.mp3,.wav" style="margin-bottom: 0.5rem;">
                                <button type="submit" style="padding: 4px 8px; font-size: 0.9em; background: #ff4d4f; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Upload & Process</button>
                                <span id="upload-status-${session.id}" style="margin-left: 10px; color: #aaa;"></span>
                            </form>
                        ` : ''}
                    `;
                    sessionsList.appendChild(div);

                    if (currentUser && currentUser.role === 'storyteller') {
                        const form = document.getElementById(`upload-audio-form-${session.id}`);
                        if (form) {
                            form.addEventListener('submit', async (e) => {
                                e.preventDefault();
                                const fileInput = document.getElementById(`audio-file-${session.id}`);
                                if (!fileInput.files[0]) return alert('Select an audio file first');
                                
                                const statusSpan = document.getElementById(`upload-status-${session.id}`);
                                statusSpan.textContent = 'Uploading...';
                                
                                const formData = new FormData();
                                formData.append('file', fileInput.files[0]);
                                
                                try {
                                    const response = await fetch('/api/session/' + session.id + '/upload_audio', {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': 'Bearer ' + token
                                        },
                                        body: formData
                                    });
                                    if (response.ok) {
                                        statusSpan.textContent = 'Uploaded! Processing in background...';
                                    } else {
                                        const err = await response.json();
                                        statusSpan.textContent = 'Error: ' + err.detail;
                                    }
                                } catch (error) {
                                    statusSpan.textContent = 'Error uploading.';
                                }
                            });
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching sessions:', error);
            alert('Error loading sessions: ' + error.message);
        }
    }

    // Sessions Panel - Create
    const createSessionForm = document.getElementById('create-session-form');
    if (createSessionForm) {
        createSessionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const campaignId = parseInt(document.getElementById('sess-campaign-id').value) || 1;
            const sessionNumber = parseInt(document.getElementById('sess-number').value);
            const title = document.getElementById('sess-title').value;
            const detailedLog = document.getElementById('sess-log').value;
            const token = localStorage.getItem('access_token');

            try {
                const response = await fetch('/api/session/', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        campaign_id: campaignId,
                        session_number: sessionNumber,
                        title: title,
                        detailed_log: detailedLog
                    })
                });

                if (response.ok) {
                    fetchSessions();
                    createSessionForm.reset();
                } else {
                    alert('Failed to create session log.');
                }
            } catch (error) {
                console.error('Error creating session:', error);
            }
        });
    }

    // New Handlers
    const suggestActionsBtn = document.getElementById('suggest-actions-btn');
    if (suggestActionsBtn) {
        suggestActionsBtn.addEventListener('click', async function () {
            const characterId = window.currentCharacterId;
            if (!characterId) {
                alert('Please select a character first.');
                return;
            }
            const token = localStorage.getItem('access_token');
            const response = await fetch('/api/suggest_actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ character_id: characterId, context: "general" })
            });
            if (response.ok) {
                const data = await response.json();
                const container = document.getElementById('suggested-actions');
                container.innerHTML = '<h5 style="color: #ff4d4f;">Suggested Actions</h5>';
                if (Array.isArray(data.suggested_actions)) {
                    data.suggested_actions.forEach(action => {
                        const btn = document.createElement('button');
                        btn.style.display = 'block';
                        btn.style.marginTop = '0.5rem';
                        btn.style.textAlign = 'left';
                        btn.textContent = `${action.description} (Pool: ${action.pool}, Diff: ${action.difficulty})`;
                        btn.onclick = () => {
                            document.getElementById('pool-size').value = action.pool;
                            document.getElementById('difficulty').value = action.difficulty;
                            document.querySelector('.sidebar-link[data-target="dice-roller"]').click();
                        };
                        container.appendChild(btn);
                    });
                } else {
                    container.textContent = "No valid suggestions received.";
                }
            } else {
                alert("Failed to get suggestions.");
            }
        });
    }

    // Virtual Tabletop (VTT) Logic
    let vttCanvas = new fabric.Canvas('vtt-canvas');

    vttCanvas.on('object:modified', function(e) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'vtt_update', 
                data: e.target.toJSON(['id']) 
            }));
        }
    });

    const addTokenBtn = document.getElementById('add-token-btn');
    if (addTokenBtn) {
        addTokenBtn.addEventListener('click', () => {
            const token = new fabric.Circle({
                left: 100, top: 100, radius: 20, fill: '#ff4d4f', selectable: true, stroke: '#fff', strokeWidth: 2
            });
            token.id = 'token_' + Date.now();
            vttCanvas.add(token);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'vtt_update', data: token.toJSON(['id']) }));
            }
        });
    }

    const setBgBtn = document.getElementById('set-bg-btn');
    if (setBgBtn) {
        setBgBtn.addEventListener('click', () => {
            const url = prompt("Enter the image URL for the map background:");
            if (url) {
                fabric.Image.fromURL(url, function(img) {
                    img.set({ left: 0, top: 0, selectable: false, evented: false });
                    vttCanvas.setBackgroundImage(img, vttCanvas.renderAll.bind(vttCanvas), {
                        scaleX: vttCanvas.width / img.width,
                        scaleY: vttCanvas.height / img.height
                    });
                });
            }
        });
    }

    window.handleVttUpdate = function(data) {
        if (!vttCanvas) return;
        const existingObj = vttCanvas.getObjects().find(o => o.id === data.id);
        if (existingObj) {
            existingObj.set(data);
            existingObj.setCoords();
            vttCanvas.renderAll();
        } else {
            fabric.util.enlivenObjects([data], function(objects) {
                objects.forEach(function(o) {
                    vttCanvas.add(o);
                });
            });
        }
    };

    const ingestLoreBtn = document.getElementById('ingest-lore-btn');
    if (ingestLoreBtn) {
        ingestLoreBtn.addEventListener('click', async function () {
            const loreText = document.getElementById('lore-input').value.trim();
            if (!loreText) return;
            const token = localStorage.getItem('access_token');
            const response = await fetch('/api/lore/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ text: loreText })
            });
            if (response.ok) {
                alert("Lore ingested successfully!");
                document.getElementById('lore-input').value = '';
            }
        });
    }

    // Floating Rule Search
    const floatingRuleBtn = document.getElementById('floating-rule-btn');
    const floatingRulePanel = document.getElementById('floating-rule-panel');
    const closeRulePanel = document.getElementById('close-rule-panel');
    const floatingRuleSubmit = document.getElementById('floating-rule-submit');

    if (floatingRuleBtn && floatingRulePanel) {
        floatingRuleBtn.addEventListener('click', () => {
            floatingRulePanel.classList.toggle('active');
        });
        
        closeRulePanel.addEventListener('click', () => {
            floatingRulePanel.classList.remove('active');
        });

        floatingRuleSubmit.addEventListener('click', async () => {
            const query = document.getElementById('floating-rule-search').value.trim();
            if (!query) return;
            const resultsDiv = document.getElementById('floating-rule-results');
            resultsDiv.innerHTML = 'Searching...';
            
            const token = localStorage.getItem('access_token');
            try {
                const response = await fetch(`/api/rules/search?query=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    resultsDiv.innerHTML = data.results 
                        ? `<p>${data.results.replace(/\n/g, '<br>')}</p>`
                        : '<p>No results found.</p>';
                } else {
                    resultsDiv.innerHTML = '<p style="color:red;">Error fetching rules.</p>';
                }
            } catch (err) {
                resultsDiv.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
            }
        });
    }

    // ST Dashboard
    async function fetchSTCharacters() {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const response = await fetch('/api/character/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const characters = await response.json();
                populateSTTable(characters);
            }
        } catch (error) {
            console.error('Error fetching ST characters:', error);
        }
    }

    function populateSTTable(characters) {
        const tbody = document.querySelector('#st-character-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        characters.forEach(char => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #27273a';
            
            // Name
            const nameCell = document.createElement('td');
            nameCell.style.padding = '0.5rem';
            nameCell.textContent = char.name;
            row.appendChild(nameCell);
            
            // Total XP
            const totalXpCell = document.createElement('td');
            totalXpCell.style.padding = '0.5rem';
            const totalXpInput = document.createElement('input');
            totalXpInput.type = 'number';
            totalXpInput.value = char.experience_total || 0;
            totalXpInput.style.width = '60px';
            totalXpInput.addEventListener('change', () => updateCharacter(char.id, { experience_total: parseInt(totalXpInput.value) }));
            totalXpCell.appendChild(totalXpInput);
            row.appendChild(totalXpCell);

            // Spent XP
            const spentXpCell = document.createElement('td');
            spentXpCell.style.padding = '0.5rem';
            const spentXpInput = document.createElement('input');
            spentXpInput.type = 'number';
            spentXpInput.value = char.experience_spent || 0;
            spentXpInput.style.width = '60px';
            spentXpInput.addEventListener('change', () => updateCharacter(char.id, { experience_spent: parseInt(spentXpInput.value) }));
            spentXpCell.appendChild(spentXpInput);
            row.appendChild(spentXpCell);

            // Status/Notes (Diablerie)
            const notesCell = document.createElement('td');
            notesCell.style.padding = '0.5rem';
            const notesInput = document.createElement('input');
            notesInput.type = 'text';
            notesInput.value = char.notes || '';
            notesInput.style.width = '100%';
            notesInput.placeholder = 'Backgrounds, Status, Diablerie...';
            notesInput.addEventListener('change', () => updateCharacter(char.id, { notes: notesInput.value }));
            notesCell.appendChild(notesInput);
            row.appendChild(notesCell);

            tbody.appendChild(row);
        });
    }

    async function updateCharacter(id, data) {
        const token = localStorage.getItem('access_token');
        try {
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
            if (!response.ok) {
                console.error('Failed to update character', await response.text());
            }
        } catch (error) {
            console.error('Update error:', error);
        }
    }

    // --- Intelligent Combat Wizard UI Logic ---
    const wizardAnalyzeBtn = document.getElementById('wizard-analyze-btn');
    if (wizardAnalyzeBtn) {
        wizardAnalyzeBtn.addEventListener('click', async () => {
            const actionDescription = document.getElementById('wizard-action-input').value;
            const engine = document.getElementById('wizard-engine-select').value;
            const token = localStorage.getItem('access_token');

            if (!window.currentCharacterId) {
                alert("Please select a character from the Character Panel first.");
                return;
            }

            const combatEncounterId = localStorage.getItem('combat_encounter_id');
            if (!combatEncounterId) {
                alert("No active combat encounter.");
                return;
            }

            const wizardResultsDiv = document.getElementById('wizard-results');
            wizardResultsDiv.innerHTML = '<span style="color: #4ade80;">Analyzing action with ' + engine + '...</span>';
            wizardResultsDiv.style.display = 'block';

            try {
                const response = await fetch(`/api/combat/${combatEncounterId}/resolve-action-llm`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        character_id: window.currentCharacterId,
                        action_description: actionDescription,
                        engine: engine
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const data = await response.json();
                const actions = data.actions;
                wizardResultsDiv.innerHTML = ''; // Clear previous results
                
                if (!actions || actions.length === 0) {
                    wizardResultsDiv.innerHTML = '<span style="color: red;">Could not determine actions.</span>';
                    return;
                }

                actions.forEach((action, idx) => {
                    const actionDiv = document.createElement('div');
                    actionDiv.style.marginBottom = '1rem';
                    actionDiv.style.padding = '0.5rem';
                    actionDiv.style.border = '1px solid #3b3b4f';
                    actionDiv.style.borderRadius = '4px';
                    
                    actionDiv.innerHTML = `
                        <p style="margin-top: 0; color: #a855f7;"><strong>${action.description}</strong></p>
                        <div style="display: flex; gap: 1rem; align-items: center;">
                            <span>Pool: <strong>${action.pool}</strong></span>
                            <span>Diff: <strong>${action.difficulty}</strong></span>
                            <label><input type="checkbox" id="willpower-${idx}" name="willpower"> Willpower</label>
                            <label><input type="checkbox" id="specialty-${idx}" name="specialty"> Specialty</label>
                            <button class="roll-button" data-pool="${action.pool}" data-difficulty="${action.difficulty}" data-idx="${idx}">Roll</button>
                        </div>
                    `;
                    wizardResultsDiv.appendChild(actionDiv);
                });

                // Add event listeners to roll buttons
                document.querySelectorAll('.roll-button').forEach(button => {
                    button.addEventListener('click', async () => {
                        const poolSize = button.getAttribute('data-pool');
                        const difficulty = button.getAttribute('data-difficulty');
                        const idx = button.getAttribute('data-idx');
                        const willpowerCheckbox = document.getElementById(`willpower-${idx}`);
                        const specialtyCheckbox = document.getElementById(`specialty-${idx}`);

                        try {
                            const response = await fetch('/api/dice/roll', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({
                                    pool_size: parseInt(poolSize),
                                    difficulty: parseInt(difficulty),
                                    specialty: specialtyCheckbox.checked,
                                    willpower: willpowerCheckbox.checked,
                                    context: action.description
                                })
                            });

                            if (!response.ok) {
                                throw new Error(`HTTP error! Status: ${response.status}`);
                            }

                            const rollData = await response.json();
                            // Broadcast the roll via WebSocket
                            if (ws && ws.readyState === WebSocket.OPEN) {
                                const rollsArray = JSON.parse(rollData.rolls_json);
                                ws.send(JSON.stringify({
                                    type: 'roll',
                                    sender_name: currentUser ? currentUser.display_name : 'Player',
                                    pool: poolSize,
                                    diff: difficulty,
                                    successes: rollData.successes,
                                    rolls: rollsArray,
                                    result: rollData.result_label
                                }));
                            }
                        } catch (error) {
                            console.error('Error rolling dice:', error);
                        }
                    });
                });

            } catch (error) {
                console.error('Error analyzing action:', error);
                wizardResultsDiv.innerHTML = '<span style="color: red;">Error analyzing action.</span>';
            }
        });
    }
});

// --- Gemini Brain UI Logic ---
let brainHistory = [];
const brainChatHistory = document.getElementById('brain-chat-history');
const brainChatInput = document.getElementById('brain-chat-input');
const sendBrainBtn = document.getElementById('send-brain-btn');
const brainDomainSelect = document.getElementById('brain-domain-select');
const brainStatusText = document.getElementById('brain-status-text');

async function checkBrainStatus() {
    try {
        const res = await fetch('/api/brain/status', {
            headers: {'Authorization': `Bearer ${token}`}
        });
        const data = await res.json();
        if(brainStatusText) brainStatusText.textContent = data.status === 'online' ? 'Online 🟢' : 'Offline 🔴';
    } catch(e) {
        if(brainStatusText) brainStatusText.textContent = 'Error 🔴';
    }
}

if(sendBrainBtn) {
    sendBrainBtn.addEventListener('click', async () => {
        const text = brainChatInput.value;
        const domain = brainDomainSelect.value;
        if(!text) return;
        
        brainHistory.push({role: 'user', parts: [text]});
        if(brainChatHistory) brainChatHistory.innerHTML += `<div style="margin:10px 0;text-align:right"><span style="background:#4ade80;color:#000;padding:5px 10px;border-radius:10px;display:inline-block;">${text}</span></div>`;
        brainChatInput.value = '';
        
        const loadingId = 'loading-' + Date.now();
        if(brainChatHistory) {
            brainChatHistory.innerHTML += `<div id="${loadingId}" style="margin:10px 0;text-align:left"><span style="background:#3a1a1a;padding:5px 10px;border-radius:10px;display:inline-block;">Thinking...</span></div>`;
            brainChatHistory.scrollTop = brainChatHistory.scrollHeight;
        }

        try {
            const res = await fetch('/api/brain/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
                body: JSON.stringify({history: brainHistory, domain: domain})
            });
            const data = await res.json();
            const loader = document.getElementById(loadingId);
            if(loader) loader.remove();
            
            const reply = data.response || "Error";
            brainHistory.push({role: 'model', parts: [reply]});
            if(brainChatHistory) {
                brainChatHistory.innerHTML += `<div style="margin:10px 0;text-align:left"><span style="background:#1a1a24;padding:5px 10px;border-radius:10px;display:inline-block;border:1px solid #3a1a1a;">${reply.replace(/\\n/g, '<br>')}</span></div>`;
                brainChatHistory.scrollTop = brainChatHistory.scrollHeight;
            }
        } catch(e) {
            const loader = document.getElementById(loadingId);
            if(loader) loader.remove();
            if(brainChatHistory) brainChatHistory.innerHTML += `<div style="color:red">Error reaching brain.</div>`;
        }
    });
}

// Hook into dashboard load
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            setTimeout(checkBrainStatus, 1000);
        });
    }
    const rebuildBrainBtn = document.getElementById('rebuild-brain-btn');
    if(rebuildBrainBtn) {
        rebuildBrainBtn.addEventListener('click', async () => {
            if (!confirm("Rebuilding the Context Caches (Macro-RAG) requires indexing thousands of chunks via the Ollama AI model. Depending on your GPU/CPU, this can take 10 to 20 minutes. Proceed?")) {
                return;
            }
            
            const token = localStorage.getItem('access_token');
            brainStatusText.textContent = "Starting rebuild process...";
            rebuildBrainBtn.disabled = true;
            
            try {
                await fetch('/api/admin/rebuild-brain', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                // Poll for progress
                const interval = setInterval(async () => {
                    const res = await fetch('/api/admin/rebuild-progress', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        brainStatusText.textContent = `Rebuilding: ${data.progress}% - ${data.message}`;
                        
                        // Update progress bar
                        let progressContainer = document.getElementById('rebuild-progress-container');
                        if (!progressContainer) {
                            progressContainer = document.createElement('div');
                            progressContainer.id = 'rebuild-progress-container';
                            progressContainer.style.width = '100%';
                            progressContainer.style.backgroundColor = '#333';
                            progressContainer.style.marginTop = '10px';
                            progressContainer.style.borderRadius = '5px';
                            
                            const progressBar = document.createElement('div');
                            progressBar.id = 'rebuild-progress-bar';
                            progressBar.style.width = '0%';
                            progressBar.style.height = '10px';
                            progressBar.style.backgroundColor = '#4ade80';
                            progressBar.style.borderRadius = '5px';
                            progressBar.style.transition = 'width 0.5s';
                            
                            progressContainer.appendChild(progressBar);
                            rebuildBrainBtn.parentNode.insertBefore(progressContainer, rebuildBrainBtn.nextSibling);
                        }
                        
                        const bar = document.getElementById('rebuild-progress-bar');
                        if (bar) bar.style.width = `${data.progress}%`;

                        if (data.status === "completed") {
                            clearInterval(interval);
                            brainStatusText.textContent = "Macro-RAG Cache is fully built and ready!";
                            rebuildBrainBtn.disabled = false;
                        }
                    }
                }, 3000);
                
            } catch (err) {
                console.error(err);
                brainStatusText.textContent = "Error starting rebuild.";
                rebuildBrainBtn.disabled = false;
            }
        });
    }

    // Equipment Database UI
    async function loadEquipmentCatalog() {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const response = await fetch('/api/equipment', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const catalog = await response.json();
                const container = document.getElementById('equipment-catalog-list');
                if (container) {
                    container.innerHTML = catalog.map(item => `
                        <div class="catalog-item" style="background: #2a2a35; padding: 10px; border-radius: 5px; border: 1px solid #4ade80;">
                            <h4 style="margin: 0; color: #4ade80;">${item.name}</h4>
                            <p style="margin: 5px 0; font-size: 0.9em; color: #aaa;">Type: ${item.type} | Era: ${item.era || 'General'}</p>
                            <p style="margin: 5px 0; font-size: 0.9em;">
                                ${item.damage ? `Damage: ${item.damage} <br>` : ''}
                                ${item.range ? `Range: ${item.range} <br>` : ''}
                                ${item.conceal ? `Conceal: ${item.conceal} <br>` : ''}
                                ${item.min_str ? `Min Str: ${item.min_str} <br>` : ''}
                                ${item.parry_diff ? `Parry Diff: ${item.parry_diff} <br>` : ''}
                                ${item.attack_penalty ? `Attack Penalty: ${item.attack_penalty} <br>` : ''}
                            </p>
                            ${item.notes ? `<p style="margin: 5px 0; font-size: 0.85em; color: #ffeb3b;">Notes: ${item.notes}</p>` : ''}
                        </div>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('Failed to load equipment catalog:', error);
        }
    }

    // Call it initially if panel is shown (or just call it on load)
    loadEquipmentCatalog();

    // Discipline Reference click handler
    const disciplinesContainer = document.getElementById('disciplines-container');
    if (disciplinesContainer) {
        disciplinesContainer.addEventListener('click', async (e) => {
            if (e.target.tagName === 'INPUT' || e.target.classList.contains('dot')) return; // Ignore inputs and dots
            
            const row = e.target.closest('.custom-row');
            if (row) {
                const nameInput = row.querySelector('.custom-name');
                const name = nameInput ? nameInput.value : null;
                const dots = getDots(row.querySelector('.dot-rating').getAttribute('data-stat'));
                
                if (name && dots) {
                    const refContent = document.getElementById('discipline-reference-content');
                    refContent.innerHTML = `<p style="color: #4ade80;">Loading rules for ${name} (up to level ${dots})...</p>`;
                    
                    const token = localStorage.getItem('access_token');
                    try {
                        const response = await fetch(`/api/brain/discipline/${encodeURIComponent(name)}?level=${dots}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            const data = await response.json();
                            // Basic markdown to HTML (just handling newlines for now)
                            const htmlText = data.text.replace(/\\n/g, '<br>').replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
                            refContent.innerHTML = htmlText;
                        } else {
                            refContent.innerHTML = `<p style="color: red;">Failed to load discipline rules.</p>`;
                        }
                    } catch (error) {
                        refContent.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
                    }
                }
            }
        });
    }

});