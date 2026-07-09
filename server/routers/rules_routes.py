from fastapi import APIRouter, Depends, Query
from server.engines.rag_engine import search_rules, search_rules_text
from server.auth import get_current_user

router = APIRouter(prefix="/api/rules", tags=["rules"])

@router.get("/search")
async def search(q: str, n_results: int = 3, user=Depends(get_current_user)):
    return search_rules(q, n_results)

@router.get("/search/text")
async def search_text(q: str, n_results: int = 3, user=Depends(get_current_user)):
    return search_rules_text(q, n_results)
