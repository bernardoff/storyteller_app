from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import json

from server.database import get_db, CombatEncounter
from server.auth import require_storyteller

router = APIRouter(prefix="/api/combat", tags=["combat"])

@router.post("/start")
async def start_combat(session: AsyncSession = Depends(get_db)):
    new_encounter = CombatEncounter(
        campaign_id=1,
        name="Encounter 1",
        is_active=True
    )
    session.add(new_encounter)
    await session.commit()
    await session.refresh(new_encounter)
    return {"id": new_encounter.id}

@router.post("/{id}/next", dependencies=[Depends(require_storyteller)])
async def next_turn(id: int, session: AsyncSession = Depends(get_db)):
    encounter = await session.get(CombatEncounter, id)
    if not encounter:
        raise HTTPException(status_code=404, detail="Combat encounter not found")
    
    encounter.current_turn_index += 1
    if encounter.combatants_json:
        combatants = json.loads(encounter.combatants_json)
        if encounter.current_turn_index >= len(combatants):
            encounter.current_turn_index = 0
            encounter.round_number += 1
    
    await session.commit()
    await session.refresh(encounter)
    
    return {
        "id": encounter.id,
        "name": encounter.name,
        "is_active": encounter.is_active,
        "current_turn_index": encounter.current_turn_index,
        "round_number": encounter.round_number,
        "combatants": json.loads(encounter.combatants_json) if encounter.combatants_json else []
    }

@router.get("/{id}")
async def get_combat(id: int, session: AsyncSession = Depends(get_db)):
    encounter = await session.get(CombatEncounter, id)
    if not encounter:
        raise HTTPException(status_code=404, detail="Combat encounter not found")
    
    return {
        "id": encounter.id,
        "name": encounter.name,
        "is_active": encounter.is_active,
        "current_turn_index": encounter.current_turn_index,
        "round_number": encounter.round_number,
        "combatants": json.loads(encounter.combatants_json) if encounter.combatants_json else []
    }

@router.post("/{id}/combatants")
async def update_combatants(id: int, combatants: list[dict], session: AsyncSession = Depends(get_db)):
    encounter = await session.get(CombatEncounter, id)
    if not encounter:
        raise HTTPException(status_code=404, detail="Combat encounter not found")
    
    encounter.combatants_json = json.dumps(combatants)
    await session.commit()
    await session.refresh(encounter)
    
    return {
        "id": encounter.id,
        "combatants": combatants
    }

@router.post("/{id}/end")
async def end_combat(id: int, session: AsyncSession = Depends(get_db), current_user=Depends(require_storyteller)):
    encounter = await session.get(CombatEncounter, id)
    if not encounter:
        raise HTTPException(status_code=404, detail="Combat encounter not found")
    encounter.is_active = False
    await session.commit()
    return {"id": encounter.id, "is_active": False}
