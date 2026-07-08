"""
State Manager
Helpers for tracking combatants (initiative + V20 health levels) in
Streamlit session state.
"""

import streamlit as st

# Ordered health-level track used by V20
HEALTH_LEVELS = [
    "Bruised",
    "Hurt",
    "Injured",
    "Wounded",
    "Mauled",
    "Crippled",
    "Incapacitated",
]

# Dice-pool penalties associated with each level
WOUND_PENALTIES = {
    "Bruised": 0,
    "Hurt": -1,
    "Injured": -1,
    "Wounded": -2,
    "Mauled": -2,
    "Crippled": -5,
    "Incapacitated": None,  # character is out
}


def _ensure_combatants() -> None:
    """Guarantee that session_state has a combatants list and active_turn_index."""
    if "combatants" not in st.session_state:
        st.session_state.combatants = []
    if "active_turn_index" not in st.session_state:
        st.session_state.active_turn_index = 0


def get_combatants() -> list[dict]:
    """Return the current combatant list."""
    _ensure_combatants()
    return st.session_state.combatants


def add_combatant(name: str, initiative: int = 0, is_npc: bool = False) -> None:
    """Add a new combatant with full health and NPC status."""
    _ensure_combatants()
    combatant = {
        "name": name,
        "initiative": initiative,
        "health": {level: False for level in HEALTH_LEVELS},  # False = undamaged
        "is_npc": is_npc,
    }
    st.session_state.combatants.append(combatant)
    _sort_by_initiative()


def remove_combatant(index: int) -> None:
    """Remove a combatant by list index."""
    _ensure_combatants()
    if 0 <= index < len(st.session_state.combatants):
        st.session_state.combatants.pop(index)


def set_initiative(index: int, value: int) -> None:
    """Update a combatant's initiative and re-sort the tracker."""
    _ensure_combatants()
    if 0 <= index < len(st.session_state.combatants):
        st.session_state.combatants[index]["initiative"] = value
        _sort_by_initiative()


def set_health(index: int, level: str, damaged: bool) -> None:
    """Mark a specific health level as damaged or undamaged."""
    _ensure_combatants()
    if 0 <= index < len(st.session_state.combatants) and level in HEALTH_LEVELS:
        st.session_state.combatants[index]["health"][level] = damaged


def apply_damage(index: int, amount: int) -> None:
    """Apply *amount* levels of damage from the top of the health track."""
    _ensure_combatants()
    if not (0 <= index < len(st.session_state.combatants)):
        return
    health = st.session_state.combatants[index]["health"]
    applied = 0
    for level in HEALTH_LEVELS:
        if applied >= amount:
            break
        if not health[level]:
            health[level] = True
            applied += 1


def heal_all(index: int) -> None:
    """Restore a combatant to full health."""
    _ensure_combatants()
    if 0 <= index < len(st.session_state.combatants):
        for level in HEALTH_LEVELS:
            st.session_state.combatants[index]["health"][level] = False


def current_wound_penalty(index: int) -> int | None:
    """Return the current dice-pool penalty for a combatant, or None if
    incapacitated."""
    _ensure_combatants()
    if not (0 <= index < len(st.session_state.combatants)):
        return 0
    health = st.session_state.combatants[index]["health"]
    penalty = 0
    for level in HEALTH_LEVELS:
        if health[level]:
            p = WOUND_PENALTIES[level]
            if p is None:
                return None  # incapacitated
            penalty = p  # take the worst (last marked) penalty
    return penalty


def get_combatant_summary() -> str:
    """Return a plain-text summary of the combat tracker for injection
    into the AI prompt."""
    _ensure_combatants()
    if not st.session_state.combatants:
        return "No combatants are being tracked."

    lines = ["**Combat Tracker**"]
    active_index = st.session_state.active_turn_index
    for i, c in enumerate(st.session_state.combatants):
        damaged = [lv for lv in HEALTH_LEVELS if c["health"][lv]]
        status = ", ".join(damaged) if damaged else "Unhurt"
        label = f"{c['name']} (Init {c['initiative']})"
        if c["is_npc"]:
            label += " (NPC)"
        if i == active_index:
            label += " [ACTIVE]"
        lines.append(f"- {label}: {status}")
    return "\n".join(lines)


def _sort_by_initiative() -> None:
    """Sort combatants descending by initiative."""
    st.session_state.combatants.sort(
        key=lambda c: c["initiative"], reverse=True
    )


def next_turn() -> None:
    """Increment the active turn index and wrap around."""
    _ensure_combatants()
    if st.session_state.combatants:
        st.session_state.active_turn_index = (
            st.session_state.active_turn_index + 1
        ) % len(st.session_state.combatants)


def get_active_combatant() -> dict | None:
    """Return the combatant dict for the current turn (or None if no combatants)."""
    _ensure_combatants()
    if st.session_state.combatants:
        return st.session_state.combatants[st.session_state.active_turn_index]
    return None


def reset_combat() -> None:
    """Reset the active turn index to 0."""
    _ensure_combatants()
    st.session_state.active_turn_index = 0
