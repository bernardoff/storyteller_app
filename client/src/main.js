window.addEventListener('error', (event) => {
    console.error(`JS ERROR: ${event.message} At: ${event.filename}:${event.lineno}`);
    if (window.UIShell) window.UIShell.showToast(`Error: ${event.message}`, 'error', 5000);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error(`JS PROMISE REJECTION: ${event.reason}`);
    if (window.UIShell) window.UIShell.showToast(`Unhandled error: ${event.reason}`, 'error', 5000);
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
            
            // Apply formatting based on local profile if it matches currentUser
            let displayString = playerName;
            if (window.currentUser && playerName === window.currentUser.username) {
                const role = localStorage.getItem('profile_role') || 'Player';
                const pName = localStorage.getItem('profile_player_name') || playerName;
                displayString = `${role} (${pName})`;
            }

            listItem.textContent = displayString;
            listItem.setAttribute('data-player-name', playerName);
            listItem.style.padding = '0.5rem';
            listItem.style.fontSize = '0.8rem';
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
    const registerBtn = document.getElementById('register-btn');
    const setupBtn = document.getElementById('setup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const generateInviteBtn = document.getElementById('generate-invite-btn');

    // Legacy references (kept for compatibility, UIShell now manages visibility)
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen'); // may be null in new HTML
    const welcomeMessage = document.getElementById('welcome-message');   // may be null in new HTML

    let ws = null;
    let currentUser = null;
    let combatEncounterId = localStorage.getItem('combat_encounter_id');

    // ── Shell activation helper ──────────────────────────────
    function activateShell(user_data, token) {
        currentUser = user_data;
        window.currentUser = user_data;

        // New shell (UIShell handles layout)
        if (window.UIShell) {
            window.UIShell.initShell(user_data);
        } else {
            // Fallback: legacy dashboard reveal
            if (loginScreen) loginScreen.classList.add('hidden');
            if (dashboardScreen) dashboardScreen.classList.remove('hidden');
        }

        // Legacy welcome message (hidden in new UI but kept for safety)
        if (welcomeMessage) welcomeMessage.textContent = `Welcome, ${user_data.display_name || user_data.username} (${user_data.role})`;

        // ST-only features
        if (user_data.role === 'storyteller') {
            const navStDashboard = document.getElementById('nav-st-dashboard');
            if (navStDashboard) navStDashboard.classList.remove('hidden');
            fetchSTCharacters();
            fetchUsers();
        }

        // Connect WebSocket and load data
        connectWebSocket(token);
        loadCharacters();
        fetchSessions();
        if (combatEncounterId) {
            window.combatEncounterId = combatEncounterId;
            if (window.CombatUI) {
                window.CombatUI.loadCombatState();
            } else {
                loadCombatState();
            }
        }
    }

    function deactivateShell() {
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (dashboardScreen) dashboardScreen.classList.add('hidden');
        const appShell = document.getElementById('app-shell');
        if (appShell) appShell.classList.remove('visible');
        if (welcomeMessage) welcomeMessage.textContent = '';
    }

    // Auto-login on load
    const token = localStorage.getItem('access_token');
    if (token) {
        fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => {
            if (res.ok) return res.json();
            throw new Error('Invalid token');
        }).then(user_data => {
            // Load Lore Data on startup
            window.loreDisciplines = [];
            window.loreBackgrounds = [];
            window.loreMeritsFlaws = [];
            window.loreRituals = [];
            
            Promise.all([
                fetch('/api/lore/disciplines').then(r => r.ok ? r.json() : []),
                fetch('/api/lore/backgrounds').then(r => r.ok ? r.json() : []),
                fetch('/api/lore/merits_flaws').then(r => r.ok ? r.json() : []),
                fetch('/api/lore/rituals').then(r => r.ok ? r.json() : [])
            ]).then(([d, b, m, r]) => {
                window.loreDisciplines = d;
                window.loreBackgrounds = b;
                window.loreMeritsFlaws = m;
                window.loreRituals = r;
                activateShell(user_data, token);
            }).catch(e => {
                console.error("Failed to load lore", e);
                activateShell(user_data, token); // fallback
            });
        }).catch((err) => {
            console.error('Login initialization error:', err);
            localStorage.removeItem('access_token');
            localStorage.removeItem('combat_encounter_id');
            deactivateShell();
        });
    } else {
        deactivateShell();
    }

    // Connect WebSocket
    function connectWebSocket(token) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/1?token=${token}`);
        window.ws = ws;
        
        ws.onopen = () => {
            appendSystemMessage("Connected to live game chat.");
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('WS RECV:', message);

                if (message.type === 'chat') {
                    appendChatMessage(message.sender_name || 'System', message.text);
                } else if (message.type === 'roll') {
                    appendRollMessage(message.sender_name || 'System', message);
                } else if (message.type === 'combat_started') {
                    console.log('Frontend received combat_started:', message);
                    if (window.UIShell) {
                        window.UIShell.showToast(message.message, 'info');
                    }
                    localStorage.setItem('combat_encounter_id', message.combat_id);
                    window.combatEncounterId = message.combat_id;
                    combatEncounterId = message.combat_id; // Update local scope variable
                    if (window.CombatUI && typeof window.CombatUI.loadCombatState === 'function') {
                        window.CombatUI.loadCombatState();
                    }
                    if (window.UIShell) {
                        window.UIShell.setCombatMode(true);
                        window.UIShell.navigateTo('vtt');
                    }
                } else if (message.type === 'combat' || message.type === 'combat_update' || message.type === 'combat_phase_change') {
                    console.log('Frontend received combat/update/phase_change:', message);
                    appendCombatMessage(message);
                    
                    if (message.encounter_id) {
                        window.combatEncounterId = message.encounter_id;
                        combatEncounterId = message.encounter_id;
                        localStorage.setItem('combat_encounter_id', message.encounter_id);
                    }
                    
                    if (combatEncounterId || window.combatEncounterId) {
                        console.log('Calling loadCombatState from ws message...');
                        loadCombatState();
                        if (window.CombatUI && typeof window.CombatUI.loadCombatState === 'function') {
                            window.CombatUI.loadCombatState();
                        }
                    }
                } else if (message.type === 'agent_narration') {
                    // Agent narration broadcast — show in storyteller agent panel
                    appendChatMessage('🧠 Storyteller', message.text);
                    if (window.UIShell) {
                        window.UIShell.appendAgentMessage('storyteller', 'assistant', message.text);
                        window.UIShell.markAgentUnread('storyteller');
                    }
                    // Also add to combat feed if in combat
                    if (document.body.classList.contains('combat-active')) {
                        appendCombatBeat('Storyteller', 'narration', message.text, null);
                    }
                } else if (message.type === 'combat_declaration') {
                    // Another player submitted a declaration — update tracker
                    if (window.CombatUI && window.CombatUI.onDeclarationReceived) {
                        window.CombatUI.onDeclarationReceived(message);
                    }
                } else if (message.type === 'ST_APPROVAL_REQUEST') {
                    if (window.CombatUI && window.CombatUI.showApprovalCard) {
                        window.CombatUI.showApprovalCard(message);
                    }
                } else if (message.type === 'chat_message') {
                    appendSystemMessage(message.message);
                    if (message.rolls) {
                        message.rolls.forEach(r => {
                            appendRollMessage(message.sender_name || 'Storyteller (Arbiter)', {
                                rollResult: r.result.rolls.join(", "),
                                result_label: r.result.result_label,
                                successes: r.result.successes,
                                ...r
                            });
                        });
                    }
                } else if (message.type === 'vtt_update') {
                    if (window.handleVttUpdate && message.sender_id !== currentUser?.id) {
                        window.handleVttUpdate(message.data);
                    }
                } else if (message.type === 'vtt_add') {
                    console.log('Frontend received vtt_add:', message);
                    if (window.vttEngine && message.sender_id !== currentUser?.id) {
                        console.log('Adding token to VTT Engine...');
                        window.vttEngine.addToken(message.data);
                    }
                } else if (message.type === 'player_joined') {
                    updatePlayersList(message.display_name, true);
                    appendSystemMessage(`${message.display_name} has joined the game.`);
                    // Update topbar avatars
                    refreshPlayerPresence();
                } else if (message.type === 'online_players') {
                    const playerListElement = document.getElementById('player-list');
                    if (playerListElement) {
                        playerListElement.innerHTML = '';
                        message.players.forEach(p => {
                            const li = document.createElement('li');
                            li.textContent = p.display_name;
                            li.style.cssText = 'padding:4px 0; font-size:0.8rem; border-bottom:1px solid var(--c-border-subtle); color:var(--c-text-secondary);';
                            playerListElement.appendChild(li);
                        });
                    }
                    // Update topbar avatars
                    if (window.UIShell) {
                        window.UIShell.updatePlayerPresence(message.players.map(p => ({...p, online: true})));
                    }
                } else if (message.type === 'player_left') {
                    updatePlayersList(message.display_name, false);
                    appendSystemMessage(`${message.display_name} has left the game.`);
                    refreshPlayerPresence();
                } else if (message.type === 'COMBAT_YOUR_TURN') {
                    handleCombatYourTurn(message);
                    // Show declare FAB
                    if (window.UIShell) window.UIShell.setCombatMode(true);
                }
            } catch (err) {
                console.error('Error processing WebSocket message:', err);
            }
        };

        ws.onclose = () => {
            appendSystemMessage("Disconnected from live game chat. Reconnecting in 5s...");
            setTimeout(() => connectWebSocket(token), 5000);
        };
    }

    function handleCombatYourTurn(message) {
        const overlay = document.getElementById('combat-turn-overlay');
        const overlayTitle = document.getElementById('combat-turn-title');
        const overlayOptions = document.getElementById('combat-turn-options');
        
        if (!overlay) return;
        
        overlayTitle.textContent = message.message;
        overlayOptions.innerHTML = '';
        
        if (message.options && message.options.length > 0) {
            message.options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 text-left p-3 rounded mb-2 transition-colors';
                
                if (opt.recommended) {
                    btn.classList.add('border-green-500', 'bg-slate-800');
                }
                
                btn.innerHTML = `
                    <div class="font-bold text-red-400">${opt.label}</div>
                    <div class="text-sm text-gray-300 mt-1">"${opt.action}"</div>
                    <div class="text-xs text-gray-400 mt-2 flex justify-between">
                        <span>🎲 ${opt.dice_pool}</span>
                        <span>🩸 ${opt.cost || 'None'}</span>
                    </div>
                `;
                
                btn.onclick = () => {
                    const agentChatInput = document.getElementById('agent-chat-input');
                    if (agentChatInput) {
                        agentChatInput.value = opt.action;
                        document.getElementById('send-agent-btn').click();
                    }
                    overlay.classList.add('hidden');
                };
                
                overlayOptions.appendChild(btn);
            });
        } else {
            const p = document.createElement('p');
            p.className = 'text-gray-400 text-sm italic';
            p.textContent = 'No specific options generated. Type your action in the chat.';
            overlayOptions.appendChild(p);
        }
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'mt-4 w-full bg-gray-600 hover:bg-gray-500 p-2 rounded text-sm text-center';
        closeBtn.textContent = 'Decide Manually';
        closeBtn.onclick = () => overlay.classList.add('hidden');
        overlayOptions.appendChild(closeBtn);
        
        overlay.classList.remove('hidden');
    }

    function appendSystemMessage(text) {
        const now = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        const msg = `<div class="chat-msg system-msg animate-slide-in">
            <div class="chat-msg-body">${text}</div>
        </div>`;
        // Write to global chat history
        const el = document.getElementById('global-chat-history');
        if (el) {
            el.insertAdjacentHTML('beforeend', msg);
            el.scrollTop = el.scrollHeight;
        }
    }

    function appendChatMessage(sender, text) {
        const now = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        const senderClass = sender === 'System' ? 'system' :
                            (window.currentUser && sender === (window.currentUser.display_name || window.currentUser.username)) ? 'player' : 'player';
        const msg = `<div class="chat-msg animate-slide-in">
            <div class="chat-msg-header">
                <span class="chat-msg-sender ${senderClass}">${sender}</span>
                <span class="chat-msg-time">${now}</span>
            </div>
            <div class="chat-msg-body">${text}</div>
        </div>`;
        // Write to global chat history
        const el = document.getElementById('global-chat-history');
        if (el) {
            el.insertAdjacentHTML('beforeend', msg);
            el.scrollTop = el.scrollHeight;
        }
    }

    // Refresh player presence avatars in topbar
    function refreshPlayerPresence() {
        if (!window.UIShell) return;
        const players = connectedPlayers.map(name => ({
            display_name: name,
            online: true,
            role: (window.currentUser && name === window.currentUser.username && window.currentUser.role === 'storyteller') ? 'storyteller' : 'player',
        }));
        window.UIShell.updatePlayerPresence(players);
    }

    // Append a beat to the combat feed bar (horizontal scroll)
    function appendCombatBeat(actor, action, result, diceInfo) {
        const feedEl = document.getElementById('combat-feed-scroll');
        if (!feedEl) return;
        const outcomeClass = diceInfo ? (diceInfo.successes > 0 ? 'success' : diceInfo.botch ? 'botch' : 'failure') : '';
        const beat = document.createElement('div');
        beat.className = 'combat-beat animate-slide-in';
        beat.innerHTML = `
            <div class="beat-actor">${actor}</div>
            <div class="beat-action">${action}</div>
            ${diceInfo ? `<div class="beat-result">
                <span class="beat-dice">${diceInfo.pool}d / ${diceInfo.successes}s</span>
                <span class="beat-outcome ${outcomeClass}">${diceInfo.successes > 0 ? `${diceInfo.successes} Succ.` : diceInfo.botch ? 'BOTCH' : 'Fail'}</span>
            </div>` : ''}
            ${!diceInfo && result ? `<div class="beat-action" style="font-style:italic;color:var(--c-text-muted);">${result}</div>` : ''}
        `;
        feedEl.appendChild(beat);
        feedEl.scrollLeft = feedEl.scrollWidth;
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
        const text = msg.text || msg.message;
        if (!text) return; // Do not append if there's no text message

        const globalChatHistory = document.getElementById('global-chat-history');
        if (globalChatHistory) {
            const div = document.createElement('div');
            div.style.marginBottom = '0.5rem';
            div.style.color = '#ff4d4f';
            div.style.fontWeight = 'bold';
            div.textContent = `[Combat] ${text}`;
            globalChatHistory.appendChild(div);
            globalChatHistory.scrollTop = globalChatHistory.scrollHeight;
        }
    }

    // Chat Form Submit
    const sendChatBtn = document.getElementById('global-chat-send');
    const chatInput = document.getElementById('global-chat-input');
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
    if (loginBtn) loginBtn.addEventListener('click', async () => {
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
                const profileRes = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                });
                const userData = await profileRes.json();
                activateShell(userData, data.access_token);
            } else {
                if (window.UIShell) window.UIShell.showToast('Login failed: incorrect username or password', 'error');
                else alert('Login failed: Incorrect username or password');
            }
        } catch (error) {
            console.error('Error during login:', error);
        }
    });

    // Register Handler
    if (registerBtn) {
        registerBtn.addEventListener('click', async () => {
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const displayNameInput = document.getElementById('display_name');

            if (displayNameInput.classList.contains('hidden')) {
                displayNameInput.classList.remove('hidden');
                registerBtn.textContent = 'Create Account';
                if (loginBtn) loginBtn.style.display = 'none';
                if (setupBtn) setupBtn.style.display = 'none';
                return;
            }

            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const display_name = displayNameInput.value.trim();

            if (!username || !password || !display_name) {
                alert("Please fill in all fields (including Display Name).");
                return;
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username,
                        password,
                        display_name
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    localStorage.setItem('access_token', data.access_token);
                    const profileRes = await fetch('/api/auth/me', {
                        headers: { 'Authorization': `Bearer ${data.access_token}` }
                    });
                    const userData = await profileRes.json();
                    activateShell(userData, data.access_token);
                } else {
                    const err = await response.json();
                    alert('Registration failed: ' + (err.detail || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error during registration:', error);
                alert('An error occurred during registration.');
            }
        });
    }



    // Profile Logic
    const profileRoleSelect = document.getElementById('profile-role');
    const profileCharName = document.getElementById('profile-char-name');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const profileSaveMsg = document.getElementById('profile-save-msg');

    if (profileRoleSelect && profileCharName && saveProfileBtn) {
        // Load existing
        profileRoleSelect.value = localStorage.getItem('profile_role') || 'Player';
        profileCharName.value = localStorage.getItem('profile_player_name') || '';

        saveProfileBtn.addEventListener('click', () => {
            localStorage.setItem('profile_role', profileRoleSelect.value);
            localStorage.setItem('profile_player_name', profileCharName.value);
            profileSaveMsg.style.display = 'block';
            setTimeout(() => { profileSaveMsg.style.display = 'none'; }, 3000);

            // Re-render self in player list
            if (window.currentUser) {
                updatePlayersList(window.currentUser.username, false);
                updatePlayersList(window.currentUser.username, true);
            }
        });
    }

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
            deactivateShell();
            if (window.UIShell) window.UIShell.setCombatMode(false);
        });
    }

    // LLM Engine Selector
    const engineSelect = document.getElementById('llm-engine-select');
    if (engineSelect) {
        const savedEngine = localStorage.getItem('llm_engine') || 'qwen2.5-coder:14b';
        engineSelect.value = savedEngine;
        engineSelect.addEventListener('change', (e) => {
            localStorage.setItem('llm_engine', e.target.value);
        });
    }

    // ── Navigation (UIShell handles .nav-item[data-view] clicks)
    // Additional hook: when lore view is shown, init lorekeeper
    let vttBackgroundLoaded = false;
    window.onViewActivated = (viewId) => {
        if (viewId === 'lore' && window.initLorekeeper) window.initLorekeeper();

        // Check if the activated view is 'vtt'
        if (viewId === 'vtt') {
            // Find the wrapper of the canvas
            const vttCanvas = document.getElementById('vtt-canvas');
            if (!vttCanvas) return; // Exit if the canvas element does not exist

            // Get the closest .canvas-container and then its parentElement
            const canvasContainer = vttCanvas.closest('.canvas-container');
            const wrapper = canvasContainer ? canvasContainer.parentElement : vttCanvas.parentElement;
            
            setTimeout(() => {
                if (wrapper && window.vttEngine) {
                    // Call resizeCanvas with the width and height of the wrapper
                    window.vttEngine.resizeCanvas(wrapper.clientWidth, wrapper.clientHeight);

                    // Load background only on the first activation of 'vtt' view
                    if (!vttBackgroundLoaded) {
                        window.vttEngine.setBackground('/media/venice_palace.png', 1, 1);
                        vttBackgroundLoaded = true;
                    }
                }
            }, 100); // Ensure the DOM has fully resolved its layout
        }
    };

    // Legacy sidebar-link compatibility (for any remaining old-style links)
    document.querySelectorAll('.sidebar-link[data-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // Map old panel IDs to new view IDs where possible
            const targetMap = {
                'character-panel': 'character', 'sessions-panel': 'sessions',
                'lore-panel': 'lore', 'brain-panel': 'agents', 'agent-panel': 'agents',
                'vtt-panel': 'vtt', 'st-dashboard-panel': 'st-dashboard',
                'admin-panel': 'admin', 'equipment-db-panel': 'equipment-db',
            };
            const targetId = link.getAttribute('data-target');
            const viewId = targetMap[targetId];
            if (viewId && window.UIShell) window.UIShell.navigateTo(viewId);
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
            
            // Refresh dynamic content for the active tab
            if (typeof renderDynamicTabs === 'function') renderDynamicTabs();
        });
    });

    // Dice Modifier Calculation
    function calculateDiceModifiers() {
        const contextSelect = document.getElementById('dice-context');
        const modifierDisplay = document.getElementById('dice-modifiers');
        if (!contextSelect || !modifierDisplay) return 0;
        
        const context = contextSelect.value;
        let modifier = 0;
        let details = [];

        // 1. Stash (Combat)
        if (context === 'combat' && window.currentStash) {
            const weapons = window.currentStash.filter(i => i.item_type === 'weapon' && i.is_equipped);
            const armors = window.currentStash.filter(i => i.item_type === 'armor' && i.is_equipped);
            weapons.forEach(w => {
                let mod = parseInt(w.bonus) || 0;
                if(mod !== 0) { modifier += mod; details.push(`${w.name} (${mod > 0 ? '+'+mod : mod})`); }
            });
            armors.forEach(a => {
                let pen = parseInt(a.penalty) || 0;
                if(pen < 0) { modifier += pen; details.push(`${a.name} (${pen})`); }
            });
        }

        // 2. Merits & Flaws (General/Social/Mental/Combat)
        // Parse from DOM or window object
        // We'll read the DOM inputs for merits and flaws to be dynamic to the current sheet
        document.querySelectorAll('.merit-item').forEach(item => {
            const name = item.querySelector('.merit-name');
            if (name && name.value) {
                // simple heuristic: if merit name matches context
                if (name.value.toLowerCase().includes(context)) {
                    modifier += 1;
                    details.push(`${name.value} (+1)`);
                }
            }
        });
        document.querySelectorAll('.flaw-item').forEach(item => {
            const name = item.querySelector('.flaw-name');
            if (name && name.value) {
                if (name.value.toLowerCase().includes(context)) {
                    modifier -= 1;
                    details.push(`${name.value} (-1)`);
                }
            }
        });

        if (modifier !== 0) {
            modifierDisplay.textContent = `Active Modifiers: ${modifier > 0 ? '+' + modifier : modifier} [${details.join(', ')}]`;
        } else {
            modifierDisplay.textContent = 'Active Modifiers: None';
        }
        
        return modifier;
    }

    const contextSel = document.getElementById('dice-context');
    if (contextSel) {
        contextSel.addEventListener('change', calculateDiceModifiers);
    }
    const fabDice = document.getElementById('fab-dice');
    if (fabDice) {
        fabDice.addEventListener('click', () => { setTimeout(calculateDiceModifiers, 100); });
    }

    // Dice Roller Handler

    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) {
        rollBtn.addEventListener('click', async () => {
            let basePool = parseInt(document.getElementById('pool-size').value) || 5;
            let diff = parseInt(document.getElementById('difficulty').value) || 6;
            let context = document.getElementById('dice-context') ? document.getElementById('dice-context').value : 'general';
            
            let modifier = 0;
            if (typeof calculateDiceModifiers === 'function') {
                modifier = calculateDiceModifiers();
            }
            
            const finalPool = Math.max(1, basePool + modifier);
            const token = localStorage.getItem('access_token');

            try {
                const response = await fetch('/api/dice/roll', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        pool_size: finalPool,
                        difficulty: diff,
                        specialty: false,
                        context: `Manual Roll (${context})`
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
    async function fetchUsers() {
        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/api/auth/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const users = await res.json();
                window.allUsers = users;
                populateUserDropdowns();
            }
        } catch(e) {
            console.error("Failed to fetch users:", e);
        }
    }

    function populateUserDropdowns() {
        const playerSelect = document.getElementById('sheet-player');
        const stAssignSelect = document.getElementById('st-assign-user-select');
        
        if (window.allUsers) {
            // Sort users: online first, then alphabetically by display name
            const sortedUsers = [...window.allUsers].sort((a, b) => {
                if (a.is_online && !b.is_online) return -1;
                if (!a.is_online && b.is_online) return 1;
                const nameA = (a.display_name || a.username || '').toLowerCase();
                const nameB = (b.display_name || b.username || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
            
            if (playerSelect) {
                const currentVal = playerSelect.value;
                playerSelect.innerHTML = '<option value="">Unassigned</option>';
                sortedUsers.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = (u.display_name || u.username) + (u.is_online ? ' (Online)' : '');
                    if (u.is_online) {
                        opt.style.color = 'var(--c-success, #4caf50)';
                    }
                    playerSelect.appendChild(opt);
                });
                if (currentVal) playerSelect.value = currentVal;
            }
            
            if (stAssignSelect) {
                const currentVal = stAssignSelect.value;
                stAssignSelect.innerHTML = '<option value="">Select Player...</option>';
                sortedUsers.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = (u.display_name || u.username) + (u.is_online ? ' (Online)' : '');
                    if (u.is_online) {
                        opt.style.color = 'var(--c-success, #4caf50)';
                    }
                    stAssignSelect.appendChild(opt);
                });
                if (currentVal) stAssignSelect.value = currentVal;
            }
        }
    }

    async function loadCharacters() {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const response = await fetch('/api/character/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const characters = await response.json();
                const characterSelect = document.getElementById('character-select-dropdown');
                if (characterSelect) {
                    const prevSelected = characterSelect.value;
                    characterSelect.innerHTML = '<option value="">Select Character...</option>';
                    characters.forEach(c => {
                        const option = document.createElement('option');
                        option.value = c.id;
                        option.textContent = `${c.name} (${c.character_type || 'PC'})`;
                        characterSelect.appendChild(option);
                    });
                    // Cleanup previous listener
                    const newSelect = characterSelect.cloneNode(true);
                    characterSelect.replaceWith(newSelect);
                    if (prevSelected) newSelect.value = prevSelected;
                    
                    document.getElementById('character-select-dropdown').addEventListener('change', (e) => {
                        const selectedId = e.target.value;
                        if (selectedId) {
                            const c = characters.find(char => char.id == selectedId);
                            if (c) openCharacterSheet(c);
                        } else {
                            document.getElementById('character-sheet').classList.add('hidden');
                        }
                    });
                }

                // Populate ST Assign Character Select
                const stAssignCharSelect = document.getElementById('st-assign-char-select');
                if (stAssignCharSelect) {
                    stAssignCharSelect.innerHTML = '';
                    characters.forEach(c => {
                        const option = document.createElement('option');
                        option.value = c.id;
                        option.textContent = c.name;
                        stAssignCharSelect.appendChild(option);
                    });
                }

                // Populate Profile Assigned Characters
                const profileAssignedList = document.getElementById('profile-assigned-characters');
                if (profileAssignedList) {
                    profileAssignedList.innerHTML = '';
                    const assignedPCs = characters.filter(c => c.character_type === 'PC' || !c.character_type);
                    if (assignedPCs.length === 0) {
                        profileAssignedList.innerHTML = '<li style="color: #52525b; font-style: italic;">No characters assigned.</li>';
                    } else {
                        assignedPCs.forEach(c => {
                            const li = document.createElement('li');
                            li.textContent = c.name;
                            li.style.cursor = 'pointer';
                            li.addEventListener('click', () => openCharacterSheet(c));
                            profileAssignedList.appendChild(li);
                        });
                    }
                }

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
                dots.forEach(d => { d.classList.remove('filled'); });
                container.dataset.value = "0";
                return;
            }

            dots.forEach((dot, i) => {
                if (i <= index) {
                    dot.classList.add('filled');
                } else {
                    dot.classList.remove('filled');
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
            } else {
                dot.classList.remove('filled');
            }
        });

    }

    function getDots(selector) {
        const container = document.querySelector(`.dot-rating[data-stat="${selector}"]`);
        if (!container) return 0;
        return parseInt(container.dataset.value) || 0;
    }

    window.addCustomListRow = function(category, name='', value=0) {
        const container = document.getElementById(`${category}-primary-list`);
        if (!container) return;
        const index = document.querySelectorAll(`.${category}-custom-name`).length + Date.now(); // unique ID
        const div = document.createElement('div');
        div.className = 'v20-field custom-list-row';
        div.style.marginBottom = '2px';
        div.innerHTML = `
            <input type="text" class="${category}-custom-name" data-index="${index}" value="${name}">
            <div class="dot-rating" data-stat="${category}-custom_${index}" data-value="${value}">
                <span class="dot ${value >= 1 ? 'filled' : ''}" data-val="1"></span>
                <span class="dot ${value >= 2 ? 'filled' : ''}" data-val="2"></span>
                <span class="dot ${value >= 3 ? 'filled' : ''}" data-val="3"></span>
                <span class="dot ${value >= 4 ? 'filled' : ''}" data-val="4"></span>
                <span class="dot ${value >= 5 ? 'filled' : ''}" data-val="5"></span>
            </div>

            <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()" style="margin-left:5px; padding:0 5px; height:24px;">x</button>
        `;
        container.appendChild(div);
    };

    function setCustomList(category, dataObj) {
        const container = document.getElementById(`${category}-primary-list`);
        if (container) {
            container.innerHTML = '';
            let keys = Object.keys(dataObj || {});
            keys.forEach(k => {
                window.addCustomListRow(category, k, dataObj[k]);
            });
            if (keys.length === 0) window.addCustomListRow(category);
        } else {
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
            while(index < 6) { 
                const input = document.querySelector(`.${category}-custom-name[data-index="${index}"]`);
                if (input) { input.value = ''; setDots(`${category}-custom_${index}`, 0); }
                index++;
            }
        }
    }

    function getCustomList(category) {
        let obj = {};
        const inputs = document.querySelectorAll(`.${category}-custom-name`);
        inputs.forEach(input => {
            const name = input.value.trim();
            if (name !== '') {
                const index = input.getAttribute('data-index');
                obj[name] = getDots(`${category}-custom_${index}`);
            }
        });
        return obj;
    }

    
    function createWeaponRow(weapon = {name:'', damage:'', conceal:'', equipped:false}) {
        const div = document.createElement('div');
        div.className = 'weapon-item';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <input type="text" class="weapon-name" placeholder="Name" value="${weapon.name}" style="width: 30%;">
            <input type="text" class="weapon-damage" placeholder="Damage" value="${weapon.damage}" style="width: 20%;">
            <input type="text" class="weapon-conceal" placeholder="Conclude" value="${weapon.conceal}" style="width: 20%;">
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
    if (addWeaponBtn) addWeaponBtn.onclick = () => { const wc = document.getElementById('weapons-container'); if(wc) wc.appendChild(createWeaponRow()); };
    
    const addArmorBtn = document.getElementById('add-armor-btn');
    if (addArmorBtn) addArmorBtn.onclick = () => { const ac = document.getElementById('armor-container'); if(ac) ac.appendChild(createArmorRow()); };

    
function renderDynamicTabs() {
    const isST = window.currentUser && window.currentUser.role === 'st';
    const isLocked = !isST;
    const disabledAttr = isLocked ? 'disabled="true"' : '';

    // Backgrounds Tab
    const bgContainer = document.getElementById('backgrounds-container');
    if (bgContainer && window.currentBackgrounds) {
        bgContainer.innerHTML = '';
        if (window.currentBackgrounds.length === 0) {
            bgContainer.innerHTML = '<p style="color:var(--c-text-muted);">No backgrounds listed.</p>';
        } else {
            window.currentBackgrounds.forEach(bg => {
                if (!bg || !bg.name) return;
                const lore = (window.loreBackgrounds || []).find(b => b.name && b.name.toLowerCase() === bg.name.toLowerCase());
                
                const div = document.createElement('div');
                div.className = 'lore-entry v20-row';
                div.style.marginBottom = '20px';
                
                let html = `<h4>${bg.name} (${bg.level || 0} dots)</h4>`;
                if (lore) {
                    html += `<p><strong>Description:</strong> ${lore.description}</p>`;
                    if (lore.system) html += `<p><strong>System:</strong> ${lore.system}</p>`;
                } else {
                    html += `<p style="color:var(--c-text-muted);">No official description found.</p>`;
                }
                html += `<textarea class="v20-textarea" placeholder="Player comments or specific details..." style="width:100%; height:30px; margin-top:10px;" ${disabledAttr}></textarea>`;
                div.innerHTML = html;
                bgContainer.appendChild(div);
            });
        }
    }

    // Disciplines Tab
    const discContainer = document.getElementById('disciplines-container');
    if (discContainer && window.currentDisciplines) {
        discContainer.innerHTML = '';
        if (window.currentDisciplines.length === 0) {
            discContainer.innerHTML = '<p style="color:var(--c-text-muted);">No disciplines listed.</p>';
        } else {
            window.currentDisciplines.forEach(disc => {
                if (!disc || !disc.name) return;
                const lore = (window.loreDisciplines || []).find(d => d.name && d.name.toLowerCase() === disc.name.toLowerCase());
                
                const div = document.createElement('div');
                div.className = 'lore-entry';
                div.style.marginBottom = '20px';
                
                let html = `<h4>${disc.name} (${disc.level} dots)</h4>`;
                if (lore) {
                    html += `<p><strong>Description:</strong> ${lore.description}</p>`;
                    let levels = [];
                    try { levels = JSON.parse(lore.levels_json); } catch(e){}
                    
                    for (let lvl=0; lvl<disc.level; lvl++) {
                        if (levels[lvl]) {
                            html += `<div style="margin-left: 15px; margin-top: 10px; border-left: 2px solid var(--c-gold-300); padding-left: 10px;">
                                <h5>Level ${lvl+1}: ${levels[lvl].name}</h5>
                                <p>${levels[lvl].description}</p>
                                <p><strong>System:</strong> ${levels[lvl].system}</p>
                            </div>`;
                        }
                    }
                } else {
                    html += `<p style="color:var(--c-text-muted);">No official description found.</p>`;
                }
                div.innerHTML = html;
                discContainer.appendChild(div);
            });
        }
    }
}


    // === V20 Expanded Functions ===

    window.addMeritFlaw = function(type) {
        const container = document.getElementById(type + 's-list');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'v20-row ' + type + '-item';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <input type="text" class="${type}-name v20-input" placeholder="Name" style="width:50%;">
            <input type="number" class="${type}-cost v20-input" placeholder="Cost" style="width:20%;">
            <input type="text" class="${type}-desc v20-input" placeholder="Short description" style="width:30%;">
        `;
        container.appendChild(div);
    };

    window.addRitual = function() {
        const container = document.getElementById('rituals-list');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'v20-row ritual-item';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <input type="text" class="ritual-name v20-input" placeholder="Ritual Name" style="width:50%;">
            <input type="number" class="ritual-level v20-input" placeholder="Level" style="width:20%;">
            <input type="text" class="ritual-school v20-input" placeholder="School" style="width:30%;">
        `;
        container.appendChild(div);
    };

    window.addBloodBond = function() {
        const container = document.getElementById('blood-bonds-container');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'v20-row bond-item';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <input type="text" class="bond-target v20-input" placeholder="Regnant/Thrall" style="width:50%;">
            <input type="number" class="bond-rating v20-input" placeholder="Level (1-3)" style="width:20%;" min="1" max="3">
            <input type="text" class="bond-type v20-input" placeholder="Type (Regnant/Thrall)" style="width:30%;">
        `;
        container.appendChild(div);
    };

    window.addVaulderie = function() {
        const container = document.getElementById('vaulderie-container');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'v20-row vaulderie-item';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <input type="text" class="vaulderie-target v20-input" placeholder="Pack Member" style="width:70%;">
            <input type="number" class="vaulderie-rating v20-input" placeholder="Rating (1-10)" style="width:30%;" min="1" max="10">
        `;
        container.appendChild(div);
    };

    window.addBoon = function(dir) {
        const container = document.getElementById('boons-owed-' + dir + '-container');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'v20-row boon-' + dir + '-item';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <input type="text" class="boon-target v20-input" placeholder="Character" style="width:30%;">
            <input type="text" class="boon-type v20-input" placeholder="Type (Trivial, Minor...)" style="width:30%;">
            <input type="text" class="boon-desc v20-input" placeholder="Description" style="width:40%;">
        `;
        container.appendChild(div);
    };

    async function loadXPLedger() {
        if (!window.currentCharacterId) return;
        try {
            const res = await fetch('/api/character/' + window.currentCharacterId + '/xp');
            if (res.ok) {
                const data = await res.json();
                const tbody = document.getElementById('xp-ledger-tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                    let total = 0;
                    let spent = 0;
                    data.ledger.forEach(l => {
                        if (l.type === 'gained') total += l.amount;
                        if (l.type === 'spent') spent += l.amount;
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${l.date ? new Date(l.date).toLocaleDateString() : '-'}</td>
                            <td>${l.description}</td>
                            <td style="color:${l.type==='gained'?'green':'red'}">${l.type.toUpperCase()}</td>
                            <td>${l.amount}</td>
                        `;
                        tbody.appendChild(tr);
                    });
                    document.getElementById('xp-total-display').innerText = total;
                    document.getElementById('xp-spent-display').innerText = spent;
                    document.getElementById('xp-unspent-display').innerText = total - spent;
                }
            }
        } catch(e) {
            console.error("Failed to load XP ledger", e);
        }
    }

    function openCharacterSheet(character) {
        fetchUsers();
        window.currentCharacterId = character.id;
        const sheet = document.getElementById('character-sheet');
        sheet.classList.remove('hidden');
        
        const setValSafe = (id, val) => { const e = document.getElementById(id); if (e) e.value = val; };

    // Re-render when switching to certain tabs
    document.querySelectorAll('.sheet-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetTab = e.target.getAttribute('data-tab');
            if (targetTab === 'tab-backgrounds' || targetTab === 'tab-powers') {
                if (typeof renderDynamicTabs === 'function') renderDynamicTabs();
            }

            if (targetTab === 'tab-experience') {
                if (typeof loadXPLedger === 'function') loadXPLedger();
            }

        });
    });

        setValSafe('sheet-image-url', character.image_url || '');
        setValSafe('sheet-token-url', character.token_url || '');
        setValSafe('sheet-name', character.name || '');
        setValSafe('sheet-player', character.user_id || '');
        setValSafe('sheet-chronicle', character.chronicle || '');
        
        let stash = [];
        try { if (character.equipment_json) stash = JSON.parse(character.equipment_json); } catch(e){}
        if (!Array.isArray(stash)) stash = stash.stash || [];
        window.currentStash = stash;
        if (typeof window.renderStash === 'function') window.renderStash();
        
        const isST = window.currentUser && window.currentUser.role === 'st';
        // Always lock for non-storytellers per user request
        const isLocked = !isST;
        const elementsToDisable = sheet.querySelectorAll('input, textarea, button, select');
        elementsToDisable.forEach(el => {
            if (el.id !== 'close-sheet-btn' && el.id !== 'suggest-actions-btn' && el.id !== 'st-sheet-assign-btn' && !el.classList.contains('sheet-tab-btn')) {
                el.disabled = isLocked;
            }
        });
        
        const saveBtn = document.getElementById('save-character-sheet-btn');
        if (saveBtn) {
            saveBtn.style.display = isLocked ? 'none' : 'inline-block';
        }

        const dotRatings = sheet.querySelectorAll('.dot-rating');
        dotRatings.forEach(dr => {
            if (isLocked) dr.setAttribute('disabled', 'true');
            else dr.removeAttribute('disabled');
        });

        // ST Assign Section
        const assignSection = document.getElementById('st-sheet-assign-section');
        const assignSelect = document.getElementById('st-sheet-assign-select');
        if (assignSection && assignSelect) {
            if (isST) {
                assignSection.style.display = 'inline-block';
                // Copy users from the main ST dashboard select, or re-fetch. Since loadUsers populates st-assign-user-select, we can clone it.
                const mainSelect = document.getElementById('st-assign-user-select');
                if (mainSelect) {
                    assignSelect.innerHTML = mainSelect.innerHTML;
                    if (character.user_id) assignSelect.value = character.user_id;
                }
            } else {
                assignSection.style.display = 'none';
            }
        }

        // Header
        const setVal = (id, val) => { const e=document.getElementById(id); if(e) e.value = val; };
        setVal('sheet-name', character.name || '');
        setVal('sheet-player', character.user_id || '');
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

        let discParsed = parseJson(character.disciplines_json);
        if (!Array.isArray(discParsed) && typeof discParsed === 'object') {
            // Migrating old format to array
            discParsed = Object.keys(discParsed).map(k => ({ name: k, level: discParsed[k] }));
        }
        window.currentDisciplines = discParsed || [];
        const discDict = {};
        window.currentDisciplines.forEach(d => { discDict[d.name] = d.level; });
        setCustomList('disciplines', discDict);

        let bgParsed = parseJson(character.backgrounds_json);
        if (!Array.isArray(bgParsed) && typeof bgParsed === 'object') {
            bgParsed = Object.keys(bgParsed).map(k => ({ name: k, level: bgParsed[k] }));
        }
        window.currentBackgrounds = bgParsed || [];
        const bgDict = {};
        window.currentBackgrounds.forEach(b => { bgDict[b.name] = b.level; });
        setCustomList('backgrounds', bgDict);
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
        if (wContainer) {
            wContainer.innerHTML = '';
            if (eq.weapons) eq.weapons.forEach(w => wContainer.appendChild(createWeaponRow(w)));
        }
        
        const aContainer = document.getElementById('armor-container');
        if (aContainer) {
            aContainer.innerHTML = '';
            if (eq.armor) eq.armor.forEach(a => aContainer.appendChild(createArmorRow(a)));
        }
        
        setVal('sheet-gear', eq.gear || '');

        const meritsFlaws = parseJson(character.merits_flaws_json);
        window.currentMeritsFlaws = Array.isArray(meritsFlaws) ? meritsFlaws : [];
        if (Array.isArray(meritsFlaws)) {
            // Ingested Array format
            const meritsText = meritsFlaws.filter(m => m.type === 'merit').map(m => `${m.name} (${m.cost})`).join('\n');
            const flawsText = meritsFlaws.filter(m => m.type === 'flaw').map(m => `${m.name} (${m.cost})`).join('\n');
            setVal('sheet-merits', meritsText);
            setVal('sheet-flaws', flawsText);
            
            // Populate Merits Tab lists
            const mList = document.getElementById('merits-list');
            const fList = document.getElementById('flaws-list');
            if (mList) {
                mList.innerHTML = '';
                meritsFlaws.filter(m => m.type === 'merit').forEach(m => {
                    const div = document.createElement('div');
                    div.className = 'v20-row merit-item';
                    div.style.marginBottom = '5px';
                    div.innerHTML = `
                        <input type="text" class="merit-name v20-input" value="${m.name}" style="width:50%;">
                        <input type="text" class="merit-cost v20-input" value="${m.cost}" style="width:20%;">
                        <input type="text" class="merit-desc v20-input" value="${m.desc || ''}" style="width:30%;">
                    `;
                    mList.appendChild(div);
                });
            }
            if (fList) {
                fList.innerHTML = '';
                meritsFlaws.filter(m => m.type === 'flaw').forEach(f => {
                    const div = document.createElement('div');
                    div.className = 'v20-row flaw-item';
                    div.style.marginBottom = '5px';
                    div.innerHTML = `
                        <input type="text" class="flaw-name v20-input" value="${f.name}" style="width:50%;">
                        <input type="text" class="flaw-cost v20-input" value="${f.cost}" style="width:20%;">
                        <input type="text" class="flaw-desc v20-input" value="${f.desc || ''}" style="width:30%;">
                    `;
                    fList.appendChild(div);
                });
            }
        } else {
            // Old Dictionary format fallback
            setVal('sheet-merits', meritsFlaws.merits || '');
            setVal('sheet-flaws', meritsFlaws.flaws || '');
        }
        setVal('sheet-notes', character.notes || '');

        const saveButton = document.getElementById('save-character-sheet-btn');
        if (saveButton) {
            saveButton.onclick = () => saveCharacterSheet(character.id);
            if (isLocked) saveButton.style.display = 'none';
            else saveButton.style.display = 'inline-block';
        }
        
        const closeBtn = document.getElementById('close-sheet-btn');
        if (closeBtn) closeBtn.onclick = () => document.getElementById('character-sheet').classList.add('hidden');
        
        const sheetAssignBtn = document.getElementById('st-sheet-assign-btn');
        if (sheetAssignBtn) {
            sheetAssignBtn.onclick = async () => {
                const userId = document.getElementById('st-sheet-assign-select').value;
                if (!userId) return;
                const token = localStorage.getItem('access_token');
                try {
                    const res = await fetch(`/api/character/${character.id}/assign`, {
                        method: 'PUT',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}` 
                        },
                        body: JSON.stringify({ user_id: parseInt(userId) })
                    });
                    if (res.ok) {
                        alert('Character successfully assigned to player!');
                        loadCharacters();
                    } else {
                        const err = await res.json();
                        alert('Error assigning character: ' + (err.detail || res.status));
                    }
                } catch (error) {
                    console.error('Error assigning character:', error);
                    alert('Network error while assigning character.');
                }
            };
        }

        loadCharacterImages(character.name);
        updateSidebarQuickStats(character);
    }

    async function loadCharacterImages(charName) {
        if (!charName) return;
        const container = document.getElementById('character-images-container');
        if (!container) return;
        container.innerHTML = '<p style="color:var(--c-text-muted);">Loading media...</p>';

        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/api/media/list', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) throw new Error("Failed to load media");
            const data = await res.json();
            
            const normalizedName = charName.toLowerCase().replace(/\s+/g, '');
            const charImages = data.media.filter(m => {
                if (!m.tags) return false;
                return m.tags.some(tag => {
                    const cleanTag = tag.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '');
                    return cleanTag === normalizedName;
                });
            });

            container.innerHTML = '';
            if (charImages.length === 0) {
                container.innerHTML = '<p style="color:var(--c-text-muted);">No images tagged with #' + normalizedName + ' found.</p>';
                return;
            }

            charImages.forEach(img => {
                const wrapper = document.createElement('div');
                wrapper.style = "display:flex; flex-direction:column; align-items:center; gap:5px;";
                const el = document.createElement('img');
                el.src = img.url;
                el.style = "max-width: 200px; max-height: 200px; border-radius: 4px; border: 1px solid var(--c-border-medium);";
                
                const btn = document.createElement('button');
                btn.className = "btn btn-secondary btn-sm";
                btn.textContent = "Use as Portrait";
                btn.onclick = () => { document.getElementById('sheet-image-url').value = img.url; };

                const btn2 = document.createElement('button');
                btn2.className = "btn btn-secondary btn-sm";
                btn2.textContent = "Use as Token";
                btn2.onclick = () => { document.getElementById('sheet-token-url').value = img.url; };

                wrapper.appendChild(el);
                
                const controls = document.createElement('div');
                controls.style = "display:flex; gap:5px;";
                controls.appendChild(btn);
                controls.appendChild(btn2);
                wrapper.appendChild(controls);

                container.appendChild(wrapper);
            });
        } catch (e) {
            console.error(e);
            container.innerHTML = '<p style="color:var(--c-red-500);">Error loading images.</p>';
        }
    }

    function updateSidebarQuickStats(character) {
        const statsPanel = document.getElementById('sidebar-quick-stats');
        if (!statsPanel) return;
        
        statsPanel.style.display = 'block';
        const nameEl = document.getElementById('quick-stat-char-name');
        if (nameEl) nameEl.textContent = character.name;

        // Health
        let healthJson = {};
        if (character.health_json) {
            try { healthJson = JSON.parse(character.health_json); } catch(e) {}
        }
        let damageCount = 0;
        ['bruised', 'hurt', 'injured', 'wounded', 'mauled', 'crippled', 'incapacitated'].forEach(lvl => {
            if (healthJson[lvl]) damageCount++;
        });
        
        const healthContainer = document.getElementById('qs-health');
        if (healthContainer) {
            healthContainer.innerHTML = '';
            for (let i = 0; i < 7; i++) {
                const dot = document.createElement('span');
                dot.classList.add('dot');
                if (i < (7 - damageCount)) {
                    dot.classList.add('filled');
                    dot.textContent = '●';
                } else {
                    dot.textContent = '○';
                }
                healthContainer.appendChild(dot);
            }
        }

        // Blood
        const maxBlood = character.blood_pool_max || 10;
        const currentBlood = character.blood_pool_current || 10;
        const bloodContainer = document.getElementById('qs-blood');
        if (bloodContainer) {
            bloodContainer.innerHTML = '';
            for (let i = 0; i < maxBlood; i++) {
                const dot = document.createElement('span');
                dot.classList.add('dot');
                if (i < currentBlood) {
                    dot.classList.add('filled');
                    dot.classList.add('animate-blood-flash');
                    dot.textContent = '●';
                } else {
                    dot.textContent = '○';
                }
                bloodContainer.appendChild(dot);
            }
        }

        // Willpower
        const maxWp = character.willpower_max || 1;
        const currentWp = character.willpower_current || 1;
        const wpContainer = document.getElementById('qs-willpower');
        if (wpContainer) {
            wpContainer.innerHTML = '';
            for (let i = 0; i < maxWp; i++) {
                const dot = document.createElement('span');
                dot.classList.add('dot');
                if (i < currentWp) {
                    dot.classList.add('filled');
                    dot.textContent = '●';
                } else {
                    dot.textContent = '○';
                }
                wpContainer.appendChild(dot);
            }
        }
        
        // XP
        const xpContainer = document.getElementById('qs-xp');
        if (xpContainer) {
            xpContainer.textContent = character.experience || 0;
        }
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

            const getMeritsFlaws = () => {
                let list = [];
                document.querySelectorAll('.merit-item').forEach(el => {
                    list.push({
                        type: 'merit',
                        name: el.querySelector('.merit-name').value,
                        cost: el.querySelector('.merit-cost').value,
                        desc: el.querySelector('.merit-desc').value
                    });
                });
                document.querySelectorAll('.flaw-item').forEach(el => {
                    list.push({
                        type: 'flaw',
                        name: el.querySelector('.flaw-name').value,
                        cost: el.querySelector('.flaw-cost').value,
                        desc: el.querySelector('.flaw-desc').value
                    });
                });
                return list;
            };

            const meritsFlaws = getMeritsFlaws();

            const bodyData = {
                name: document.getElementById('sheet-name').value,
                user_id: document.getElementById('sheet-player').value ? parseInt(document.getElementById('sheet-player').value) : null,
                chronicle: document.getElementById('sheet-chronicle').value,
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
                notes: document.getElementById('sheet-notes').value,
                image_url: document.getElementById('sheet-image-url').value,
                token_url: document.getElementById('sheet-token-url').value
            };

            const equipment_json = JSON.stringify(window.currentStash || []);
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
            
            const wc = document.getElementById('weapons-container'); if(wc) wc.innerHTML = '';
            const ac = document.getElementById('armor-container'); if(ac) ac.innerHTML = '';
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
        console.log("loadCombatState starting. window.combatEncounterId:", window.combatEncounterId, "localStorage combat_encounter_id:", localStorage.getItem('combat_encounter_id'), "token:", token);
        if (!window.combatEncounterId || !token) {
            console.log("loadCombatState early exit! window.combatEncounterId:", window.combatEncounterId, "token:", token);
            if (setupPhase) setupPhase.classList.add('hidden');
            if (initiativePhase) initiativePhase.classList.add('hidden');
            if (activePhase) activePhase.classList.add('hidden');
            if (startNewCombatBtn) startNewCombatBtn.classList.remove('hidden');
            const stateInfo = document.getElementById('combat-state-info');
            if (stateInfo) stateInfo.innerHTML = "No active encounter.";
            return;
        }

        try {
            const response = await fetch(`/api/combat/${window.combatEncounterId}`, {
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
            window.currentCombatState = data;
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
                            window.populateCharacterSelect(charSelect, chars);
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
                                await fetch(`/api/combat/${window.combatEncounterId}/roll-initiative`, {
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

            } else if (data.phase === 'active' || data.phase === 'celerity_active') {
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
    
    if (endCombatBtn) {
        endCombatBtn.addEventListener('click', async () => {
            const token = localStorage.getItem('access_token');
            try {
                await fetch(`/api/combat/${window.combatEncounterId}/end`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (ws) ws.send(JSON.stringify({ type: 'combat', text: 'Combat ended!' }));
                combatEncounterId = null;
                localStorage.removeItem('combat_encounter_id');
                window.currentCombatState = null;
                loadCombatState();
            } catch (err) { console.error(err); }
        });
    }
    const declareActionInput = document.getElementById('action-declaration-input');
    const sendActionBtn = document.getElementById('send-action-btn');

    function sendDeclaredAction() {
        if (!window.currentCombatState || !window.currentCombatState.combatants) return;
        const state = window.currentCombatState;
        const currentChar = state.combatants[state.current_turn_index];
        if (!currentChar) return;
        
        const actionText = declareActionInput.value.trim();
        if (!actionText) return;

        if (window.ws) {
            window.ws.send(JSON.stringify({
                type: "chat",
                sender_name: "System",
                text: `[Action Declaration] ${currentChar.name} declares: ${actionText}`
            }));
        }
    }

    if (sendActionBtn) {
        sendActionBtn.addEventListener('click', sendDeclaredAction);
    }
    if (declareActionInput) {
        declareActionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendDeclaredAction();
        });
    }

    const proposeActionBtn = document.getElementById('propose-action-btn');
    if (proposeActionBtn) {
        proposeActionBtn.addEventListener('click', async () => {
            if (!window.currentCombatState || !window.currentCombatState.combatants) return;
            const state = window.currentCombatState;
            const currentChar = state.combatants[state.current_turn_index];
            if (!currentChar) return;

            proposeActionBtn.disabled = true;
            proposeActionBtn.textContent = 'Thinking...';
            try {
                const inputVal = document.getElementById('action-declaration-input').value;
                const charId = currentChar.character_id;
                const token = localStorage.getItem('access_token');
                
                const response = await fetch(`/api/combat/${window.combatEncounterId}/resolve-action-llm`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ character_id: charId, action_description: inputVal, engine: "gemini" })
                });
                
                if (!response.ok) throw new Error('Network response was not ok');
                const data = await response.json();
                
                proposeActionBtn.textContent = 'Propose Options (Brain)';
                proposeActionBtn.disabled = false;
                
                const actionOptionsContainer = document.getElementById('action-options-container');
                actionOptionsContainer.innerHTML = '';
                
                data.forEach(option => {
                    const button = document.createElement('button');
                    button.textContent = `${option.description} (Pool: ${option.pool}, Diff: ${option.difficulty})`;
                    button.style.marginBottom = '0.5rem';
                    button.style.background = '#4ade80';
                    button.style.color = '#121212';
                    button.addEventListener('click', async () => {
                        const result = await window.diceEngine.rollDice(option.pool, option.difficulty);
                        if (ws) {
                            ws.send(JSON.stringify({
                                type: "chat",
                                sender_name: "System",
                                text: `[Action Resolution] ${currentChar.name} did: ${option.description} | Pool: ${option.pool} | Diff: ${option.difficulty} -> Successes: ${result.successes}`
                            }));
                        }
                        actionOptionsContainer.innerHTML = '';
                        document.getElementById('action-declaration-input').value = '';
                    });
                    actionOptionsContainer.appendChild(button);
                });
            } catch (error) {
                console.error(error);
                proposeActionBtn.textContent = 'Propose Options (Brain)';
                proposeActionBtn.disabled = false;
            }
        });
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
            await fetch(`/api/combat/${window.combatEncounterId}/add-character`, {
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

            await fetch(`/api/combat/${window.combatEncounterId}/generate-npc`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nameInput.value, concept: conceptInput.value, character_type: "NPC_Critter" })
            });
            
            btn.textContent = oldText;
            btn.disabled = false;
            nameInput.value = '';
            
            alert('NPC Generated!');
            loadCombatState();
            conceptInput.value = '';
            loadCombatState();
        });
    }

    if (rollInitiativesBtn) {
        rollInitiativesBtn.addEventListener('click', async () => {
            const token = localStorage.getItem('access_token');
            await fetch(`/api/combat/${window.combatEncounterId}/phase`, {
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
            await fetch(`/api/combat/${window.combatEncounterId}/phase`, {
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
    window.handleVttUpdate = function(data) {
        if (!window.vttEngine || !window.vttEngine.canvas) return;
        let vttCanvas = window.vttEngine.canvas;
        const existingObj = vttCanvas.getObjects().find(o => o.id === data.id);
        if (existingObj) {
            existingObj.set(data);
            existingObj.setCoords();
            vttCanvas.renderAll();
        } else {
            if (window.fabric) {
                window.fabric.util.enlivenObjects([data], function(objects) {
                    objects.forEach(function(o) {
                        vttCanvas.add(o);
                    });
                });
            }
        }
    };

    // --- Lorekeeper Chat Logic ---
    let hasLoreInitialized = false;
    const toggleIngestLoreBtn = document.getElementById('toggle-ingest-lore-btn');
    const syncGraphBtn = document.getElementById('sync-graph-btn');
    const loreIngestArea = document.getElementById('lore-ingest-area');
    const ingestLoreBtn = document.getElementById('ingest-lore-btn');
    const sendLoreBtn = document.getElementById('send-lore-btn');
    const resetLoreBtn = document.getElementById('reset-lore-btn');
    const loreChatInput = document.getElementById('lore-chat-input');
    const loreChatHistory = document.getElementById('lore-chat-history');

    if (toggleIngestLoreBtn && loreIngestArea) {
        toggleIngestLoreBtn.addEventListener('click', () => {
            loreIngestArea.style.display = loreIngestArea.style.display === 'none' ? 'block' : 'none';
        });
    }

    if (syncGraphBtn) {
        syncGraphBtn.addEventListener('click', async () => {
            if (!confirm("Warning: Syncing the massive Graph Database will process 400+ files locally. This may take hours and will heavily utilize your GPU. Do you wish to proceed?")) return;
            
            try {
                const token = localStorage.getItem('access_token');
                const res = await fetch('/api/admin/sync-graph', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (res.ok) {
                    alert("Graph Database sync initiated in the background. Check server logs for progress.");
                } else {
                    alert("Failed to start sync.");
                }
            } catch (e) {
                alert("Error: " + e.message);
            }
        });
    }

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
                loreIngestArea.style.display = 'none';
            }
        });
    }

    const sendLoreMessage = async (messageText) => {
        if (!messageText) return;
        const token = localStorage.getItem('access_token');
        
        // Add user message to UI if it's not the initial hidden prompt
        if (!messageText.includes("overall story summary of our chronicle")) {
            loreChatHistory.innerHTML += `<div style="margin:10px 0;text-align:right"><span style="background:#fca5a5;color:#000;padding:5px 10px;border-radius:10px;display:inline-block;">${messageText}</span></div>`;
        }

        const loadingId = 'loading-lore-' + Date.now();
        loreChatHistory.innerHTML += `<div id="${loadingId}" style="margin:10px 0;text-align:left"><span style="background:#3a1a1a;padding:5px 10px;border-radius:10px;display:inline-block;">Lorekeeper is thinking...</span></div>`;
        loreChatHistory.scrollTop = loreChatHistory.scrollHeight;

        try {
            const res = await fetch('/api/agents/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ message: "ROUTE: lore_agent, QUERY: " + messageText })
            });

            const data = await res.json();
            document.getElementById(loadingId)?.remove();

            if (res.ok) {
                let reply = data.reply || "No response";

                // Parse options natively from REST response
                let optionsHtml = '';
                const optionsArray = data.options || [];
                if (optionsArray.length > 0) {
                    optionsHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">';
                    optionsArray.forEach((opt, i) => {
                        const btnId = 'lore-opt-' + Date.now() + '-' + i;
                        optionsHtml += `<button id="${btnId}" class="lore-action-btn" data-action="${(opt.action || opt.label || '').replace(/"/g, '&quot;')}" style="background:linear-gradient(135deg,#4a1a2e,#2a1a3e);color:#f0d0a0;border:1px solid #8b4513;padding:10px 16px;border-radius:8px;cursor:pointer;text-align:left;min-width:200px;transition:all 0.2s;font-size:13px;"><strong>${opt.label || 'Action'}</strong></button>`;
                    });
                    optionsHtml += '</div>';
                }

                // Render narrative + buttons
                const narrativeDiv = document.createElement('div');
                narrativeDiv.style.cssText = 'margin:10px 0;text-align:left;';
                narrativeDiv.innerHTML = `<span style="background:#1a1a24;padding:10px 14px;border-radius:10px;display:inline-block;border:1px solid #3a1a1a;max-width:90%;line-height:1.5;">${reply.replace(/\\n/g, '<br>').replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')}</span>${optionsHtml}`;
                loreChatHistory.appendChild(narrativeDiv);

                // Wire up button clicks
                narrativeDiv.querySelectorAll('.lore-action-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const action = btn.getAttribute('data-action');
                        sendLoreMessage(action);
                    });
                    btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.03)'; btn.style.borderColor = '#d4a040'; });
                    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; btn.style.borderColor = '#8b4513'; });
                });
            } else {
                loreChatHistory.innerHTML += `<div style="color:red">Error: ${data.detail}</div>`;
            }
            loreChatHistory.scrollTop = loreChatHistory.scrollHeight;
        } catch(e) {
            document.getElementById(loadingId)?.remove();
            loreChatHistory.innerHTML += `<div style="color:red">Network Error: ${e.message}</div>`;
        }
    };

    if (sendLoreBtn && loreChatInput) {
        sendLoreBtn.addEventListener('click', () => {
            const text = loreChatInput.value.trim();
            if (text) {
                sendLoreMessage(text);
                loreChatInput.value = '';
            }
        });
        loreChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendLoreBtn.click();
            }
        });
    }

    if (resetLoreBtn) {
        resetLoreBtn.addEventListener('click', () => {
            loreChatHistory.innerHTML = '';
            hasLoreInitialized = false;
        });
    }

    window.initLorekeeper = function() {
        if (!hasLoreInitialized && loreChatHistory) {
            hasLoreInitialized = true;
            sendLoreMessage("Provide an overall story summary of our chronicle so far, welcome the user, and ask which particular topic they want to talk about. Ensure you include 1-3 suggested follow-up topics as buttons using the <OPTIONS> JSON array format.");
        }
    };

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
        // no domain needed
        if(!text) return;

        const token = localStorage.getItem('access_token');

        brainHistory.push({role: 'user', parts: [text]});
        if(brainChatHistory) brainChatHistory.innerHTML += `<div style="margin:10px 0;text-align:right"><span style="background:#4ade80;color:#000;padding:5px 10px;border-radius:10px;display:inline-block;">${text}</span></div>`;
        brainChatInput.value = '';

        const loadingId = 'loading-' + Date.now();
        if(brainChatHistory) {
            brainChatHistory.innerHTML += `<div id="${loadingId}" style="margin:10px 0;text-align:left"><span style="background:#3a1a1a;padding:5px 10px;border-radius:10px;display:inline-block;">Loading response...</span></div>`;
            brainChatHistory.scrollTop = brainChatHistory.scrollHeight;
        }

        try {
            const res = await fetch('/api/brain/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
                body: JSON.stringify({history: brainHistory})
            });

            if (!res.ok) {
                const errorData = await res.json().catch(()=>({}));
                throw new Error(errorData.detail || `Server returned ${res.status}`);
            }

            const data = await res.json();
            const loader = document.getElementById(loadingId);
            if(loader) loader.remove();

            function simpleMarkdown(text) {
                // Replace bold markdown
                text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                // Replace italic markdown
                text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
                // Replace code markdown
                text = text.replace(/`(.*?)`/g, '<code>$1</code>');
                // Replace newlines with <br>
                text = text.replace(/\n/g, '<br>');
                return text;
            }

            const reply = data.response || "Error";
            brainHistory.push({role: 'model', parts: [reply]});
            if(brainChatHistory) {
                brainChatHistory.innerHTML += `<div style="margin:10px 0;text-align:left"><span style="background:#1a1a24;padding:5px 10px;border-radius:10px;display:inline-block;border:1px solid #3a1a1a;">${simpleMarkdown(reply)}</span></div>`;
                brainChatHistory.scrollTop = brainChatHistory.scrollHeight;
            }
        } catch(e) {
            const loader = document.getElementById(loadingId);
            if(loader) loader.remove();
            if(brainChatHistory) brainChatHistory.innerHTML += `<div style="color:red">Error reaching brain: ${e.message}</div>`;
        }
    });

    brainChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendBrainBtn.click();
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

    // Auto-save character assignment when changed in the character sheet
    const sheetPlayerSelect = document.getElementById('sheet-player');
    if (sheetPlayerSelect) {
        sheetPlayerSelect.addEventListener('change', async (e) => {
            const charId = window.currentCharacterId;
            const userId = e.target.value;
            if (!charId) return;

            const token = localStorage.getItem('access_token');
            const payload = userId ? { user_id: parseInt(userId) } : { user_id: null };

            try {
                const res = await fetch(`/api/character/${charId}/assign`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    console.log(`Character ${charId} assigned to user ${userId}`);
                } else {
                    console.error('Failed to assign character');
                }
            } catch (err) {
                console.error('Error assigning character:', err);
            }
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

    // Storyteller User Management
    async function loadUsers() {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const response = await fetch('/api/auth/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const users = await response.json();
                const stAssignUserSelect = document.getElementById('st-assign-user-select');
                if (stAssignUserSelect) {
                    stAssignUserSelect.innerHTML = '';
                    users.forEach(u => {
                        const option = document.createElement('option');
                        option.value = u.id;
                        option.textContent = u.display_name || u.username;
                        stAssignUserSelect.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    const stAssignForm = document.getElementById('st-assign-character-form');
    if (stAssignForm) {
        stAssignForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const charId = document.getElementById('st-assign-char-select').value;
            const userId = document.getElementById('st-assign-user-select').value;
            if (!charId || !userId) return;

            const token = localStorage.getItem('access_token');
            try {
                const res = await fetch(`/api/character/${charId}/assign`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify({ user_id: parseInt(userId) })
                });
                if (res.ok) {
                    alert('Character successfully assigned!');
                    loadCharacters(); // reload to reflect changes
                } else {
                    const err = await res.json();
                    alert('Error assigning character: ' + (err.detail || res.status));
                }
            } catch (error) {
                console.error('Error assigning character:', error);
                alert('Network error while assigning character.');
            }
        });
    }

    // Equipment Database UI
    async function loadEquipmentCatalog() {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const response = await fetch('/api/equipment/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const catalog = await response.json();
                window.equipmentCatalog = catalog; // store for stash access

                // Group items by type and then by era
                const groupedCatalog = catalog.reduce((acc, item) => {
                    const type = item.type || 'Other';
                    const era = item.era || 'General';

                    if (!acc[type]) acc[type] = {};
                    if (!acc[type][era]) acc[type][era] = [];
                    acc[type][era].push(item);
                    return acc;
                }, {});

                const container = document.getElementById('equipment-catalog-list');
                if (container) {
                    container.innerHTML = Object.keys(groupedCatalog).map(type => `
                        <div class="catalog-type" style="margin-bottom: 20px;">
                            <h3 style="color: var(--c-gold-300); margin-top: 0;">${type}</h3>
                            ${Object.keys(groupedCatalog[type]).map(era => `
                                <details style="background: var(--c-bg-600); padding: 10px; border-radius: 5px; border: 1px solid var(--c-border-medium); margin-top: 10px;">
                                    <summary style="cursor: pointer; color: var(--c-text-primary); font-weight:bold;">${era}</summary>
                                    <table class="data-table" style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: var(--text-sm);">
                                        <thead>
                                            <tr>
                                                <th style="padding: 5px; border-bottom: 1px solid var(--c-border-strong); text-align: left;">Name</th>
                                                <th style="padding: 5px; border-bottom: 1px solid var(--c-border-strong); text-align: left;">Damage</th>
                                                <th style="padding: 5px; border-bottom: 1px solid var(--c-border-strong); text-align: left;">Range</th>
                                                <th style="padding: 5px; border-bottom: 1px solid var(--c-border-strong); text-align: left;">Conceal</th>
                                                <th style="padding: 5px; border-bottom: 1px solid var(--c-border-strong); text-align: left;">Min Str</th>
                                                <th style="padding: 5px; border-bottom: 1px solid var(--c-border-strong); text-align: left;">Diff</th>
                                                <th style="padding: 5px; border-bottom: 1px solid var(--c-border-strong); text-align: left;">Notes</th>
                                                <th style="padding: 5px; border-bottom: 1px solid var(--c-border-strong); text-align: left;"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${groupedCatalog[type][era].map(item => `
                                                <tr>
                                                    <td style="padding: 5px; border-bottom: 1px solid var(--c-border-strong); color: var(--c-gold-100);">${item.name}</td>
                                                    <td style="padding: 5px; border-bottom: 1px solid var(--c-border-strong);">${item.damage || '-'}</td>
                                                    <td style="padding: 5px; border-bottom: 1px solid var(--c-border-strong);">${item.range || '-'}</td>
                                                    <td style="padding: 5px; border-bottom: 1px solid var(--c-border-strong);">${item.conceal || '-'}</td>
                                                    <td style="padding: 5px; border-bottom: 1px solid var(--c-border-strong);">${item.min_str || '-'}</td>
                                                    <td style="padding: 5px; border-bottom: 1px solid var(--c-border-strong);">${item.parry_diff || '-'}</td>
                                                    <td style="padding: 5px; border-bottom: 1px solid var(--c-border-strong);" title="${item.notes || ''}">${item.notes ? item.notes.substring(0, 20) + (item.notes.length > 20 ? '...' : '') : ''}</td>
                                                    <td style="padding: 5px; border-bottom: 1px solid var(--c-border-strong);">
                                                        <button class="btn btn-secondary btn-sm" onclick="window.addToStash(${item.id})">Add to Stash</button>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </details>
                            `).join('')}
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
    // Initialize new engines
    if (window.VTTEngine) {
        window.vttEngine = new window.VTTEngine();
        if (document.getElementById('vtt-canvas')) {
            window.vttEngine.init('vtt-canvas');
            
            window.vttEngine.canvas.on('object:modified', function(e) {
                if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                    window.ws.send(JSON.stringify({ 
                        type: 'vtt_update', 
                        data: e.target.toJSON(['id']) 
                    }));
                }
            });
            
            // Background loading is deferred to onViewActivated
            
            // Token Modal Handlers
            const addTokenBtn = document.getElementById('add-token-btn');
            const tokenModal = document.getElementById('token-modal');
            const closeTokenModal = document.getElementById('close-token-modal');
            const confirmAddTokenBtn = document.getElementById('confirm-add-token-btn');
            const tokenCharacterSelect = document.getElementById('token-character-select');

            if (addTokenBtn) {
                addTokenBtn.addEventListener('click', async () => {
                    tokenModal.style.display = 'block';
                    try {
                        const token = localStorage.getItem('access_token');
                        const response = await fetch('/api/character/', { headers: { 'Authorization': `Bearer ${token}` } });
                        if (!response.ok) throw new Error('Network response was not ok');
                        const characters = await response.json();
                        window.populateCharacterSelect(tokenCharacterSelect, characters);
                    } catch (error) {
                        console.error('Failed to fetch character list:', error);
                    }
                });
            }

            if (closeTokenModal) {
                closeTokenModal.addEventListener('click', () => {
                    tokenModal.style.display = 'none';
                });
            }

            if (confirmAddTokenBtn) {
                confirmAddTokenBtn.addEventListener('click', () => {
                    const charId = tokenCharacterSelect.value;
                    // Since allCharacters is not always available globally in this context,
                    // we'll extract the image url from the selected option's dataset
                    const selectedOption = tokenCharacterSelect.options[tokenCharacterSelect.selectedIndex];
                    const imageUrl = (selectedOption && selectedOption.dataset.image) ? selectedOption.dataset.image : 'https://via.placeholder.com/150';
                    
                    if (charId && window.vttEngine) {
                        window.vttEngine.addToken({
                            id: charId,
                            x: 50,
                            y: 50,
                            imageUrl: imageUrl,
                            spectreSettings: {}
                        });
                        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                            console.log('Sending vtt_add to WebSocket...');
                            window.ws.send(JSON.stringify({
                                type: 'vtt_add',
                                data: {
                                    id: charId,
                                    x: 50,
                                    y: 50,
                                    imageUrl: imageUrl
                                }
                            }));
                        } else {
                            console.error('WebSocket not open. Cannot send vtt_add!');
                        }
                    }
                    tokenModal.style.display = 'none';
                });
            }

            // Restore VTT ResizeObserver
            const canvasEl = document.getElementById('vtt-canvas');
            if (canvasEl) {
                const wrapper = canvasEl.closest('.canvas-container') ? canvasEl.closest('.canvas-container').parentElement : canvasEl.parentElement;
                if (wrapper) {
                    const ro = new ResizeObserver(entries => {
                        for (let entry of entries) {
                            const { width, height } = entry.contentRect;
                            if (width > 0 && height > 0 && window.vttEngine) {
                                window.vttEngine.resizeCanvas(width, height);
                            }
                        }
                    });
                    ro.observe(wrapper);
                }
            }

            // Restore VTT Background Image Upload
            const setBgBtn = document.getElementById('set-bg-btn');
            const vttBgUpload = document.getElementById('vtt-bg-upload');
            if (setBgBtn && vttBgUpload) {
                setBgBtn.addEventListener('click', () => vttBgUpload.click());
                vttBgUpload.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const dataUrl = event.target.result;
                            const container = document.getElementById('vtt-canvas').closest('div[style*="flex-grow"]');
                            if (container) window.vttEngine.resizeCanvas(container.clientWidth, container.clientHeight);
                            window.vttEngine.setBackground(dataUrl, 1, 1);
                            if (window.UIShell) window.UIShell.showToast('Background updated', 'success');
                        };
                        reader.readAsDataURL(file);
                    } catch (err) {
                        if (window.UIShell) window.UIShell.showToast('Image load error', 'error');
                        console.error(err);
                    } finally {
                        vttBgUpload.value = '';
                    }
                });
            }

            // Restore Grid Inputs
            const gridColsInput = document.getElementById('vtt-grid-cols');
            const gridRowsInput = document.getElementById('vtt-grid-rows');
            if (gridColsInput && gridRowsInput) {
                const updateGrid = () => {
                    if (window.vttEngine) {
                        window.vttEngine.setGridSize(parseInt(gridColsInput.value) || 10, parseInt(gridRowsInput.value) || 10);
                    }
                };
                gridColsInput.addEventListener('change', updateGrid);
                gridRowsInput.addEventListener('change', updateGrid);
            }
        }
    }

    // Helper functions for character select
    window.populateCharacterSelect = function(selectElement, characters) {
        selectElement.innerHTML = '';
        const groups = { PC: [], NPC: [], Critter: [] };
        
        characters.forEach(c => {
            const type = c.character_type || 'NPC';
            if (type.toLowerCase() === 'pc' || type.toLowerCase() === 'player') {
                groups.PC.push(c);
            } else if (type.toLowerCase() === 'npc_critter' || type.toLowerCase() === 'critter') {
                groups.Critter.push(c);
            } else {
                groups.NPC.push(c);
            }
        });

        const order = ['PC', 'NPC', 'Critter'];
        order.forEach(groupName => {
            const groupCharacters = groups[groupName];
            if (groupCharacters.length > 0) {
                const optGroup = document.createElement('optgroup');
                optGroup.label = groupName;
                groupCharacters.forEach(c => {
                    const option = document.createElement('option');
                    option.value = c.id;
                    option.textContent = c.name;
                    option.dataset.image = c.image_url || 'https://via.placeholder.com/150';
                    optGroup.appendChild(option);
                });
                selectElement.appendChild(optGroup);
            }
        });
    };

    if (window.AudioDSPEngine) {
        window.audioEngine = new window.AudioDSPEngine();
        window.ambientMixer = new window.AmbientMixer();
        window.webrtcBroker = new window.WebRTCBroker();
    }

    if (window.FactionGraph) {
        window.factionGraph = new window.FactionGraph();
        if (document.getElementById('faction-graph-container')) {
            window.factionGraph.init('#faction-graph-container');
            // Mock data for visual verification
            window.factionGraph.updateData(
                [
                    {id: 'Camarilla Prince', allegiance: 'Camarilla'},
                    {id: 'Sabbat Bishop', allegiance: 'Sabbat'},
                    {id: 'Anarch Baron', allegiance: 'Anarch'}
                ],
                [
                    {source: 'Camarilla Prince', target: 'Anarch Baron', tension_level: 5},
                    {source: 'Sabbat Bishop', target: 'Camarilla Prince', tension_level: 10}
                ]
            );
        }
    }

    // --- Dice Roller Logic ---
    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) {
        rollBtn.addEventListener('click', async () => {
            const poolSize = parseInt(document.getElementById('pool-size').value, 10);
            const difficulty = parseInt(document.getElementById('difficulty').value, 10);
            
            if (isNaN(poolSize) || isNaN(difficulty)) return;
            
            const token = localStorage.getItem('access_token');
            try {
                const res = await fetch('/api/dice/roll', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify({
                        pool_size: poolSize,
                        difficulty: difficulty,
                        specialty: false,
                        willpower: false,
                        context: 'Manual Roll'
                    })
                });
                
                const resultsContainer = document.getElementById('dice-results');
                if (res.ok) {
                    const data = await res.json();
                    let resultHtml = `<div style="font-weight:bold; margin-bottom:var(--sp-2);">Result: ${data.successes} successes</div>`;
                    if (data.is_botch) {
                        resultHtml = `<div style="font-weight:bold; color:var(--c-danger); margin-bottom:var(--sp-2);">BOTCH!</div>`;
                    } else if (data.successes < 0) {
                        resultHtml = `<div style="font-weight:bold; color:var(--c-danger); margin-bottom:var(--sp-2);">Failure</div>`;
                    }
                    
                    const rollsHtml = (data.rolls || []).map(r => {
                        let color = 'var(--c-text-primary)';
                        if (r >= difficulty) color = 'var(--c-success)';
                        if (r === 1) color = 'var(--c-danger)';
                        return `<span style="display:inline-block; padding:4px 8px; margin:2px; background:var(--c-bg-700); border-radius:4px; color:${color}; font-weight:bold;">${r}</span>`;
                    }).join('');
                    
                    resultsContainer.innerHTML = resultHtml + `<div style="display:flex; flex-wrap:wrap;">${rollsHtml}</div>`;
                    resultsContainer.classList.remove('hidden');
                } else {
                    const err = await res.json();
                    resultsContainer.innerHTML = `<div style="color:var(--c-danger);">Error: ${err.detail || res.statusText}</div>`;
                    resultsContainer.classList.remove('hidden');
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    // --- Rule Search Logic ---
    const ruleSubmitBtn = document.getElementById('floating-rule-submit');
    const ruleInput = document.getElementById('floating-rule-search');
    if (ruleSubmitBtn && ruleInput) {
        const performSearch = async () => {
            const query = ruleInput.value.trim();
            if (!query) return;
            
            const resultsContainer = document.getElementById('floating-rule-results');
            resultsContainer.innerHTML = '<div style="color:var(--c-text-muted); font-style:italic;">Searching rules...</div>';
            
            const token = localStorage.getItem('access_token');
            try {
                const res = await fetch('/api/brain/ask', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify({ query: query, domain: 'rules' })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    // Basic markdown parsing for the popup
                    const formatted = data.response
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n/g, '<br>');
                    resultsContainer.innerHTML = formatted;
                } else {
                    const err = await res.json();
                    resultsContainer.innerHTML = `<div style="color:var(--c-danger);">Error: ${err.detail || res.statusText}</div>`;
                }
            } catch (err) {
                resultsContainer.innerHTML = `<div style="color:var(--c-danger);">Network error</div>`;
            }
        };
        
        ruleSubmitBtn.addEventListener('click', performSearch);
        ruleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });
    }

});

// --- Agent Simulator Logic ---
let agentCombatState = {};
const sendAgentBtn = document.getElementById('send-agent-btn');
const resetAgentBtn = document.getElementById('reset-agent-btn');
const agentChatInput = document.getElementById('agent-chat-input');
const agentChatHistory = document.getElementById('agent-chat-history');

if (sendAgentBtn || document.getElementById('side-agent-send')) {
    const sendAgentMessage = async (isSideInput = false) => {
        const inputEl = isSideInput ? document.getElementById('side-agent-input') : (agentChatInput || document.getElementById('side-agent-input'));
        if (!inputEl) return;
        const text = inputEl.value.trim();
        if (!text) return;

        const activeTab = document.querySelector('.agent-tab.active');
        const agentId = activeTab ? activeTab.dataset.agent : 'storyteller';

        if (window.UIShell) window.UIShell.appendAgentMessage(agentId, 'user', text);
        inputEl.value = '';

        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/api/agents/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ message: text, combat_state: agentCombatState })
            });

            const data = await res.json();

            if (res.ok) {
                let reply = data.reply || "No response";
                if (data.combat_state) {
                    agentCombatState = data.combat_state;
                }

                let optionsHtml = '';
                const optionsArray = data.options || [];
                if (optionsArray.length > 0) {
                    optionsHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">';
                    optionsArray.forEach((opt, i) => {
                        const action = (opt.action || opt.label || '').replace(/"/g, '&quot;');
                        optionsHtml += `<button class="combat-action-btn" onclick="const e = document.getElementById('side-agent-input') || document.getElementById('agent-chat-input'); if(e){e.value='${action}';} const b = document.getElementById('side-agent-send') || document.getElementById('send-agent-btn'); if(b) b.click();" style="background:linear-gradient(135deg,#4a1a2e,#2a1a3e);color:#f0d0a0;border:1px solid #8b4513;padding:10px 16px;border-radius:8px;cursor:pointer;text-align:left;min-width:200px;transition:all 0.2s;font-size:13px;"><strong>${opt.label || 'Action'}</strong><br><span style="font-size:11px;color:#c0a080;">${opt.dice_pool || ''}</span></button>`;
                    });
                    optionsHtml += '</div>';
                }

                if (window.UIShell) window.UIShell.appendAgentMessage(agentId, 'assistant', reply.replace(/\n/g, '<br>') + optionsHtml);
            } else {
                if (window.UIShell) window.UIShell.appendAgentMessage(agentId, 'assistant', `<span style="color:red">Error: ${data.detail}</span>`);
            }
        } catch(e) {
            if (window.UIShell) window.UIShell.appendAgentMessage(agentId, 'assistant', `<span style="color:red">Network Error: ${e.message}</span>`);
        }
    };

    if (sendAgentBtn) {
        sendAgentBtn.addEventListener('click', () => sendAgentMessage(false));
    }

    if (agentChatInput) {
        agentChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendAgentMessage(false);
            }
        });
    }

    const sideSendBtn = document.getElementById('side-agent-send');
    if (sideSendBtn) {
        sideSendBtn.addEventListener('click', () => sendAgentMessage(true));
    }

    const sideInput = document.getElementById('side-agent-input');
    if (sideInput) {
        sideInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendAgentMessage(true);
            }
        });
    }
}


if (resetAgentBtn) {
    resetAgentBtn.addEventListener('click', () => {
        agentCombatState = {};
        if (agentChatHistory) {
            agentChatHistory.innerHTML = `<div style="color: #aaa; text-align: center; margin-bottom: 10px;">State reset. Starting fresh.</div>`;
        }
    });
}

// STASH LOGIC
window.addToStash = async function(itemId) {
    if (!window.currentCharacterId) {
        alert('Please select a character first to add to their stash.');
        return;
    }
    if (!window.equipmentCatalog) return;
    
    const item = window.equipmentCatalog.find(i => i.id === itemId);
    if (!item) return;
    
    window.currentStash = window.currentStash || [];
    window.currentStash.push({...item, equipped: false, stashId: Date.now() + Math.random()});
    
    // Auto save to backend
    // document.getElementById('save-character-sheet-btn').click(); 
    // Wait, better to let them save explicitly or trigger saveCharacterSheet(window.currentCharacterId)
    // I'll leave it in memory so they have to click 'Save Character'
    alert(`${item.name} added to stash! Don't forget to save your character.`);
    if (typeof window.renderStash === 'function') window.renderStash();
};

window.toggleEquip = function(stashId) {
    const item = window.currentStash.find(i => i.stashId === stashId);
    if (!item) return;
    
    if (!item.equipped) {
        // Enforce limits: Max 1 Armor, Max 2 Weapons
        const type = (item.type || '').toLowerCase();
        const equippedItems = window.currentStash.filter(i => i.equipped && (i.type || '').toLowerCase() === type);
        
        if (type.includes('armor') && equippedItems.length >= 1) {
            alert('You can only equip 1 Armor at a time.');
            return;
        }
        if (type.includes('weapon') && equippedItems.length >= 2) {
            alert('You can only equip 2 Weapons at a time.');
            return;
        }
    }
    
    item.equipped = !item.equipped;
    window.renderStash();
};

window.removeFromStash = function(stashId) {
    window.currentStash = window.currentStash.filter(i => i.stashId !== stashId);
    window.renderStash();
};

window.renderStash = function() {
    const container = document.getElementById('stash-container');
    if (!container) return;
    
    if (!window.currentStash || window.currentStash.length === 0) {
        container.innerHTML = '<p style="color: var(--c-text-muted);">Stash is empty.</p>';
        return;
    }
    
    container.innerHTML = window.currentStash.map(item => `
        <div style="background: var(--c-bg-600); padding: 10px; border-radius: 5px; border: 1px solid var(--c-border-medium); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h5 style="margin: 0; color: var(--c-gold-100);">${item.name} <span style="font-size: 0.8em; color: var(--c-text-muted);">(${item.type || 'Other'})</span></h5>
                <p style="margin: 5px 0 0; font-size: var(--text-sm);">${item.damage ? 'Dmg: ' + item.damage : ''} ${item.conceal ? '| Conc: ' + item.conceal : ''}</p>
            </div>
            <div>
                <button class="btn ${item.equipped ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="window.toggleEquip(${item.stashId})">
                    ${item.equipped ? 'Unequip' : 'Equip'}
                </button>
                <button class="btn btn-danger btn-sm" onclick="window.removeFromStash(${item.stashId})" style="margin-left: 5px;">Drop</button>
            </div>
        </div>
    `).join('');
};