# Storyteller App — Comprehensive Task Tracker

- [x] **Phase 1: Character Data Ingestion**
  - [x] Write `server/scripts/ingest_characters.py` to parse files matching `*(*).md` in `/knowledge_base`.
  - [x] Map unstructured Markdown data to the SQLAlchemy `Character` model.
  - [x] Run the script and verify characters appear in the local SQLite database.
  - [x] Verify the ingested characters load correctly in the frontend Character Panel.

- [x] **Phase 2: Session Log Ingestion**
  - [x] Write `server/scripts/ingest_sessions.py` to parse `sessions.csv`.
  - [x] Map unstructured text chunks to the `SessionLog` model.
  - [x] Verify the 89 sessions populate the database.

- [ ] **Phase 3: Lore & Other Data Ingestion**
  - [ ] Identify remaining crucial lore files in `/knowledge_base/`.
  - [ ] Map them to appropriate structures and ingest them.
