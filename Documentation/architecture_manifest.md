# Architecture Manifest

## Dynamic Rules & Automation Engine

### INCREMENTAL SPECIFICATION: Vampire: The Dark Ages Integration Framework (WoD-VTT)

#### 1. Integration Scope & Alignment

* **Thematic Core:** Construct a high-immersion, rule-aware storytelling workspace that seamlessly bridges tactical spatial environments with the narrative-centric, gothic-horror mechanics of *Vampire: The Dark Ages* (including Classic and 20th Anniversary Editions).
* **Dependencies:**
  * `src/canvas/vision-engine`: Coordinates WebGL line-of-sight and fog-of-war layers.
  * `src/state/global-state-manager`: Manages actor databases, player sessions, and canvas objects.
  * `src/dice/storyteller-roller`: Handles custom d10 pooling, keeping high/low results, and explosion operators.

#### 2. Updated State Management & Schema Extensions

**Schema Deltas (New State)**
To support the physical attributes, moral roads, blood pools, and complex damage tracks of *Vampire: The Dark Ages*, the base character database schema (`/src/db/actor-schema.json`) must be extended:

```json
{
  "wodActorExtensions": {
    "moralFramework": {
      "roadName": "Road of Kings",
      "roadRating": 5,
      "virtues": {
        "conscienceOrConviction": 3,
        "selfControlOrInstinct": 3,
        "courage": 4
      }
    },
    "resourcePools": {
      "bloodPool": {
        "current": 10,
        "max": 10,
        "perTurnLimit": 1
      },
      "willpower": {
        "current": 5,
        "max": 5,
        "superficial": 0,
        "aggravated": 0
      }
    },
    "healthTrack": {
      "boxes": [
        {"id": "bruised", "label": "Bruised", "penalty": 0, "damageType": "none"},
        {"id": "hurt", "label": "Hurt", "penalty": -1, "damageType": "none"},
        {"id": "injured", "label": "Injured", "penalty": -1, "damageType": "none"},
        {"id": "wounded", "label": "Wounded", "penalty": -2, "damageType": "none"},
        {"id": "mauled", "label": "Mauled", "penalty": -2, "damageType": "none"},
        {"id": "crippled", "label": "Crippled", "penalty": -5, "damageType": "none"},
        {"id": "incapacitated", "label": "Incapacitated", "penalty": -99, "damageType": "none"}
      ],
      "isTorpid": false,
      "isDead": false
    }
  }
}
```

To support token visual hallucinations and private psychological projections (*Auspex*, *Chimerstry*, *Obtenebration*), append local viewport visibility settings:

```json
{
  "canvasTokenExtensions": {
    "spectreSettings": {
      "isSpectre": false,
      "visibleToPlayerUUIDs": []
    }
  }
}
```

**Data Flow & Side Effects**
1. **Reactive Injury Updates:** Writes to `wodActorExtensions.healthTrack.boxes` trigger recalculation of the global modifier state. If Incapacitated is filled, `isTorpid` or `isDead` state is set and a socket event freezes the token.
2. **Dice Pool Reductions:** Active penalty ($P_{\text{wound}}$) reduces dice pools: $S_{\text{final}}=\max(1, S_{\text{base}} - P_{\text{wound}})$.
3. **Active Spell or Discipline Side Effects:** Activations (e.g. Celerity) issue side-effect transactions to `/src/state/` for initiative tracking.
4. **Local Asset Pruning:** `isSpectre: true` evaluates `visibleToPlayerUUIDs`. If the local client's UUID is not present, the asset is excluded from rendering.

#### 3. Modular Feature Breakdown

**Module: Tri-Tier Damage Track & Resource Engine**
Automate multi-tier damage sorting, wound progression, and reflexive blood healing.

**Module: Multi-Layer Mapping and "Spectre" Sight Filters**
Enable vertical coordinate alignment across multi-level maps and selective visibility filters to represent illusions/projections.

**Module: Draggable Social Graph and Faction Map**
Track feudal domain status, covenants, coteries, and ancient bloodlines via interactive vector relationship diagram.

#### 4. Verification & Acceptance Criteria
Includes scenarios for:
- Dynamic Damage Sorting and Dice Pool Reduction (verifying healthTrack array sorting and pool modifier)
- Spectre Private Client Visibility Layer (verifying token opacity and bypassed rendering for specific player UUIDs)
