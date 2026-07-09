"""
Ollama Model Manager — Ensures only one model is loaded in GPU memory at a time.

This module provides a centralized way to request an Ollama model for a task.
Before loading a new model, it unloads whichever model is currently resident
in memory, preventing VRAM overflow.

Usage:
    from server.services.ollama_manager import ollama_generate, ollama_chat

    # For code generation tasks
    result = await ollama_generate("qwen2.5-coder:14b", prompt="...")

    # For conversational / rules-engine tasks
    messages = [{"role": "user", "content": "How does Celerity work?"}]
    result = await ollama_chat("llama3.1:8b", messages=messages)
"""

import asyncio
import httpx
import logging

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://localhost:11434"

# Registry of known models and their intended purpose.
# This is informational and helps future callers pick the right model.
MODEL_REGISTRY = {
    "qwen2.5-coder:14b": {
        "purpose": "code_generation",
        "description": "Optimised for code generation, refactoring, and structured output.",
        "size_gb": 9.0,
    },
    "llama3.1:8b": {
        "purpose": "rules_engine",
        "description": "General-purpose reasoning model for rules interpretation and combat resolution.",
        "size_gb": 4.9,
    },
}

# Module-level lock to prevent concurrent model swaps
_swap_lock = asyncio.Lock()
_currently_loaded_model: str | None = None


async def _get_loaded_models() -> list[str]:
    """Query Ollama for models currently loaded in memory."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{OLLAMA_BASE_URL}/api/ps", timeout=10.0)
        response.raise_for_status()
        data = response.json()
        return [m["name"] for m in data.get("models", [])]


async def _unload_model(model_name: str) -> None:
    """Unload a model from Ollama memory by sending a generate request with keep_alive=0."""
    logger.info(f"Unloading model '{model_name}' from memory...")
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": model_name, "prompt": "", "keep_alive": 0},
            timeout=30.0,
        )
    logger.info(f"Model '{model_name}' unloaded.")


async def _ensure_model_loaded(model_name: str) -> None:
    """
    Ensure the requested model is the only one loaded in GPU memory.
    Unloads all other models first.
    """
    global _currently_loaded_model

    async with _swap_lock:
        if _currently_loaded_model == model_name:
            return

        # Discover what's actually in memory
        loaded = await _get_loaded_models()

        # Unload everything that isn't the target
        for loaded_model in loaded:
            if loaded_model != model_name:
                await _unload_model(loaded_model)

        # Warm-load the target model (a tiny generate call loads it into memory)
        if model_name not in loaded:
            logger.info(f"Pre-loading model '{model_name}' into memory...")
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={"model": model_name, "prompt": " ", "keep_alive": "10m"},
                    timeout=120.0,
                )
            logger.info(f"Model '{model_name}' loaded into memory.")

        _currently_loaded_model = model_name


async def ollama_generate(model: str, prompt: str, **kwargs) -> str:
    """
    Run a generation request against a specific Ollama model.
    Handles model swapping automatically.

    Returns the generated text.
    """
    await _ensure_model_loaded(model)

    timeout = kwargs.pop("timeout", 300.0)
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        **kwargs,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
        return response.json()["response"]


async def ollama_chat(model: str, messages: list[dict], **kwargs) -> str:
    """
    Run a chat request against a specific Ollama model.
    Handles model swapping automatically.

    Args:
        model: The Ollama model name (e.g. "llama3.1:8b").
        messages: List of {"role": "...", "content": "..."} messages.

    Returns the assistant's response text.
    """
    await _ensure_model_loaded(model)

    timeout = kwargs.pop("timeout", 300.0)
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        **kwargs,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
        return response.json()["message"]["content"]


async def get_active_model() -> str | None:
    """Return the name of the currently loaded model, or None."""
    loaded = await _get_loaded_models()
    return loaded[0] if loaded else None
