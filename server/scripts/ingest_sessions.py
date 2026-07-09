import csv
from datetime import datetime
import asyncio
from sqlalchemy.future import select
from server.database import _get_session_factory, Campaign, SessionLog, init_db

async def ingest_sessions():
    await init_db()
    SessionLocal = _get_session_factory()
    
    async with SessionLocal() as session:
        async with session.begin():
            # Check if the Campaign exists and create it if not
            campaign_result = await session.execute(select(Campaign).where(Campaign.name == "Vampire Dark Ages"))
            campaign = campaign_result.scalars().first()
            if not campaign:
                campaign = Campaign(name="Vampire Dark Ages")
                session.add(campaign)
                await session.flush()
            campaign_id = campaign.id

    inserted_count = 0

    # Open and parse the CSV file
    with open('knowledge_base/sessions.csv', newline='', encoding='utf-8') as csvfile:
        # Skip the first 3 lines
        for _ in range(3):
            next(csvfile)
            
        reader = csv.DictReader(csvfile)
        for row in reader:
            if not row['session'].isdigit():
                continue

            session_number = int(row['session'])
            played_at = None
            if row.get('date'):
                try:
                    played_at = datetime.strptime(row['date'], '%d/%m/%Y')
                except ValueError:
                    pass
                    
            location = row.get('Localidade', '')
            summary = row.get('Log', '')
            title = f"Season {row.get('season', '')} Episode {row.get('episode', '')}".strip()

            async with SessionLocal() as session:
                async with session.begin():
                    # check if session log exists to prevent duplicates
                    existing_result = await session.execute(
                        select(SessionLog)
                        .where(SessionLog.campaign_id == campaign_id)
                        .where(SessionLog.session_number == session_number)
                    )
                    existing = existing_result.scalars().first()
                    
                    if not existing:
                        session_log = SessionLog(
                            session_number=session_number,
                            played_at=played_at,
                            location=location,
                            summary=summary,
                            title=title,
                            campaign_id=campaign_id
                        )
                        session.add(session_log)
                        inserted_count += 1
                    else:
                        existing.played_at = played_at
                        existing.location = location
                        existing.summary = summary
                        existing.title = title

    print(f"Inserted or updated {inserted_count} sessions.")

if __name__ == "__main__":
    asyncio.run(ingest_sessions())
