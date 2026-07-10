from fastapi import APIRouter, Depends, HTTPException
from server.engines.gemini_brain import brain_engine
from pydantic import BaseModel
from server.auth import get_current_user

router = APIRouter(prefix="/api/brain", tags=["brain"])

class AskRequest(BaseModel):
    query: str
    domain: str = "rules"

class ChatRequest(BaseModel):
    history: list
    domain: str = "rules"

@router.post("/ask")
async def ask(req: AskRequest, user=Depends(get_current_user)):
    result = brain_engine.ask(req.query, req.domain)
    return {"response": result}

@router.post("/chat")
async def chat(req: ChatRequest, user=Depends(get_current_user)):
    result = brain_engine.chat(req.history, req.domain)
    return {"response": result}

@router.get("/discipline/{name}")
def get_discipline(name: str, level: int = 5, user=Depends(get_current_user)):
    query = f"Extract the original rules text and system description for the discipline {name} from level 1 to level {level} from the V20 Dark Ages rulebook. Provide the original rules text exactly as it appears in the book, formatted in markdown."
    result = brain_engine.ask(query, "rules")
    return {"text": result}

@router.get("/status")
async def status(user=Depends(get_current_user)):
    return {"status": "online" if brain_engine.client else "offline"}
