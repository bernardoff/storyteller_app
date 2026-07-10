import random
from typing import TypedDict, List

class V20RollResult(TypedDict):
    rolls: List[int]
    successes: int
    is_botch: bool
    result_label: str

def roll_v20(pool_size: int, difficulty: int = 6, specialty: bool = False, willpower: bool = False) -> V20RollResult:
    if pool_size < 1:
        return {"rolls": [], "successes": 0, "is_botch": False, "result_label": "Failure (No dice)"}

    rolls = []
    successes = 0
    ones = 0

    dice_to_roll = pool_size
    while dice_to_roll > 0:
        current_roll = [random.randint(1, 10) for _ in range(dice_to_roll)]
        rolls.extend(current_roll)
        
        new_dice = 0
        for die in current_roll:
            if die >= difficulty:
                successes += 1
            if die == 1:
                ones += 1
            if specialty and die == 10:
                new_dice += 1
                
        dice_to_roll = new_dice

    net_successes = successes - ones
    is_botch = net_successes < 0 and successes == 0
    
    if willpower:
        net_successes += 1
        is_botch = False

    if is_botch:
        result_label = "Botch"
    elif net_successes <= 0:
        result_label = "Failure"
    elif net_successes == 1:
        result_label = "Marginal Success"
    elif net_successes == 2:
        result_label = "Moderate Success"
    elif net_successes == 3:
        result_label = "Complete Success"
    elif net_successes == 4:
        result_label = "Exceptional Success"
    else:
        result_label = "Phenomenal Success"

    return {
        "rolls": rolls,
        "successes": net_successes,
        "is_botch": is_botch,
        "result_label": result_label
    }

def roll_initiative(dexterity: int, wits: int) -> dict:
    roll = random.randint(1, 10)
    modifier = dexterity + wits
    total = roll + modifier
    return {'roll': roll, 'modifier': modifier, 'total': total}

def contested_roll(pool1: int, pool2: int, difficulty: int = 6) -> dict:
    roller1_result = roll_v20(pool1, difficulty)
    roller2_result = roll_v20(pool2, difficulty)
    
    if roller1_result['successes'] > roller2_result['successes']:
        winner = 'roller1'
    elif roller1_result['successes'] < roller2_result['successes']:
        winner = 'roller2'
    else:
        winner = 'tie'
    
    return {'roller1': roller1_result, 'roller2': roller2_result, 'winner': winner}

def extended_roll(pool_size: int, difficulty: int, target_successes: int, max_rolls: int = 10) -> dict:
    attempts = []
    total_successes = 0
    rolls_used = 0
    
    while total_successes < target_successes and rolls_used < max_rolls:
        roll_result = roll_v20(pool_size, difficulty)
        attempts.append(roll_result)
        total_successes += roll_result['successes']
        rolls_used += 1
    
    success = total_successes >= target_successes
    return {'attempts': attempts, 'total_successes': total_successes, 'success': success, 'rolls_used': rolls_used}

def willpower_roll(willpower: int, difficulty: int = 6) -> V20RollResult:
    return roll_v20(willpower, difficulty)
