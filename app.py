"""
Vampire: The Masquerade V20 — Storyteller Assistant
Main Streamlit application.
"""

import streamlit as st
from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types

import character_manager
import sys
if 'rag_engine' in sys.modules:
    del sys.modules['rag_engine']
import rag_engine
from dice_engine import roll_v20
import state_manager

# ── Page configuration ──────────────────────────────────────────────
st.set_page_config(
    page_title="V20 Storyteller Assistant",
    page_icon="🧛",
    layout="wide",
)

# System Instructions
SYSTEM_INSTRUCTIONS = {
    "Combat Simulator": (
        "You are a V20 game engine and Storyteller. You fully manage combat. "
        "Describe the scene, announce whose turn it is. For NPCs, decide their action, "
        "use the roll_v20 tool, and apply outcomes using apply_damage. For Players, "
        "calculate their dice pool and difficulty based on their action, ask the human "
        "Storyteller for the physical roll successes, OR if they type 'auto roll', use "
        "the roll_v20 tool for them. Always call next_turn when a turn is over."
    ),
    "Story/Character Creator": (
        "You are an expert Vampire: The Masquerade V20 Storyteller. Assist the user in "
        "creating engaging stories, lore, and characters. When generating a character or "
        "NPC, format it as a plain text stat block following the template style found in "
        "the provided knowledge base."
    )
}

# ── Boot: build client ────────────────────────────
load_dotenv()
client = genai.Client()

with st.spinner("Initializing Knowledge Base (This may take a few minutes on first run)..."):
    rag_engine.initialize_knowledge_base("knowledge_base")

# ── Session-state defaults ───────────────────────────────────────────
if "mode" not in st.session_state:
    st.session_state.mode = "Combat Simulator"
if "messages" not in st.session_state:
    st.session_state.messages = []

# =====================================================================
# SIDEBAR — Combat Tracker & Dice Roller
# =====================================================================
with st.sidebar:
    # Mode Selector
    mode = st.radio("Mode", ["Combat Simulator", "Story/Character Creator"], key="mode")
    st.session_state.mode = mode

    st.header(f"🧛 {mode} Interface")

    if mode == "Combat Simulator":
        # --- Add combatant ---
        with st.expander("➕ Add Combatant", expanded=False):
            new_name = st.text_input("Name", key="new_name")
            new_init = st.number_input(
                "Initiative", min_value=0, step=1, value=0, key="new_init"
            )
            is_npc = st.checkbox("NPC", key="is_npc", value=False)
            if st.button("Add", key="btn_add"):
                state_manager.add_combatant(new_name.strip(), int(new_init), is_npc=is_npc)
                st.rerun()

        # --- Display / manage combatants ---
        combatants = state_manager.get_combatants()
        if combatants:
            for idx, c in enumerate(combatants):
                with st.expander(
                    f"⚔️ {c['name']}  (Init {c['initiative']})", expanded=False
                ):
                    # Initiative
                    new_val = st.number_input(
                        "Initiative",
                        value=c["initiative"],
                        min_value=0,
                        step=1,
                        key=f"init_{idx}",
                    )
                    if new_val != c["initiative"]:
                        state_manager.set_initiative(idx, int(new_val))
                        st.rerun()

                    # Health track
                    st.caption("Health Track")
                    for level in state_manager.HEALTH_LEVELS:
                        checked = st.checkbox(
                            level,
                            value=c["health"][level],
                            key=f"hp_{idx}_{level}",
                        )
                        if checked != c["health"][level]:
                            c["health"][level] = checked

                    # Quick-damage / heal / remove
                    dmg_amount = st.number_input(
                        "Apply damage",
                        min_value=0,
                        max_value=7,
                        value=0,
                        step=1,
                        key=f"dmg_{idx}",
                    )
                    col_a, col_b, col_c = st.columns(3)
                    with col_a:
                        if st.button("Apply", key=f"apply_{idx}"):
                            state_manager.apply_damage(idx, int(dmg_amount))
                            st.rerun()
                    with col_b:
                        if st.button("Heal", key=f"heal_{idx}"):
                            state_manager.heal_all(idx)
                            st.rerun()
                    with col_c:
                        if st.button("Remove", key=f"rm_{idx}"):
                            state_manager.remove_combatant(idx)
                            st.rerun()

                    # Wound penalty
                    penalty = state_manager.current_wound_penalty(idx)
                    if penalty is None:
                        st.error("💀 Incapacitated")
                    elif penalty < 0:
                        st.warning(f"Wound Penalty: {penalty}")
        else:
            st.info("No combatants. Add one above.")

    st.divider()

    # --- Character Sheets ---
    st.header("📜 Character Sheets")
    chars = character_manager.load_characters()
    for name, url in chars.items():
        col_c1, col_c2 = st.columns([3, 1])
        with col_c1:
            st.markdown(f"[{name}]({url})")
        with col_c2:
            if st.button("X", key=f"rm_char_{name}"):
                character_manager.remove_character(name)
                st.rerun()

    with st.expander("➕ Add Sheet", expanded=False):
        new_char_name = st.text_input("Name", key="new_char_name")
        new_char_url = st.text_input("URL", key="new_char_url")
        if st.button("Add Sheet", key="btn_add_char"):
            if new_char_name.strip() and new_char_url.strip():
                try:
                    character_manager.add_character(new_char_name.strip(), new_char_url.strip())
                    st.rerun()
                except Exception as e:
                    st.error(str(e))

    st.divider()

    # --- Dice Roller ---
    st.header("🎲 Dice Roller")
    pool = st.number_input("Pool", min_value=1, max_value=30, value=5, step=1)
    diff = st.number_input(
        "Difficulty", min_value=2, max_value=10, value=6, step=1
    )
    spec = st.checkbox("Specialty (10s explode)")
    if st.button("Roll!", key="btn_roll"):
        result = roll_v20(int(pool), int(diff), spec)
        st.write(f"**Rolls:** {result['rolls']}")
        if result["is_botch"]:
            st.error(f"💥 **{result['result']}**")
        elif result["successes"] == 0:
            st.warning(f"❌ **{result['result']}**")
        else:
            st.success(f"✅ **{result['result']}**")

# =====================================================================
# MAIN AREA — Chat Interface
# =====================================================================
st.title(f"🧛 {st.session_state.mode} Assistant")
st.caption("Describe a mechanical outcome and the Storyteller will narrate it.")

# Render conversation history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# Chat input
if prompt := st.chat_input("e.g. 'Player hits Lasombra for 2 damage'"):
    # Show user message
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Build the content parts: combat context + user prompt
    combat_context = state_manager.get_combatant_summary()

    chars = character_manager.load_characters()
    matching_chars = [name for name in chars.keys() if name.lower() in prompt.lower()]
    character_context = ""
    if matching_chars:
        with st.spinner("Fetching character sheets..."):
            for char_name in matching_chars:
                char_text = character_manager.fetch_character_text(char_name)
                if char_text:
                    character_context += f"--- {char_name} Sheet ---\n{char_text}\n\n"

    with st.spinner("Consulting the rulebooks..."):
        rules_context = rag_engine.search_rules(prompt, n_results=4)

    parts = []

    # Combine combat state and user message
    full_prompt = f"Combat State:\n{combat_context}\n\n"
    if character_context:
        full_prompt += f"Character Sheets:\n{character_context}\n"
    if rules_context:
        full_prompt += f"Relevant Rules:\n{rules_context}\n\n"
    
    full_prompt += f"---\nUser Prompt:\n{prompt}"

    parts.append(full_prompt)

    # Call Gemini
    with st.chat_message("assistant"):
        with st.spinner("The Storyteller speaks…"):
            config = types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTIONS[mode],
                temperature=0.9,
            )
            if mode == "Combat Simulator":
                config.tools = [roll_v20, state_manager.apply_damage, state_manager.next_turn, state_manager.add_combatant]
            
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=parts,
                config=config,
            )

            while response.function_calls:
                function_name = response.function_calls[0].function.name
                function_args = response.function_calls[0].function.arguments

                if function_name == "roll_v20":
                    result = roll_v20(int(function_args.get("pool_size", 0)), int(function_args.get("difficulty", 6)), bool(function_args.get("specialty", False)))
                    parts.append(f"Roll Result: {result}")
                elif function_name == "apply_damage":
                    state_manager.apply_damage(int(function_args.get("index", 0)), int(function_args.get("amount", 0)))
                    parts.append(f"Damage Applied: {function_args.get('amount', 0)} to Combatant {function_args.get('index', 0)}")
                elif function_name == "next_turn":
                    state_manager.next_turn()
                    parts.append("Next turn")
                elif function_name == "add_combatant":
                    state_manager.add_combatant(function_args.get("name", "Unknown"), int(function_args.get("initiative", 0)), is_npc=bool(function_args.get("is_npc", False)))
                    parts.append(f"Combatant Added: {function_args.get('name', 'Unknown')}")

                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=parts,
                    config=config,
                )

            narration = response.text
            st.markdown(narration)

    st.session_state.messages.append({"role": "assistant", "content": narration})
