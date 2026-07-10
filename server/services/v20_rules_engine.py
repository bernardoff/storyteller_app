import random
from typing import List, Dict, TypedDict

class RollResult(TypedDict):
    rolls: List[int]
    successes: int
    is_botch: bool
    is_failure: bool

def roll_dice(pool: int, difficulty: int, specialty: bool = False) -> RollResult:
    rolls = [random.randint(1, 10) for _ in range(pool)]
    natural_successes = sum(1 for die in rolls if die >= difficulty)
    ones_count = rolls.count(1)
    successes = max(0, natural_successes - ones_count)
    
    if specialty:
        successes += rolls.count(10)
    
    is_botch = (natural_successes == 0 and ones_count > 0)
    is_failure = successes == 0
    
    return RollResult(
        rolls=rolls,
        successes=successes,
        is_botch=is_botch,
        is_failure=is_failure
    )

def calculate_initiative(dexterity: int, wits: int, celerity: int, wound_penalty: int) -> int:
    return dexterity + wits + celerity + random.randint(1, 10) - wound_penalty

class ActionPenalty(TypedDict):
    dice_penalty: int
    diff_penalty: int

def calculate_multiple_actions(action_count: int, celerity_active_blood: int) -> List[ActionPenalty]:
    penalties = []
    for i in range(1, action_count + 1):
        dice_penalty = -i
        diff_penalty = i - min(i, celerity_active_blood)
        penalties.append(ActionPenalty(dice_penalty=dice_penalty, diff_penalty=diff_penalty))
    return penalties

def calculate_damage(weapon_damage: int, net_attack_successes: int) -> int:
    return weapon_damage + net_attack_successes

class SoakResult(TypedDict):
    soak_pool: int

def calculate_soak(stamina: int, fortitude: int, armor: int, damage_type: str, is_vampire: bool) -> SoakResult:
    if damage_type == "Bashing":
        soak_pool = stamina + fortitude + armor
    elif damage_type == "Lethal":
        soak_pool = stamina + fortitude + armor if is_vampire else fortitude + armor
    elif damage_type == "Aggravated":
        soak_pool = fortitude
    else:
        raise ValueError("Invalid damage type")
    
    return SoakResult(soak_pool=soak_pool)