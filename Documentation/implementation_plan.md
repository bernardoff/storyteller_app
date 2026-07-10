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

## INCREMENTAL SPECIFICATION: Immersive Multimedia & Campaign Management Suite

### 1. Integration Scope & Alignment
**Thematic Core:** Transforming the application from a static web layout into an immersive, context-aware tabletop environment. Combining real-time P2P communication assets (voice/video processing), automated audio feedback driven by the simulation brain, and a relational lore database that feeds direct context into our local agentic session planner.

**Dependencies:**
- `vtt-canvas-layer`: Core engine processing token locations, map rendering, and viewport states.
- `orchestration-brain`: The local LLM orchestration runner parsing logs and generating game states.
- `audio-dsp-worker`: Local Web Audio context worker managing audio output node graphs.
- `webrtc-broker`: Network interface handling mesh configurations for multi-user calls.

### 2. Updated State Management & Schema Extensions
**Schema Deltas (New State)**
```json
{
  "stateExtensions": {
    "mediaEngine": {
      "activeAmbientTrack": { "trackId": "string", "volume": "number", "isPlaying": "boolean" },
      "sfxTriggerBuffer": [],
      "userDspConfig": {
        "voicePresetId": "string",
        "videoShaderId": "string",
        "micMuted": "boolean",
        "camActive": "boolean"
      }
    },
    "campaignGraph": {
      "chapters": [{ "id": "string", "title": "string", "summary": "string", "order": "number" }],
      "npcs": [{ "id": "string", "name": "string", "allegiance": "string", "associatedNodes": [] }],
      "intrigueVectors": [{ "sourceId": "string", "targetId": "string", "relationType": "string", "tensionLevel": "number" }],
      "geolocations": [{ "id": "string", "name": "string", "coordinates": [ "number", "number" ], "parentZoneId": "string" }]
    },
    "sessionPlanner": {
      "lastSessionRecapId": "string",
      "activePrepNotes": "string",
      "generatedEncounters": []
    }
  }
}
```

**Data Flow & Side Effects**
- Voice & Video Pipelines: Local camera captures are drawn onto an offscreen canvas running WebGL fragment shaders for real-time procedural cosmetic adjustments. Audio inputs route through an inline Web Audio API node chain before linking to the outbound WebRTC track.
- Audio Engine Automation: Monitors combat logs. When an action executes, the engine pushes an audio node trigger directly to `mediaEngine.sfxTriggerBuffer`.
- Lore Persistence: Modifications to the campaign lore graph automatically trigger local markdown file compilation.

### 3. Modular Feature Breakdown

**Module: Real-Time Audio/Video DSP Engine**
- Implement a local WebRTC Mesh connection layer within `webrtc-broker` to handle peer channels.
- Build a Web Audio processing pipe featuring pitch-shifting, custom resonance filters, and preset templates.
- Create a WebGL overlay processing class that maps face tracking landmarks to real-time image masking filters.

**Module: Soundscape & Automation System**
- Develop an AmbientMixer component handling seamless asset looping, crossover fades, and multi-track audio nodes.
- Write a reactive observer pattern that listens to the `orchestration-brain` output stream and dispatches matching spatial audio files.

**Module: Deep Lore Graph & Session Planner**
- Construct a multi-tiered relational schema editor dividing input data into Chapter, NPC, Intrigue, and Location domains.
- Build a prompt synthesis interface that reads the last session's recap and dynamically pulls linked entity nodes to build context.

**Module: Unified Workspace Layout Integration**
- Refactor the layout into a grid container hosting the VTT interactive canvas, messaging sidebar, and player status rows.
- Build a token synchronization system extracting the character sheet's primary image file, cropped as a token.
