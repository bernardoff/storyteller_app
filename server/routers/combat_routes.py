from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from server.database import get_db, CombatEncounter, Character
from server.auth import get_current_user
from pydantic import BaseModel
import json
import httpx
import random

router = APIRouter()

class ResolveActionRequest(BaseModel):
    character_id: int
    action_description: str
    engine: str = "gemini"

@router.post("/api/combat/start")
async def start_combat(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    # Create a new combat encounter
    new_encounter = CombatEncounter(
        campaign_id=1, # Default or get from user/session
        name="New Combat",
        is_active=True,
        phase="setup",
        combatants_json="[]"
    )
    db.add(new_encounter)
    await db.commit()
    await db.refresh(new_encounter)
    return {"id": new_encounter.id, "status": "started"}

@router.get("/api/combat/{id}")
async def get_combat(id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    query = select(CombatEncounter).where(CombatEncounter.id == id)
    result = await db.execute(query)
    encounter = result.scalar_one_or_none()
    if not encounter:
        raise HTTPException(status_code=404, detail="Combat encounter not found")
    
    return {
        "id": encounter.id,
        "name": encounter.name,
        "phase": encounter.phase,
        "current_turn_index": encounter.current_turn_index,
        "round_number": encounter.round_number,
        "combatants": json.loads(encounter.combatants_json or "[]")
    }

class AddCharacterRequest(BaseModel):
    character_id: int

@router.post("/api/combat/{id}/add-character")
async def add_character(id: int, req: AddCharacterRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    char_query = select(Character).where(Character.id == req.character_id)
    char_result = await db.execute(char_query)
    character = char_result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    enc_query = select(CombatEncounter).where(CombatEncounter.id == id)
    enc_result = await db.execute(enc_query)
    encounter = enc_result.scalar_one_or_none()
    if not encounter:
        raise HTTPException(status_code=404, detail="Combat not found")

    combatants = json.loads(encounter.combatants_json or "[]")
    # Avoid duplicates
    if not any(c.get("character_id") == character.id for c in combatants):
        combatants.append({
            "character_id": character.id,
            "name": character.name,
            "type": character.character_type,
            "initiative": None,
            "has_rolled": False
        })
        encounter.combatants_json = json.dumps(combatants)
        await db.commit()
    
    return {"status": "added"}

class GenerateNPCRequest(BaseModel):
    name: str
    concept: str
    character_type: str = "NPC_Critter"

@router.post("/api/combat/{id}/generate-npc")
async def generate_npc(id: int, req: GenerateNPCRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    prompt = (
        f"Generate V20 Dark Ages character stats for a '{req.concept}'.\n"
        "Return STRICTLY a JSON object with integer values (1-5) for:\n"
        "physical_strength, physical_dexterity, physical_stamina, mental_wits.\n"
        "Return only the JSON object."
    )
    
    stats = {
        "physical_strength": 2, "physical_dexterity": 2, "physical_stamina": 2, "mental_wits": 2
    }
    
    try:
        async with httpx.AsyncClient() as client:
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
            if response.status_code == 200:
                gen_stats = json.loads(response.json().get("response", "{}"))
                if gen_stats:
                    stats.update(gen_stats)
    except Exception as e:
        print("LLM Error:", e)

    # Save to DB
    new_char = Character(
        user_id=user.id,
        name=req.name,
        concept=req.concept,
        character_type=req.character_type,
        physical_strength=stats.get("physical_strength", 2),
        physical_dexterity=stats.get("physical_dexterity", 2),
        physical_stamina=stats.get("physical_stamina", 2),
        mental_wits=stats.get("mental_wits", 2),
        is_npc=True
    )
    db.add(new_char)
    await db.commit()
    await db.refresh(new_char)

    # Add to encounter
    enc_query = select(CombatEncounter).where(CombatEncounter.id == id)
    enc_result = await db.execute(enc_query)
    encounter = enc_result.scalar_one_or_none()
    
    combatants = json.loads(encounter.combatants_json or "[]")
    combatants.append({
        "character_id": new_char.id,
        "name": new_char.name,
        "type": new_char.character_type,
        "initiative": None,
        "has_rolled": False
    })
    encounter.combatants_json = json.dumps(combatants)
    await db.commit()

    return {"status": "generated and added"}

class RollInitiativeRequest(BaseModel):
    character_id: int

@router.post("/api/combat/{id}/roll-initiative")
async def roll_initiative(id: int, req: RollInitiativeRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    char_query = select(Character).where(Character.id == req.character_id)
    char_result = await db.execute(char_query)
    character = char_result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    disciplines = json.loads(character.disciplines_json or "{}")
    celerity_rating = disciplines.get("Celerity", 0)
    if isinstance(celerity_rating, dict): # just in case it's a complex object
        celerity_rating = celerity_rating.get("rating", 0)

    # Dexterity + Wits + Celerity + d10
    base = character.physical_dexterity + character.mental_wits + int(celerity_rating)
    roll = random.randint(1, 10)
    total_init = base + roll

    enc_query = select(CombatEncounter).where(CombatEncounter.id == id)
    enc_result = await db.execute(enc_query)
    encounter = enc_result.scalar_one_or_none()
    
    combatants = json.loads(encounter.combatants_json or "[]")
    for c in combatants:
        if c.get("character_id") == req.character_id:
            c["initiative"] = total_init
            c["has_rolled"] = True
            c["init_breakdown"] = f"Dex({character.physical_dexterity}) + Wits({character.mental_wits}) + Cel({celerity_rating}) + Roll({roll}) = {total_init}"
            break
            
    # Sort automatically by initiative
    combatants.sort(key=lambda x: x.get("initiative") or -99, reverse=True)
    encounter.combatants_json = json.dumps(combatants)
    await db.commit()

    return {"status": "success", "total_initiative": total_init}

class SetPhaseRequest(BaseModel):
    phase: str

@router.post("/api/combat/{id}/phase")
async def set_phase(id: int, req: SetPhaseRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    enc_query = select(CombatEncounter).where(CombatEncounter.id == id)
    enc_result = await db.execute(enc_query)
    encounter = enc_result.scalar_one_or_none()
    if not encounter:
        raise HTTPException(status_code=404, detail="Not found")
    encounter.phase = req.phase
    if req.phase == "active":
        encounter.current_turn_index = 0
    await db.commit()
    return {"status": "phase changed"}

@router.post("/api/combat/{id}/next")
async def next_turn(id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    enc_query = select(CombatEncounter).where(CombatEncounter.id == id)
    enc_result = await db.execute(enc_query)
    encounter = enc_result.scalar_one_or_none()
    
    combatants = json.loads(encounter.combatants_json or "[]")
    encounter.current_turn_index += 1
    if encounter.current_turn_index >= len(combatants):
        encounter.current_turn_index = 0
        encounter.round_number += 1
        
    await db.commit()
    return {"status": "next turn"}

@router.post("/api/combat/{id}/end")
async def end_combat(id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    enc_query = select(CombatEncounter).where(CombatEncounter.id == id)
    enc_result = await db.execute(enc_query)
    encounter = enc_result.scalar_one_or_none()
    
    encounter.is_active = False
    await db.commit()
    return {"status": "ended"}

@router.post("/api/combat/{id}/resolve-action-llm")
async def resolve_action_llm(id: int, request: ResolveActionRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    # Rest of the action resolution endpoint using AsyncSession...
    char_query = select(Character).where(Character.id == request.character_id)
    char_result = await db.execute(char_query)
    character = char_result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    abilities_talents = json.loads(character.abilities_talents_json or "{}")
    abilities_skills = json.loads(character.abilities_skills_json or "{}")
    abilities_knowledges = json.loads(character.abilities_knowledges_json or "{}")
    disciplines = json.loads(character.disciplines_json or "{}")
    equipment = json.loads(getattr(character, "equipment_json", "{}") or "{}")
    
    character_sheet = {
        "name": character.name,
        "physical_strength": character.physical_strength,
        "physical_dexterity": character.physical_dexterity,
        "physical_stamina": character.physical_stamina,
        "abilities_talents": abilities_talents,
        "abilities_skills": abilities_skills,
        "abilities_knowledges": abilities_knowledges,
        "disciplines": disciplines,
        "equipment": equipment
    }

    prompt = (
        f"Character Sheet: {json.dumps(character_sheet, indent=2)}\n\n"
        f"Analyze the action '{request.action_description}' based on V20 Dark Ages rules.\n"
        "Apply any multiple action penalties or Celerity rules if applicable based on the character's stats.\n"
        "CRITICAL: If the character has any 'equipped: true' armor in their equipment list, you MUST subtract its 'penalty' value from the pool for any Dexterity-based rolls (like Melee, Brawl, Firearms, Athletics, Dodge).\n"
        "You MUST explicitly document the armor penalty in the 'description' (e.g. 'Dex 3 + Melee 4 - Armor Penalty 1').\n"
        "Provide the result STRICTLY as a JSON array of objects representing the required dice rolls.\n"
        "Each object must have 'description', 'pool', and 'difficulty' (default 6) fields."
    )

    if request.engine == "gemini":
        from server.engines.gemini_brain import brain_engine
        response = brain_engine.ask(prompt, domain="rules")
        if response.startswith("```json"):
            response = response[7:-3]
        elif response.startswith("```"):
            response = response[3:-3]
        try:
            actions = json.loads(response.strip())
        except Exception:
            actions = []
    elif request.engine == "llama":
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "http://localhost:11434/api/generate",
                    json={
                        "model": "qwen2.5-coder:14b",
                        "prompt": prompt,
                        "format": "json",
                        "stream": False
                    },
                    timeout=60.0
                )
            if res.status_code == 200:
                resp_text = res.json().get("response", "[]")
                actions = json.loads(resp_text)
            else:
                actions = []
        except Exception:
            actions = []
    else:
        raise HTTPException(status_code=400, detail="Invalid engine specified")

    return {"actions": actions}