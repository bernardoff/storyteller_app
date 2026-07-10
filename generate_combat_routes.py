import asyncio
from server.services.ollama_manager import ollama_generate

prompt = """
Write a python module `server/routers/combat_routes.py` that implements the API endpoints for the LLM-driven V20 Dark Ages combat tracker.

The router should include these endpoints:
1. `POST /api/combat/start`: creates a new `CombatEncounter`, receives a list of combatants (from the Character DB).
2. `POST /api/combat/{id}/npc/quick-add`: Creates a temporary or permanent NPC Character on the fly, adds it to the encounter. Expects stats in the body.
3. `POST /api/combat/{id}/roll-initiative`: Reads `combatants_json`, loops over them, calls `calculate_initiative` from `server.services.v20_rules_engine`, sorts them, and updates `initiative_roster_json` and `phase`='declaration'.
4. `POST /api/combat/{id}/submit-action`: Adds a pending action to `pending_actions_json`.
5. `POST /api/combat/{id}/resolve-action-llm`: Calls `resolve_action_via_llm` from `server.services.combat_llm` and updates the pending action with the returned mechanics.
6. `POST /api/combat/{id}/roll`: Takes a resolved action, calls `roll_dice` from `server.services.v20_rules_engine`, calculates damage/soak (using `calculate_damage` and `calculate_soak`), and adds it to `damage_suggestions_json`.
7. `POST /api/combat/{id}/confirm-damage`: Reads a damage suggestion, applies it to the character's `health_json`, clears the suggestion.
8. `GET /api/combat/{id}/state`: Returns the full combat state (roster, pending actions, suggestions, phase).

Do not implement the full database logic for all endpoints if it's too complex, just provide a solid structural implementation using FastAPI, `sqlalchemy`, and standard dependency injection (`get_db`).

Output ONLY the python code.
"""

async def main():
    print("Generating combat_routes.py with Qwen...")
    response = await ollama_generate("qwen2.5-coder:14b", prompt)
    
    code = response.strip()
    if code.startswith("```python"):
        code = code[9:]
    if code.endswith("```"):
        code = code[:-3]
        
    with open("server/routers/combat_routes.py", "w") as f:
        f.write(code.strip())
    print("Code written to server/routers/combat_routes.py")

if __name__ == "__main__":
    asyncio.run(main())
