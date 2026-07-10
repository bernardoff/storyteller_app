import asyncio
import os
from server.services.ollama_manager import ollama_generate

prompt = """
Modify this python code for `server/database.py`. I want to update the `CombatEncounter` model to include four new fields for the V20 Dark Ages combat state machine.

Here is the current model:
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
    created_at: Mapped[datetime] = mapped_column(default=func.now())
```

Please add:
- `phase: Mapped[str] = mapped_column(String(20), default='initiative')`
- `initiative_roster_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)`
- `pending_actions_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)`
- `damage_suggestions_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)`

Output ONLY the modified class code, nothing else (no imports, just the class definition).
"""

async def main():
    print("Generating modification for database.py...")
    response = await ollama_generate("qwen2.5-coder:14b", prompt)
    
    code = response.strip()
    if code.startswith("```python"):
        code = code[9:]
    if code.endswith("```"):
        code = code[:-3]
        
    with open("server/database.py", "r") as f:
        content = f.read()
    
    # We will just print it and I will manually replace the class using the `replace_file_content` tool 
    # to be safer with database.py, since it's a large file.
    with open("temp_class.py", "w") as f:
        f.write(code.strip())
        
    print("Done. Saved to temp_class.py.")

if __name__ == "__main__":
    asyncio.run(main())
