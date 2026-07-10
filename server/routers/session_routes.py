from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from server.database import get_db, SessionLog, Campaign
from server.auth import get_current_user, require_storyteller
from server.websocket_manager import manager
from server.engines.audio_engine import process_session_audio
import urllib.request
import json
import os
import shutil

router = APIRouter(prefix="/api/session", tags=["session"])

class SessionLogCreate(BaseModel):
    campaign_id: int
    session_number: int
    title: str
    detailed_log: str

class SessionLogResponse(BaseModel):
    id: int
    campaign_id: int
    session_number: int
    title: Optional[str]
    summary: Optional[str]
    detailed_log: Optional[str]

@router.post("/", response_model=SessionLogResponse)
async def create_session_log(
    session_log_create: SessionLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_storyteller)
):
    new_session_log = SessionLog(**session_log_create.dict())
    db.add(new_session_log)
    await db.commit()
    await db.refresh(new_session_log)
    return new_session_log

@router.get("/", response_model=List[SessionLogResponse])
async def list_session_logs(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    result = await db.execute(select(SessionLog))
    session_logs = result.scalars().all()
    return session_logs

@router.post("/{id}/upload_audio")
async def upload_audio(
    id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_storyteller)
):
    result = await db.execute(select(SessionLog).where(SessionLog.id == id))
    session_log = result.scalar_one_or_none()
    
    if not session_log:
        raise HTTPException(status_code=404, detail="Session not found")
        
    os.makedirs('scratch/audio', exist_ok=True)
    temp_path = f"scratch/audio/session_{id}_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    session_log.audio_status = "processing"
    await db.commit()
    
    background_tasks.add_task(process_session_audio, id, temp_path)
    return {"message": "Audio upload received, processing in background."}

@router.post("/{id}/summarize", response_model=SessionLogResponse)
async def summarize_session_log(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_storyteller)
):
    result = await db.execute(select(SessionLog).where(SessionLog.id == id))
    session_log = result.scalar_one_or_none()
    
    if not session_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session log not found")
    
    prompt = f"Summarize this RPG session log into a narrative summary: {session_log.detailed_log}"
    data = {
        "model": "qwen2.5-coder:14b",
        "prompt": prompt,
        "stream": False
    }
    
    headers = {'Content-Type': 'application/json'}
    req = urllib.request.Request('http://127.0.0.1:11434/api/generate', data=json.dumps(data).encode(), headers=headers)
    with urllib.request.urlopen(req) as response:
        response_data = json.load(response)
    
    summary = response_data.get("response", "")
    session_log.summary = summary
    await db.commit()
    await db.refresh(session_log)
    
    return session_log

class ThreatLevelUpdate(BaseModel):
    threat_level: int

class ThreatLevelResponse(BaseModel):
    threat_level: int

@router.get("/campaign/{campaign_id}/threat", response_model=ThreatLevelResponse)
async def get_campaign_threat_level(campaign_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    
    return {"threat_level": campaign.masquerade_threat_level}

@router.post("/campaign/{campaign_id}/threat", response_model=ThreatLevelResponse)
async def update_campaign_threat_level(campaign_id: int, threat_level_update: ThreatLevelUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_storyteller)):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    
    campaign.masquerade_threat_level = threat_level_update.threat_level
    await db.commit()
    
    await manager.broadcast(campaign_id, {
        "type": "THREAT_LEVEL_UPDATE",
        "threat_level": campaign.masquerade_threat_level
    })
    
    return {"threat_level": campaign.masquerade_threat_level}
