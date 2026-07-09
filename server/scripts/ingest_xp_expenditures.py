import asyncio
import csv
from sqlalchemy.future import select
from server.database import _get_session_factory, SessionLog, Character, User, XpExpenditure, init_db

async def ingest_xp_expenditures():
    await init_db()
    SessionLocal = _get_session_factory()
    
    async with SessionLocal() as session:
        # Get all session logs into a dict: session_number -> session_id
        result = await session.execute(select(SessionLog.session_number, SessionLog.id))
        session_dict = {row[0]: row[1] for row in result}

        count = 0
        with open('knowledge_base/gastos_xp.csv', newline='', encoding='utf-8') as csvfile:
            next(csvfile) # Skip first line (headers)
            reader = csv.reader(csvfile)
            
            result = await session.execute(select(User).where(User.username == 'unknown_player'))
            unknown_user = result.scalars().first()
            if unknown_user is None:
                unknown_user = User(username='unknown_player', display_name='Unknown Player', password_hash='dummy')
                session.add(unknown_user)
                await session.flush()
            unknown_user_id = unknown_user.id

            characters_cache = {}

            for row in reader:
                # Format: Player,Aventura,XP,Compra,,,,,,Character,xp spent,xp earned,remaining
                if len(row) < 4: continue
                player = row[0].strip()
                aventura = row[1].strip()
                xp = row[2].strip()
                compra = row[3].strip()

                if not player or not aventura.isdigit():
                    continue

                session_number = int(aventura)
                session_id = session_dict.get(session_number)
                
                try:
                    xp_cost = int(xp)
                except ValueError:
                    xp_cost = 0

                # Check if a Character with name.lower() == player.lower() exists
                char_lower = player.lower()
                if char_lower not in characters_cache:
                    result = await session.execute(select(Character).where(Character.name.ilike(f"%{char_lower}%")))
                    character = result.scalars().first()

                    if character is None:
                        character = Character(name=player.capitalize(), user_id=unknown_user_id, is_npc=False)
                        session.add(character)
                        await session.flush()

                    characters_cache[char_lower] = character.id

                char_id = characters_cache[char_lower]

                # Create XpExpenditure record
                xp_expenditure = XpExpenditure(
                    character_id=char_id,
                    session_id=session_id,
                    cost=xp_cost,
                    description=compra,
                )
                session.add(xp_expenditure)
                count += 1
                
        await session.commit()
        print(f"Inserted {count} records into XpExpenditure table.")

if __name__ == "__main__":
    asyncio.run(ingest_xp_expenditures())
