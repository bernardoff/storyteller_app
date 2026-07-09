import asyncio
import csv
from sqlalchemy.future import select
from server.database import _get_session_factory, SessionLog, Character, User, DiablerieRecord, init_db

async def ingest_diableries():
    await init_db()
    SessionLocal = _get_session_factory()
    
    async with SessionLocal() as session:
        # Get all session logs into a dict: session_number -> session_id
        result = await session.execute(select(SessionLog.session_number, SessionLog.id))
        session_dict = {row[0]: row[1] for row in result}

        count = 0
        with open('knowledge_base/diableries.csv', newline='', encoding='utf-8') as csvfile:
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
                if len(row) < 12: continue
                # player, # of diableries, diablerized, session, player disciplines, npc disciplines, difference, points gained /4, discipline gained, player generation, npc generation, generation gained
                
                player = row[0].strip()
                victim = row[2].strip()
                session_num_str = row[3].strip()
                disc_gained = row[8].strip()
                gen_gained_str = row[11].strip()

                if not player or not session_num_str.isdigit():
                    continue

                session_number = int(session_num_str)
                session_id = session_dict.get(session_number)
                
                try:
                    gen_gained = int(gen_gained_str)
                except ValueError:
                    gen_gained = 0

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

                # Create DiablerieRecord record
                diablerie = DiablerieRecord(
                    diablerist_id=char_id,
                    victim_name=victim,
                    session_id=session_id,
                    generation_gained=gen_gained,
                    disciplines_gained=disc_gained
                )
                session.add(diablerie)
                count += 1
                
        await session.commit()
        print(f"Inserted {count} records into DiablerieRecord table.")

if __name__ == "__main__":
    asyncio.run(ingest_diableries())
