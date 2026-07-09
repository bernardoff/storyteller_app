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
                const characterList = document.getElementById('characters-list');
                characterList.innerHTML = '';
                characters.forEach(character => {
                    const li = document.createElement('li');
                    li.textContent = `${character.name} (${character.clan || 'No Clan'}, Gen ${character.generation || 'Unknown'})`;
                    li.style.padding = "0.5rem";
                    li.style.borderBottom = "1px solid #333";
                    li.addEventListener('click', () => openCharacterSheet(character));
                    characterList.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Error loading characters:', error);
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

            const response = await fetch(`/api/character/${id}`, {
                method: 'PUT',
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
    const startCombatBtn = document.getElementById('start-combat-btn');
    const nextTurnBtn = document.getElementById('next-turn-btn');
    const endCombatBtn = document.getElementById('end-combat-btn');
    const addCombatantForm = document.getElementById('add-combatant-form');

    if (startCombatBtn) {
        startCombatBtn.addEventListener('click', async () => {
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
                    if (ws) ws.send(JSON.stringify({ type: 'combat', text: 'New combat encounter started!' }));
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    if (nextTurnBtn) {
        nextTurnBtn.addEventListener('click', async () => {
            const token = localStorage.getItem('access_token');
            if (!combatEncounterId) return;
            try {
                const response = await fetch(`/api/combat/${combatEncounterId}/next`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const state = await response.json();
                    loadCombatState();
                    
                    const activeCombatant = state.combatants[state.current_turn_index];
                    const activeName = activeCombatant ? activeCombatant.name : 'Unknown';
                    if (ws) {
                        ws.send(JSON.stringify({
                            type: 'combat',
                            text: `Advanced turn. Round ${state.round_number}, Current Turn is now: ${activeName}`
                        }));
                    }
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    if (endCombatBtn) {
        endCombatBtn.addEventListener('click', async () => {
            const token = localStorage.getItem('access_token');
            if (!combatEncounterId) return;
            try {
                const response = await fetch(`/api/combat/${combatEncounterId}/end`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    combatEncounterId = null;
                    localStorage.removeItem('combat_encounter_id');
                    const stateInfo = document.getElementById('combat-state-info');
                    if (stateInfo) stateInfo.innerHTML = "Combat ended.";
                    const combatantsList = document.getElementById('combatants-list');
                    if (combatantsList) combatantsList.innerHTML = '';
                    const controls = document.getElementById('combat-controls');
                    if (controls) controls.classList.add('hidden');
                    if (ws) ws.send(JSON.stringify({ type: 'combat', text: 'Combat encounter ended.' }));
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    if (addCombatantForm) {
        addCombatantForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('comb-name').value;
            const init = parseInt(document.getElementById('comb-init').value);
            const token = localStorage.getItem('access_token');

            if (!combatEncounterId) {
                alert("Please start a combat encounter first!");
                return;
            }

            try {
                const getRes = await fetch(`/api/combat/${combatEncounterId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const state = await getRes.json();
                let combatants = state.combatants || [];
                
                combatants.push({ name, initiative: init });
                combatants.sort((a, b) => b.initiative - a.initiative);

                const saveRes = await fetch(`/api/combat/${combatEncounterId}/combatants`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(combatants)
                });

                if (saveRes.ok) {
                    loadCombatState();
                    addCombatantForm.reset();
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    async function loadCombatState() {
        if (!combatEncounterId) return;
        const token = localStorage.getItem('access_token');
        try {
            const response = await fetch(`/api/combat/${combatEncounterId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const state = await response.json();
                const stateInfo = document.getElementById('combat-state-info');
                const combatantsList = document.getElementById('combatants-list');
                const controls = document.getElementById('combat-controls');

                if (currentUser && currentUser.role === 'storyteller') {
                    if (controls) controls.classList.remove('hidden');
                } else {
                    if (controls) controls.classList.add('hidden');
                }

                const activeCombatant = state.combatants[state.current_turn_index];
                if (stateInfo) {
                    stateInfo.innerHTML = `
                        Active Encounter ID: ${state.id}<br>
                        Round: ${state.round_number} | Current Turn Index: ${state.current_turn_index}<br>
                        Current Active Turn: <span style="color: #ff4d4f;">${activeCombatant ? activeCombatant.name : 'None'}</span>
                    `;
                }

                if (combatantsList) {
                    combatantsList.innerHTML = '';
                    state.combatants.forEach((c, idx) => {
                        const li = document.createElement('li');
                        li.style.padding = '0.5rem';
                        li.style.marginBottom = '0.25rem';
                        li.style.borderRadius = '4px';
                        
                        if (idx === state.current_turn_index) {
                            li.style.background = 'rgba(139,0,0,0.3)';
                            li.style.borderLeft = '4px solid #ff4d4f';
                            li.style.fontWeight = 'bold';
                            li.innerHTML = `👉 ${c.name} (Initiative: ${c.initiative}) - CURRENT`;
                        } else {
                            li.style.background = '#1a1a1f';
                            li.innerHTML = `${c.name} (Initiative: ${c.initiative})`;
                        }
                        combatantsList.appendChild(li);
                    });
                }
            }
        } catch (err) {
            console.error(err);
        }
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
                    `;
                    sessionsList.appendChild(div);
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
            const response = await fetch(`/api/character/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                console.error('Failed to update character', await response.text());
            }
        } catch (error) {
            console.error('Update error:', error);
        }
    }
});