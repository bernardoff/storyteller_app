from fastapi import APIRouter, HTTPException

router = APIRouter()

@router.post("/api/vtt/image")
async def generate_image(prompt: str):
    # Simulate image generation process
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    # Return a placeholder URL for the generated image
    return {"url": "/static/images/placeholder.png"}
