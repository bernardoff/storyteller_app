# Feature Backlog

This document tracks future features and nice-to-have ideas for the Storyteller App that are currently deferred.

## Authentication
- ~~**Google OAuth Login:** Add 'Login with Google' functionality to the frontend alongside the standard username/password, and update the FastAPI auth routes to handle OAuth tokens.~~ (Completed)
- **Test Google OAuth:** Future tests need to be done with other players to confirm they can successfully login and access the platform.

## AI Automations (Deferred)
- **Advanced Action Engine:** Local LLM ingestion of full character sheets for exact dice pool suggestions.
- **Combat LLM Engine Decision:** Decide whether to stick with Local Llama (requires building a local RAG vector DB to process the 1.9MB core rulebook) or Gemini 1.5 Flash (massive context handles the entire rulebook in-prompt, but uses API quota). Currently there is an `engine="gemini"|"llama"` toggle in `combat_routes.py` for testing.
- **Session Log Generator (Audio Transcription):** Upload 3-6 hour .m4a session recordings. Process locally using Whisper (GPU) with speaker diarization as a background job. Generate both a detailed action log and a player-friendly narrative summary using a local LLM.
- **Storyteller Chapter Planner:** Gemini brainstorming tool for upcoming plot hooks based on campaign lore.
- **Integrated Image Generation:** Generate and broadcast VTT tokens, backgrounds, and character portraits via AI.

## Campaign Expansion
- **Cyberpunk 2000+ Expansion**: Framework and rule adaptations for when the timeline progresses from 1606 into the modern/future eras.

## Advanced Visualizations
- **Relationship, Boon & Timeline Viewer (CRM)**: A visual, interactive graph mapping out the complex relationships between characters, NPCs, boons, and events. Replicate and enhance the existing Kumu database experience to function as a Kindred CRM.
- **Dynamic Lighting VTT**: Upgrading the VTT from a simple grid to support line-of-sight and dynamic lighting.
- **Domain & Feeding Ground Map**: An interactive map module to track territories and hunting difficulty. This will expand on the existing Google Spreadsheet to provide a more comprehensive, visual tool for tracking domains.

## Localization
- **Bilingual Support**: Implement a feature to make this whole app bilingual (English US / Portuguese BR).

## Equipment & Inventory
- **Equipment Library & Tracking**: Create a searchable library of all possible equipment (weapons, armor, items). Allow players to equip these items on their character sheets, automatically updating their stats (e.g., weapon dice pools for attacking, or armor rating for soaking damage).

## Storyteller Tools & Mechanics
- **LLM-Driven Combat Tracker & Intelligent Dice Roller**: Merge an advanced combat wizard (handling V20 multiple actions, initiative, Celerity/Fortitude) with an intelligent dice roller. The DM sets the difficulty, and the system accounts for botches, Willpower usage, and specializations, using an LLM to assist with rules retrieval and action resolution.
- **"Nightfall" Resource Dashboard**: A complex tool to automatically track, control, and update resources over time (e.g., deducting blood points for waking up, tracking ghoul upkeep, etc.).
- **Masquerade Threat Level & Degeneration Tracker**: A system to track the city-wide Masquerade Threat Level and character Humanity degeneration, prompting Conscience/Conviction rolls when players violate their Hierarchy of Sins.

## Technical Debt & Bug Fixes
- **Fix Placeholder Characters/Users**: The attendance ingestion script currently creates placeholder 'Unknown Player' users for characters that don't have a markdown sheet. Update this in the future to map these characters to their actual players once their sheets or player mappings are imported.

## UI/UX Improvements
- **Floating Interaction Buttons**: Maintain the floating action button pattern (like the bottom-right rule search button) as a core UI principle. Expand this to provide similar quick-access interaction buttons across different modules where appropriate for all players.
- **Dedicated Combat Wizard Modal (Alternative)**: As a future alternative to the current inline Chat/Dice integration, consider building a dedicated, standalone modal for the Action Resolution Wizard that pops up during combat.

## Immersive Multimedia & Campaign Management Suite
- **WebRTC Mesh connection layer**: Implement local WebRTC Mesh within webrtc-broker to handle peer channels for low-latency peer-to-peer AV communication.
- **Web Audio DSP Engine**: Build Web Audio processing pipe featuring pitch-shifting, custom resonance filters, and preset templates (e.g., Vampire preset).
- **WebGL Overlays**: Create a WebGL overlay processing class mapping face tracking landmarks to real-time image masking filters (stylistic shadows, skin tone altering).
- **AmbientMixer Component**: Develop a component handling seamless asset looping, crossover fades, and multi-track audio nodes for the soundscape.
- **Contextual Soundscape Observer**: Write a reactive observer pattern listening to the `orchestration-brain` output stream to dispatch matching spatial audio files (e.g., "hit", "miss").
- **Campaign Relational Schema Editor**: Construct a multi-tiered relational schema editor dividing input data into Chapter, NPC, Intrigue, and Location domains.
- **Session Prompt Synthesizer**: Build an interface reading the last session's recap and dynamically pulling linked entity nodes to build context for the next session.
- **Unified Workspace Dashboard**: Refactor the application layout into a grid container hosting the VTT interactive canvas, collapsable messaging sidebar, and individual player status rows.
- **Token Synchronization System**: Extract the character sheet's primary image file, crop it using a circular boundary matrix, and populate the canvas as a movable token with perimeter borders.

## Vampire: The Dark Ages Integration Framework (WoD-VTT)
- **Damage-Sorting Algorithm**: Implement `sortWounds(boxesArray)` to dynamically arrange a 7-element array based on severity (Aggravated `*` -> Lethal `X` -> Bashing `/`), pushing less severe wounds downward.
- **Reflexive Blood Mend API**: Build `/api/actor/spend-blood` endpoint to decrement `bloodPool`, identify the bottom-most Bashing/Lethal damage marker, and clear it.
- **Tri-Tier Damage Track UI**: Render vector health track checkboxes. Clicking cycles Empty -> Bashing -> Lethal -> Aggravated. Display the active pool penalty in a glowing badge that flashes when damage updates.
- **Multi-Level Map Render Layer**: Integrate `ChangeLevel` and `DefineSurface` coordinates to track token height elevation and render corresponding map tiers, using opacity masks for lower levels.
- **Spectre Private Client Asset Filter**: Build WebGL interceptor evaluating `spectreSettings.isSpectre` and current player's UUID. Draw asset at 0.7 opacity for permitted players; bypass rendering entirely for others.
- **Spectre Toggle UI**: GM sidebar menu to select map assets, check "Spectre", and toggle player names permitted to view them.
- **Vector Relationship Diagram**: Develop draggable, zoomable canvas component (e.g. d3-force) displaying faction/actor relationships with custom `relationStyling` patterns (dashed red, dotted green, solid blue).
- **Actor Drag-and-Drop Binding**: Add drag-and-drop listener over faction nodes to bind an actor sheet, appending the actor's UUID to the node's members list and updating the database.
