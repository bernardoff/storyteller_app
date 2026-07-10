import asyncio
from sqlalchemy import select
from server.database import get_db, Character, _get_engine, _session_factory
from sqlalchemy.ext.asyncio import async_sessionmaker

async def main():
    engine = _get_engine()
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as db:
        result = await db.execute(select(Character).where(Character.id == 1))
        char = result.scalar_one_or_none()
        if char:
            try:
                char.abilities_talents_json = {"Alertness": 3}
                await db.commit()
                print("Saved dict successfully")
            except Exception as e:
                print("Error saving dict:", str(e))
        else:
            print("No char 1")

if __name__ == '__main__':
    asyncio.run(main())
