import asyncio
import sys
from server.services.ollama_manager import ollama_generate

prompt = """
Write a Python module `v20_rules_engine.py` that implements the hardcoded rules for Vampire V20 Dark Ages combat. 

Include the following:
1. `roll_dice(pool: int, difficulty: int, specialty: bool = False)`:
   - Rolls `pool` d10s (use `random.randint(1, 10)`).
   - count successes (dice >= difficulty).
   - count 1s (subtract from successes).
   - if specialty, 10s count as 2 successes.
   - Determine if it's a botch (0 natural successes before subtracting 1s, and at least one 1 rolled).
   - return a dict with `rolls`, `successes` (min 0 if not botch), `is_botch`, `is_failure`.

2. `calculate_initiative(dexterity: int, wits: int, celerity: int, wound_penalty: int) -> int`
   - Returns Dexterity + Wits + Celerity + random.randint(1, 10) - wound_penalty. 

3. `calculate_multiple_actions(action_count: int, celerity_active_blood: int)`:
   - For `action_count` actions, calculates the dice penalty and difficulty penalty for each action.
   - returns a list of dicts: `[{'dice_penalty': int, 'diff_penalty': int}, ...]`
   - 1st action: -1 die, +1 diff
   - 2nd action: -2 dice, +2 diff
   - Nth action: -N dice, +N diff
   - If Celerity is active (blood spent), reduce the difficulty penalty by `celerity_active_blood` (up to Celerity dots, so just subtract `celerity_active_blood` from the difficulty penalty, min 0). Dice penalty remains.

4. `calculate_damage(weapon_damage: int, net_attack_successes: int)`:
   - Returns weapon_damage + net_attack_successes.
   
5. `calculate_soak(stamina: int, fortitude: int, armor: int, damage_type: str, is_vampire: bool)`
   - Bashing: full soak pool (Stamina + Fort + Armor). Roll soak. Vampire halves final damage after soak (this should be handled outside, just return the soak pool for now). Actually, return the dict `{'soak_pool': int}`.
   - Bashing pool: Stamina + Fort + Armor
   - Lethal pool: Vampire uses Stamina + Fort + Armor. Mortal uses only Armor + Fort.
   - Aggravated pool: Vampire uses Fortitude only.

Make the code clean, well-typed, and use python `dataclasses` or `TypedDict` for return types where appropriate. Output ONLY the python code. Do not include markdown blocks if possible, just the raw code.
"""

async def main():
    print("Generating code with Qwen...")
    response = await ollama_generate("qwen2.5-coder:14b", prompt)
    
    # Strip markdown blocks if present
    code = response.strip()
    if code.startswith("```python"):
        code = code[9:]
    if code.endswith("```"):
        code = code[:-3]
        
    with open("server/services/v20_rules_engine.py", "w") as f:
        f.write(code.strip())
    print("Code written to server/services/v20_rules_engine.py")

if __name__ == "__main__":
    asyncio.run(main())
