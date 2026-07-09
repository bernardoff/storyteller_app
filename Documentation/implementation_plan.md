# Storyteller App — Implementation Plan (Data Ingestion Phase)

## Context & Shift in Priorities
Based on user feedback, all advanced AI integrations (image generation, summarization, action suggestion, rule answers, combat resolution assistant) have been moved to the backlog. 

The immediate priority is the **Data Ingestion Phase**. The goal is to migrate the vast amount of existing lore, character sheets, and session logs from unstructured Markdown files in the `/knowledge_base/` into the structured FastAPI database so they are natively available in the app's UI.

## Proposed Changes

### 1. Character Sheet Ingestion
- **Target Files:** Files in `/knowledge_base/` following the naming convention `*Character Name* (*Player Name*).md` (e.g., `Salazar (Mario).md`, `Constantin (Daniel).md`).
- **Implementation:** Create a standalone Python script (`server/scripts/ingest_characters.py`) that:
  1. Reads these specific markdown files.
  2. Parses the unstructured text to extract key stats (Generation, Clan, Attributes, Abilities, Disciplines, Backgrounds, Merits & Flaws).
  3. Maps these values to the SQLAlchemy `Character` model (`server/database.py`).
  4. Inserts them into the SQLite database.

### 2. Session Logs Ingestion (Upcoming)
- **Target File:** `/knowledge_base/V_DA Char summary and stats.md` (which contains 90+ session logs).
- **Implementation:** Following the characters, we will create another ingestion script (`server/scripts/ingest_sessions.py`) to parse the 100kb+ session log document. It will break down the text by session number/title and insert them into the `SessionLog` database table.

### 3. Lore & Artifacts Migration (Upcoming)
- **Target Files:** Other lore documents in the knowledge base (e.g., specific NPC dossiers, location histories).
- **Implementation:** Parse and migrate these into a searchable structure within the app's database.
