"""
V20 Dice Engine
Simulates the Vampire: The Masquerade 20th Anniversary Edition dice mechanics.
"""

import random
from typing import List, TypedDict

class V20RollResult(TypedDict):
    rolls: List[int]
    successes: int
    ones: int
    is_botch: bool
    result: str


def roll_v20(pool_size: int, difficulty: int = 6, specialty: bool = False) -> V20RollResult:
    """Roll a V20 dice pool.

    Args:
        pool_size: Number of d10s to roll.
        difficulty: Target number for a success (default 6).
        specialty: If True, 10s explode (each 10 adds one extra die to roll).

    Returns:
        A dict with keys:
            - rolls: list[int] — every individual die result (including exploded dice).
            - successes: int — net successes (>= 0 on a normal failure).
            - ones: int — count of 1s rolled.
            - is_botch: bool — True when zero successes were scored and at least one 1 appeared.
            - result: str — human-readable label ("Botch", "Failure", or "N Success(es)").
    """
    if pool_size <= 0:
        return V20RollResult(
            rolls=[],
            successes=0,
            ones=0,
            is_botch=False,
            result="No dice to roll",
        )

    # --- Roll the pool, handling exploding 10s ---
    all_rolls: List[int] = []
    dice_remaining = pool_size

    while dice_remaining > 0:
        batch = [random.randint(1, 10) for _ in range(dice_remaining)]
        all_rolls.extend(batch)
        if specialty:
            dice_remaining = sum(1 for d in batch if d == 10)
        else:
            dice_remaining = 0

    # --- Count raw hits and 1s ---
    raw_successes = sum(1 for d in all_rolls if d >= difficulty)
    ones = sum(1 for d in all_rolls if d == 1)

    # --- Resolve net successes and botch ---
    if raw_successes == 0 and ones > 0:
        return V20RollResult(
            rolls=all_rolls,
            successes=0,
            ones=ones,
            is_botch=True,
            result="Botch!",
        )

    net = max(raw_successes - ones, 0)
    if net == 0:
        label = "Failure"
    elif net == 1:
        label = "1 Success"
    else:
        label = f"{net} Successes"

    return V20RollResult(
        rolls=all_rolls,
        successes=net,
        ones=ones,
        is_botch=False,
        result=label,
    )
