from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from server.database import get_db, EquipmentCatalog
from server.auth import get_current_user

router = APIRouter(prefix="/api/equipment", tags=["equipment"])

@router.get("/")
async def list_equipment(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    query = select(EquipmentCatalog)
    result = await db.execute(query)
    items = result.scalars().all()
    return [item.__dict__ for item in items]

@router.post("/")
async def create_equipment(item: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    if getattr(user, 'role', 'player') != 'storyteller':
        raise HTTPException(status_code=403, detail="Forbidden")
    new_item = EquipmentCatalog(**item)
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    return new_item.__dict__

@router.put("/{id}")
async def update_equipment(id: int, item: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    if getattr(user, 'role', 'player') != 'storyteller':
        raise HTTPException(status_code=403, detail="Forbidden")
    query = select(EquipmentCatalog).where(EquipmentCatalog.id == id)
    result = await db.execute(query)
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=404, detail="Not found")
        
    for key, value in item.items():
        if hasattr(db_item, key):
            setattr(db_item, key, value)
            
    await db.commit()
    await db.refresh(db_item)
    return db_item.__dict__

@router.delete("/{id}")
async def delete_equipment(id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    if getattr(user, 'role', 'player') != 'storyteller':
        raise HTTPException(status_code=403, detail="Forbidden")
    query = select(EquipmentCatalog).where(EquipmentCatalog.id == id)
    result = await db.execute(query)
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=404, detail="Not found")
    
    await db.delete(db_item)
    await db.commit()
    return {"status": "deleted"}
