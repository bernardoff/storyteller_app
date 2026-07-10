import json
import re
from server.services.ollama_manager import ollama_chat

def build_combat_context(character_stats: dict, combat_state: dict, action_declaration: str) -> str:
    context = f"Character Stats: {character_stats}\nCombat State: {combat_state}\nAction Declaration: {action_declaration}\n"
    rules = "V20 Combat Rules: Follow the strict V20 Dark Ages rules and output a JSON object."
    return context + rules

async def resolve_action_via_llm(character_stats: dict, combat_state: dict, action_declaration: str) -> dict:
    context = build_combat_context(character_stats, combat_state, action_declaration)
    # FIX: ollama_chat takes messages=[{"role": "user", "content": context}], not prompt=context
    response = await ollama_chat(model="llama3.1:8b", messages=[{"role": "user", "content": context}])
    
    # Strip markdown-like JSON formatting
    json_str = re.sub(r'```json\n(.*)\n```', r'\1', response, flags=re.DOTALL)
    
    try:
        result = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError("Invalid JSON response from LLM") from e
    
    return result