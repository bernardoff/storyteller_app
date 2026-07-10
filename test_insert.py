import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from server.database import SessionLocal, SessionLog

async def test_insert():
    async with SessionLocal() as db:
        new_session = SessionLog(
            campaign_id=1,
            session_number=99,
            title="Test",
            detailed_log="Test Log"
        )
        db.add(new_session)
        try:
            await db.commit()
            print("Insert successful!")
        except Exception as e:
            print("Insert failed:", e)

if __name__ == "__main__":
    asyncio.run(test_insert())
