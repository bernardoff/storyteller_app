import asyncio
from server.services.ollama_manager import ollama_chat, get_active_model

async def test():
    print("Currently loaded:", await get_active_model())
    print("Sending a test chat to llama3.1:8b...")
    result = await ollama_chat(
        "llama3.1:8b",
        messages=[{"role": "user", "content": "In Vampire V20 Dark Ages, what is the initiative formula for combat? Answer in one sentence."}],
    )
    print("Response:", result)
    print("Now loaded:", await get_active_model())

asyncio.run(test())
