from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
import httpx

from server.database import get_db, Character
from server.auth import require_storyteller
from server.websocket_manager import manager

router = APIRouter()

class SuggestActionsRequest(BaseModel):
    character_id: int
    context: str

@router.post("/api/suggest_actions")
async def suggest_actions(request: SuggestActionsRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Character).where(Character.id == request.character_id))
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    import json
    abilities_talents = json.loads(character.abilities_talents_json or "{}")
    abilities_skills = json.loads(character.abilities_skills_json or "{}")
    abilities_knowledges = json.loads(character.abilities_knowledges_json or "{}")
    disciplines = json.loads(character.disciplines_json or "{}")
    
    character_sheet = {
        "name": character.name,
        "physical_strength": character.physical_strength,
        "physical_dexterity": character.physical_dexterity,
        "physical_stamina": character.physical_stamina,
        "social_charisma": character.social_charisma,
        "social_manipulation": character.social_manipulation,
        "social_appearance": character.social_appearance,
        "mental_perception": character.mental_perception,
        "mental_intelligence": character.mental_intelligence,
        "mental_wits": character.mental_wits,
        "abilities_talents": abilities_talents,
        "abilities_skills": abilities_skills,
        "abilities_knowledges": abilities_knowledges,
        "disciplines": disciplines
    }
    
    prompt = (
        f"Character Sheet: {json.dumps(character_sheet, indent=2)}\n\n"
        "Based on the character's stats and the given context, suggest 3 actions.\n"
        "For each action, calculate the exact dice pool by adding the relevant Attribute + Ability rating.\n"
        "Return the result STRICTLY as a JSON array of objects, where each object has:\n"
        '- "description": A short string describing the action\n'
        '- "pool": The dice pool size (integer)\n'
        '- "difficulty": The difficulty of the roll (integer, default 6)\n\n'
        f"Context: {request.context}"
    )
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "qwen2.5-coder:14b",
                    "prompt": prompt,
                    "format": "json",
                    "stream": False
                },
                timeout=60.0
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to generate actions")
        
    try:
        suggestions_text = response.json().get("response", "[]")
        suggestions = json.loads(suggestions_text)
    except Exception:
        suggestions = []
    
    return {
        "character_id": request.character_id,
        "suggested_actions": suggestions
    }

@router.post("/api/action/campaign/{campaign_id}/nightfall", dependencies=[Depends(require_storyteller)])
async def nightfall_endpoint(campaign_id: int, db: AsyncSession = Depends(get_db)):
    query = select(Character).where(Character.is_npc == False, Character.blood_pool_current > 0)
    result = await db.execute(query)
    characters_to_update = result.scalars().all()

    if not characters_to_update:
        return {"message": "No players to update."}

    update_query = (
        update(Character)
        .where(
            Character.is_npc == False,
            Character.blood_pool_current > 0
        )
        .values(blood_pool_current=Character.blood_pool_current - 1)
    )
    await db.execute(update_query)
    await db.commit()

    await manager.broadcast(campaign_id, {"type": "NIGHTFALL", "message": "A new night begins. All Kindred spend 1 Blood Point to awaken."})

    return {
        "message": "Nightfall processed successfully.",
        "updated_characters_count": len(characters_to_update)
    }
