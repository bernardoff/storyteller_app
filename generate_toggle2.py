import asyncio
from server.services.ollama_manager import ollama_generate

prompt = """
Rewrite the `resolve_action_llm` endpoint. The current logic for Gemini is:
```python
    query = f"Adjudicate this combat action based on V20 Dark Ages rules: {action_description}"
    response = brain_engine.ask(query, domain="rules")
    return {"adjudication": response}
```

Make the function definition `def resolve_action_llm(id: int, action_description: str, engine: str = "gemini", db: Session = Depends(get_db)):` 
If engine is "gemini", run the current logic exactly.
If engine is "llama", call `resolve_action_via_llm` (you will need to use `asyncio.run` or make the router function `async def` and await it). 
Provide the full router function.

Output ONLY the python code.
"""

async def main():
    response = await ollama_generate("qwen2.5-coder:14b", prompt)
    code = response.strip()
    if code.startswith("```python"):
        code = code[9:]
    if code.endswith("```"):
        code = code[:-3]
    with open("server/routers/combat_routes_fix2.txt", "w") as f:
        f.write(code.strip())

if __name__ == "__main__":
    asyncio.run(main())
