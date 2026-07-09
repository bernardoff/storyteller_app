# Feature Backlog

This document tracks future features and nice-to-have ideas for the Storyteller App that are currently deferred.

## Authentication
- ~~**Google OAuth Login:** Add 'Login with Google' functionality to the frontend alongside the standard username/password, and update the FastAPI auth routes to handle OAuth tokens.~~ (Completed)
- **Test Google OAuth:** Future tests need to be done with other players to confirm they can successfully login and access the platform.

## AI Automations (Deferred)
- **Advanced Action Engine:** Local LLM ingestion of full character sheets for exact dice pool suggestions.
- **Session Log Generator:** Gemini 3.1 Pro integration to rewrite chat/game logs into book-like narrative chapters.
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
