from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List
import json
from server.engines.dice_engine import roll_v20, roll_initiative, contested_roll
from server.database import get_db, DiceRoll
from server.auth import get_current_user

router = APIRouter(prefix="/api/dice", tags=["dice"])

class RollRequest(BaseModel):
    pool_size: int
    difficulty: int
    specialty: bool
    willpower: bool = False
    context: str = None

@router.post("/roll")
async def roll_dice(request: RollRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = roll_v20(request.pool_size, request.difficulty, request.specialty, request.willpower)
    dice_roll = DiceRoll(
        user_id=user.id,
        pool_size=request.pool_size,
        difficulty=request.difficulty,
        specialty=request.specialty,
        context=request.context,
        rolls_json=json.dumps(result['rolls']),
        successes=result['successes'],
        is_botch=result['is_botch'],
        result_label=result['result_label']
    )
    db.add(dice_roll)
    await db.commit()
    await db.refresh(dice_roll)
    return {
        "result_label": result['result_label'],
        "successes": result['successes'],
        "rolls_json": json.dumps(result['rolls'])
    }

@router.post("/initiative")
async def roll_initiative_endpoint(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    # Implement initiative roll logic here
    pass

@router.post("/contested")
async def contested_roll_endpoint(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    # Implement contested roll logic here
    pass

@router.get("/history")
async def get_dice_history(limit: int = Query(10, ge=1, le=100), db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    query = select(DiceRoll).where(DiceRoll.user_id == user.id).order_by(DiceRoll.id.desc()).limit(limit)
    result = await db.execute(query)
    rolls = result.scalars().all()
    return list(rolls)
