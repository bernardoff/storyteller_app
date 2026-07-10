import asyncio
from server.services.ollama_manager import ollama_generate

prompt = """
Please rewrite the `resolve_action_llm` endpoint in `server/routers/combat_routes.py`. 
Add a query parameter `engine: str = "gemini"`. If it is "gemini", use the `brain_engine` as currently implemented. If it is "llama", call `resolve_action_via_llm` from `server.services.combat_llm`.

```python
@router.post("/api/combat/{id}/resolve-action-llm")
async def resolve_action_llm(id: int, action_description: str, engine: str = "gemini", db: Session = Depends(get_db)):
    # YOUR CODE HERE to toggle between brain_engine and resolve_action_via_llm
```

Output only the modified python function code, without markdown blocks.
"""

async def main():
    response = await ollama_generate("qwen2.5-coder:14b", prompt)
    code = response.strip()
    if code.startswith("```python"):
        code = code[9:]
    if code.endswith("```"):
        code = code[:-3]
    with open("server/routers/combat_routes_fix.txt", "w") as f:
        f.write(code.strip())

if __name__ == "__main__":
    asyncio.run(main())
