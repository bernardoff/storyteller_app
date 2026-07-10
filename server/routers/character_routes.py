from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from server.database import get_db, Character
from server.auth import get_current_user

router = APIRouter(prefix="/api/character", tags=["characters"])

@router.get("/")
async def list_characters(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    if user.role == 'storyteller':
        query = select(Character)
    else:
        query = select(Character).where(Character.user_id == user.id)
    
    result = await db.execute(query)
    characters = result.scalars().all()
    return [character.__dict__ for character in characters]

@router.post("/")
async def create_character(character: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    import json
    processed_character = {}
    for key, value in character.items():
        if isinstance(value, (dict, list)):
            processed_character[key] = json.dumps(value)
        else:
            processed_character[key] = value
    new_character = Character(user_id=user.id, **processed_character)
    db.add(new_character)
    await db.commit()
    await db.refresh(new_character)
    return new_character.__dict__

@router.get("/{id}")
async def get_character(id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    query = select(Character).where(Character.id == id)
    result = await db.execute(query)
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    if user.role != 'storyteller' and character.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    return character.__dict__

@router.put("/{id}")
async def update_character(id: int, character_data: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    import json
    query = select(Character).where(Character.id == id)
    result = await db.execute(query)
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    if getattr(character, "is_locked", False) and user.role != 'storyteller':
        raise HTTPException(status_code=403, detail="Character sheet is locked by the Storyteller")
    
    if user.role != 'storyteller' and character.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    for key, value in character_data.items():
        if isinstance(value, (dict, list)):
            setattr(character, key, json.dumps(value))
        else:
            setattr(character, key, value)
    
    await db.commit()
    await db.refresh(character)
    return character.__dict__

@router.delete("/{id}")
async def delete_character(id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    query = select(Character).where(Character.id == id)
    result = await db.execute(query)
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
        
    if user.role != 'storyteller' and character.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    await db.delete(character)
    await db.commit()
    return {"status": "success", "message": "Character deleted"}
