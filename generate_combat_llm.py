import asyncio
from server.services.ollama_manager import ollama_generate

prompt = """
Fix this python module `combat_llm.py`. The `ollama_chat` function requires a `messages` list of dicts, not a `prompt` string. Also, make the `build_combat_context` function include more detail on the V20 Dark Ages rules (you can just add a placeholder string like "V20 Combat Rules: ..."). 

```python
import json
import re
from server.services.ollama_manager import ollama_chat

def build_combat_context(character_stats: dict, combat_state: dict, action_declaration: str) -> str:
    context = f"Character Stats: {character_stats}\\nCombat State: {combat_state}\\nAction Declaration: {action_declaration}\\n"
    rules = "Follow the strict V20 Dark Ages rules and output a JSON object."
    return context + rules

async def resolve_action_via_llm(character_stats: dict, combat_state: dict, action_declaration: str) -> dict:
    context = build_combat_context(character_stats, combat_state, action_declaration)
    # FIX: ollama_chat takes messages=[{"role": "user", "content": context}], not prompt=context
    response = await ollama_chat(model="llama3.1:8b", prompt=context)
    
    # Strip markdown-like JSON formatting
    json_str = re.sub(r'```json\\n(.*)\\n```', r'\\1', response, flags=re.DOTALL)
    
    try:
        result = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError("Invalid JSON response from LLM") from e
    
    return result
```

Output ONLY the corrected python code, nothing else.
"""

async def main():
    response = await ollama_generate("qwen2.5-coder:14b", prompt)
    code = response.strip()
    if code.startswith("```python"):
        code = code[9:]
    if code.endswith("```"):
        code = code[:-3]
    with open("server/services/combat_llm.py", "w") as f:
        f.write(code.strip())

if __name__ == "__main__":
    asyncio.run(main())
