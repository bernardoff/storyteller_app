import asyncio
import os
import re
from pathlib import Path

import aiofiles
from sqlalchemy.future import select

from server.database import _get_session_factory, User, Character, init_db
from server.config import get_settings

async def ingest_characters():
    await init_db()
    SessionLocal = _get_session_factory()

    markdown_dir = Path("knowledge_base/")
    pattern = re.compile(r"^(.+) \((.+)\)\.md$")
    clan_pattern = re.compile(r"(?i)(Tzimisce|Lasombra|Brujah|Ventrue|Toreador|Nosferatu|Malkavian|Gangrel|Assamite|Setita|Cappadocian|Ravnos)")
    generation_pattern = re.compile(r"(?i)Generation:?\s*(\d+)")
    
    # Optional Attributes Regex for extraction
    attr_pattern = lambda name: re.compile(fr"(?i){name}:?\s*(\d+)")

    for md_file in markdown_dir.glob("*.md"):
        match = pattern.match(md_file.name)
        if not match:
            continue

        char_name, player_name = match.groups()

        async with SessionLocal() as session:
            async with session.begin():
                user_result = await session.execute(select(User).where(User.username == player_name))
                user = user_result.scalars().first()
                if not user:
                    user = User(username=player_name, display_name=player_name, password_hash="placeholder")
                    session.add(user)
                    await session.flush() # ensure user.id is generated

                async with aiofiles.open(md_file, mode='r', encoding='utf-8') as file:
                    content = await file.read()

                clan_match = clan_pattern.search(content)
                generation_match = generation_pattern.search(content)

                char_result = await session.execute(select(Character).where(Character.name == char_name))
                character = char_result.scalars().first()
                if not character:
                    character = Character(
                        name=char_name, 
                        user_id=user.id, 
                        notes=content
                    )
                    session.add(character)
                
                character.user_id = user.id
                character.clan = clan_match.group(0) if clan_match else None
                character.generation = int(generation_match.group(1)) if generation_match else None
                
                # Basic attribute parsing as fallback
                str_m = attr_pattern("Strength").search(content)
                if str_m: character.physical_strength = int(str_m.group(1))
                dex_m = attr_pattern("Dexterity").search(content)
                if dex_m: character.physical_dexterity = int(dex_m.group(1))
                sta_m = attr_pattern("Stamina").search(content)
                if sta_m: character.physical_stamina = int(sta_m.group(1))
                
                character.notes = content

                print(f"Processed character: {char_name} (Player: {player_name})")

if __name__ == "__main__":
    asyncio.run(ingest_characters())
