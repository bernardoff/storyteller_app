import asyncio
from sqlalchemy import select
from server.database import get_db, Character, _get_engine, _session_factory
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

async def main():
    engine = _get_engine()
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as db:
        result = await db.execute(select(Character))
        characters = result.scalars().all()
        if characters:
            c = characters[0]
            d = c.__dict__
            print("Keys:", d.keys())
            # try to serialize
            import json
            try:
                # strip _sa_instance_state to mimic if they fixed it elsewhere
                d_copy = {k: v for k, v in d.items() if not k.startswith('_')}
                print("JSON:", json.dumps(d_copy, default=str))
            except Exception as e:
                print("JSON Error:", e)
        else:
            print("No characters found.")

if __name__ == '__main__':
    asyncio.run(main())
