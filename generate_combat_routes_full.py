import asyncio
from server.services.ollama_manager import ollama_generate

prompt = """
Write the full implementation of the API endpoints in `server/routers/combat_routes.py`. 
Use FastAPI, SQLAlchemy, and standard dependency injection (`get_db`).

Here is the CombatEncounter model:
```python
class CombatEncounter(Base):
    __tablename__ = 'combat_encounters'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey('campaigns.id'))
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey('session_logs.id'), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(default=True)
    current_turn_index: Mapped[int] = mapped_column(default=0)
    round_number: Mapped[int] = mapped_column(default=1)
    combatants_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    combat_log_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phase: Mapped[str] = mapped_column(String(20), default='initiative')
    initiative_roster_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pending_actions_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    damage_suggestions_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
```

And here are the schemas (stubs):
```python
from pydantic import BaseModel
class CombatEncounterCreate(BaseModel): pass
class NPCCombatantCreate(BaseModel): pass
class InitiativeResponse(BaseModel): pass
class ActionRequest(BaseModel): pass
class DamageSuggestion(BaseModel): pass
```

And the current LLM route logic:
```python
@router.post("/api/combat/{id}/resolve-action-llm")
def resolve_action_llm(id: int, action_description: str, engine: str = "gemini", db: Session = Depends(get_db)):
    if engine == "gemini":
        query = f"Adjudicate this combat action based on V20 Dark Ages rules: {action_description}"
        response = brain_engine.ask(query, domain="rules")
        return {"adjudication": response}
    elif engine == "llama":
        import asyncio
        from server.services.combat_llm import resolve_action_via_llm
        llm_response = asyncio.run(resolve_action_via_llm({}, {}, action_description))
        return llm_response
    else:
        raise ValueError("Invalid engine specified")
```

Please write the full python file `server/routers/combat_routes.py`. 
Implement:
1. `GET /api/combat/{id}/state` -> Returns the CombatEncounter model from DB.
2. `POST /api/combat/{id}/roll-initiative` -> Reads combatants_json, parses it (assuming it's a list of dicts with `name`, `dexterity`, `wits`, `celerity`, `wound_penalty`), calculates initiative for each, sorts them descending, saves to `initiative_roster_json`, sets phase to 'declaration', and commits to db.
3. `POST /api/combat/{id}/submit-action` -> Appends the ActionRequest (as dict) to `pending_actions_json` list and commits.
4. `POST /api/combat/{id}/confirm-damage` -> Clears `damage_suggestions_json` list and commits.

Output ONLY the python code. Make sure all imports are present.
"""

async def main():
    print("Generating combat_routes.py full logic with Qwen...")
    response = await ollama_generate("qwen2.5-coder:14b", prompt)
    
    code = response.strip()
    if code.startswith("```python"):
        code = code[9:]
    elif code.startswith("```"):
        code = code[3:]
    if code.endswith("```"):
        code = code[:-3]
        
    with open("server/routers/combat_routes.py", "w") as f:
        f.write(code.strip())
    print("Code written to server/routers/combat_routes.py")

if __name__ == "__main__":
    asyncio.run(main())
