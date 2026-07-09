import asyncio
import io
import csv
from datetime import datetime
import httpx
from sqlalchemy.future import select
from server.database import _get_session_factory, Campaign, SessionLog, Character, User, SessionAttendance, XpExpenditure, DiablerieRecord, init_db

SESSIONS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhShzXlbh4HEkDMZR_DNp4Mfg0QygU6ejJbh_wpZGaelzVzCfDeM3kL5CzZtLyamik6WrfMnpYwL-/pub?output=csv&gid=801058587"
XP_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhShzXlbh4HEkDMZR_DNp4Mfg0QygU6ejJbh_wpZGaelzVzCfDeM3kL5CzZtLyamik6WrfMnpYwL-/pub?output=csv&gid=437688875"
DIABLERIES_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhShzXlbh4HEkDMZR_DNp4Mfg0QygU6ejJbh_wpZGaelzVzCfDeM3kL5CzZtLyamik6WrfMnpYwL-/pub?output=csv&gid=1059318104"

async def fetch_csv(url):
    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
        return io.StringIO(response.text)

async def _get_or_create_character(session, characters_cache, player_name):
    char_lower = player_name.lower()
    if char_lower not in characters_cache:
        result = await session.execute(select(Character).where(Character.name.ilike(f"%{char_lower}%")))
        character = result.scalars().first()

        if character is None:
            user = User(username=f'unknown_{char_lower}', display_name='Unknown Player', password_hash='dummy')
            session.add(user)
            await session.flush()
            character = Character(name=player_name.capitalize(), user_id=user.id, is_npc=False)
            session.add(character)
            await session.flush()
        characters_cache[char_lower] = character.id
    return characters_cache[char_lower]

async def sync_all_from_google_sheets():
    await init_db()
    SessionLocal = _get_session_factory()
    
    print("Fetching CSVs from Google Sheets...")
    sessions_csv_data = await fetch_csv(SESSIONS_URL)
    xp_csv_data = await fetch_csv(XP_URL)
    diableries_csv_data = await fetch_csv(DIABLERIES_URL)
    
    async with SessionLocal() as session:
        async with session.begin():
            # 1. Campaigns & Sessions
            campaign_result = await session.execute(select(Campaign).where(Campaign.name == "Vampire Dark Ages"))
            campaign = campaign_result.scalars().first()
            if not campaign:
                campaign = Campaign(name="Vampire Dark Ages")
                session.add(campaign)
                await session.flush()
            campaign_id = campaign.id

            inserted_sessions = 0
            for _ in range(3):
                next(sessions_csv_data)
                
            reader = csv.DictReader(sessions_csv_data)
            rows = list(reader) # store in memory to reuse for attendance
            
            for row in rows:
                session_col_name = 'session id' if 'session id' in row else 'session'
                if not row.get(session_col_name) or not row[session_col_name].isdigit():
                    continue

                session_number = int(row[session_col_name])
                played_at = None
                if row.get('date'):
                    try:
                        played_at = datetime.strptime(row['date'], '%d/%m/%Y')
                    except ValueError:
                        pass
                location = row.get('Localidade', '')
                summary = row.get('Log', '')
                title = f"Season {row.get('season', '')} Episode {row.get('episode', '')}".strip()

                existing_result = await session.execute(
                    select(SessionLog)
                    .where(SessionLog.campaign_id == campaign_id)
                    .where(SessionLog.session_number == session_number)
                )
                existing = existing_result.scalars().first()
                if not existing:
                    session_log = SessionLog(
                        session_number=session_number,
                        played_at=played_at, location=location, summary=summary, title=title, campaign_id=campaign_id
                    )
                    session.add(session_log)
                    inserted_sessions += 1
                else:
                    existing.played_at = played_at
                    existing.location = location
                    existing.summary = summary
                    existing.title = title
            await session.flush()
            print(f"Synced {inserted_sessions} new sessions.")

            # Map session numbers to IDs
            result = await session.execute(select(SessionLog.session_number, SessionLog.id))
            session_dict = {r[0]: r[1] for r in result}
            
            # 2. Attendance
            characters_cache = {}
            attendance_added = 0
            for row in rows:
                session_col_name = 'session id' if 'session id' in row else 'session'
                if not row.get(session_col_name) or not row[session_col_name].isdigit(): continue
                session_number = int(row[session_col_name])
                session_id = session_dict.get(session_number)
                if not session_id: continue
                
                for char_name in ['salazar', 'constantin', 'fiori', 'adbdal', 'apophis', 'vitas', 'owen', 'octavian', 'vladislav', 'anatolio', 'lutz', 'gabor', 'ezio', 'isla', 'harvey', 'salvatore']:
                    if row.get(char_name) and row[char_name].strip():
                        xp_gained = int(row[char_name].strip())
                        char_id = await _get_or_create_character(session, characters_cache, char_name)
                        
                        existing_result = await session.execute(
                            select(SessionAttendance)
                            .where(SessionAttendance.session_id == session_id)
                            .where(SessionAttendance.character_id == char_id)
                        )
                        existing = existing_result.scalars().first()
                        if not existing:
                            attendance = SessionAttendance(session_id=session_id, character_id=char_id, xp_gained=xp_gained)
                            session.add(attendance)
                            attendance_added += 1
                        else:
                            existing.xp_gained = xp_gained
            print(f"Synced {attendance_added} new attendance records.")

            # 3. XP Expenditures
            xp_added = 0
            next(xp_csv_data)
            reader = csv.reader(xp_csv_data)
            for row in reader:
                if len(row) < 4: continue
                player, aventura, xp, compra = row[0].strip(), row[1].strip(), row[2].strip(), row[3].strip()
                if not player or not aventura.isdigit(): continue
                session_number = int(aventura)
                session_id = session_dict.get(session_number)
                try: xp_cost = int(xp)
                except ValueError: xp_cost = 0
                
                char_id = await _get_or_create_character(session, characters_cache, player)
                
                # Check duplicates by matching cost and desc
                existing_result = await session.execute(
                    select(XpExpenditure)
                    .where(XpExpenditure.session_id == session_id)
                    .where(XpExpenditure.character_id == char_id)
                    .where(XpExpenditure.description == compra)
                )
                existing = existing_result.scalars().first()
                if not existing:
                    xp_record = XpExpenditure(session_id=session_id, character_id=char_id, cost=xp_cost, description=compra)
                    session.add(xp_record)
                    xp_added += 1
            print(f"Synced {xp_added} new XP records.")

            # 4. Diableries
            diableries_added = 0
            next(diableries_csv_data)
            reader = csv.reader(diableries_csv_data)
            for row in reader:
                if len(row) < 12: continue
                player, victim, session_num_str, disc_gained, gen_gained_str = row[0].strip(), row[2].strip(), row[3].strip(), row[8].strip(), row[11].strip()
                if not player or not session_num_str.isdigit(): continue
                session_number = int(session_num_str)
                session_id = session_dict.get(session_number)
                try: gen_gained = int(gen_gained_str)
                except ValueError: gen_gained = 0
                
                char_id = await _get_or_create_character(session, characters_cache, player)
                
                existing_result = await session.execute(
                    select(DiablerieRecord)
                    .where(DiablerieRecord.session_id == session_id)
                    .where(DiablerieRecord.diablerist_id == char_id)
                    .where(DiablerieRecord.victim_name == victim)
                )
                existing = existing_result.scalars().first()
                if not existing:
                    diablerie_record = DiablerieRecord(
                        diablerist_id=char_id, victim_name=victim, session_id=session_id,
                        generation_gained=gen_gained, disciplines_gained=disc_gained
                    )
                    session.add(diablerie_record)
                    diableries_added += 1
            print(f"Synced {diableries_added} new Diablerie records.")

if __name__ == "__main__":
    asyncio.run(sync_all_from_google_sheets())
