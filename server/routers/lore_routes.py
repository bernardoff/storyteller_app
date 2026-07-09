from fastapi import APIRouter, HTTPException
from server.engines.rag_engine import ingest_lore_text, search_lore

router = APIRouter()

@router.post("/api/lore/ingest")
async def ingest_lore(data: dict):
    text = data.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        # Ingest text into ChromaDB lore collection
        ingest_lore_text(text)
        return {"status": "success", "message": "Lore properly ingested into the vector database."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/lore/search")
async def query_lore(q: str):
    if not q:
        raise HTTPException(status_code=400, detail="Query is required")
    try:
        results = search_lore(q, n_results=3)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
