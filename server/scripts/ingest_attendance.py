import asyncio
import csv
from sqlalchemy.future import select
from server.database import _get_session_factory, SessionLog, Character, User, SessionAttendance, init_db

async def ingest_attendance():
    await init_db()
    SessionLocal = _get_session_factory()
    
    async with SessionLocal() as session:
        # Step 7: Query all SessionLog into a dictionary {session_number: session_id}
        result = await session.execute(select(SessionLog.session_number, SessionLog.id))
        session_dict = {row[0]: row[1] for row in result}

        # Step 8: For each row, if the session exists in the DB, iterate through the character columns
        with open('knowledge_base/sessions.csv', newline='', encoding='utf-8') as csvfile:
            for _ in range(3):
                next(csvfile)  # Skip first 3 lines
            reader = csv.DictReader(csvfile)

            result = await session.execute(select(User).where(User.username == 'unknown_player'))
            unknown_user = result.scalars().first()
            if unknown_user is None:
                unknown_user = User(username='unknown_player', display_name='Unknown Player', password_hash='dummy')
                session.add(unknown_user)
                await session.flush()
            unknown_user_id = unknown_user.id

            characters_cache = {}
            attendance_records_added = 0

            for row in reader:
                if not row['session'].isdigit():
                    continue

                session_number = int(row['session'])
                if session_number in session_dict:
                    session_id = session_dict[session_number]

                    for char_name in ['salazar', 'constantin', 'fiori', 'adbdal', 'apophis', 'vitas', 'owen', 'octavian', 'vladislav', 'anatolio', 'lutz', 'gabor', 'ezio', 'isla', 'harvey', 'salvatore']:
                        if row.get(char_name) and row[char_name].strip():
                            xp_gained = int(row[char_name].strip())

                            # Step 10: Check if a Character with name.lower() == char_name.lower() exists
                            char_lower = char_name.lower()
                            if char_lower not in characters_cache:
                                result = await session.execute(select(Character).where(Character.name.ilike(f"%{char_lower}%")))
                                character = result.scalars().first()

                                if character is None:
                                    # Step 11: If the character doesn't exist, create a Character and assign to unknown_player
                                    character = Character(name=char_name.capitalize(), user_id=unknown_user_id, is_npc=False)
                                    session.add(character)
                                    await session.flush()  # To get the character.id

                                characters_cache[char_lower] = character.id

                            char_id = characters_cache[char_lower]

                            # Step 12: Check if SessionAttendance(session_id, character_id) already exists
                            result = await session.execute(
                                select(SessionAttendance)
                                .where(SessionAttendance.session_id == session_id)
                                .where(SessionAttendance.character_id == char_id)
                            )
                            attendance = result.scalars().first()

                            if attendance is None:
                                attendance = SessionAttendance(session_id=session_id, character_id=char_id, xp_gained=xp_gained)
                                session.add(attendance)
                                attendance_records_added += 1
                            else:
                                attendance.xp_gained = xp_gained

            await session.commit()
            print(f"Number of attendance records added or updated: {attendance_records_added}")

if __name__ == "__main__":
    asyncio.run(ingest_attendance())
