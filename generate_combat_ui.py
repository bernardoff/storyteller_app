import asyncio
from server.services.ollama_manager import ollama_generate

prompt = """
Write the HTML and JavaScript for the LLM-driven Combat Tracker UI. It should be a modern, dynamic Vue 3 or Vanilla JS frontend with a premium dark mode aesthetic (vibrant colors, glassmorphism, smooth animations), since the user requested "wow factor" aesthetics.

Requirements:
1. Three-panel layout:
   - Left: Initiative Roster (list of combatants with HP and Blood/Willpower trackers).
   - Center: Action Sandbox (Text area for players/ST to type actions, showing the LLM mechanical breakdown and a "Roll" button).
   - Right: Combat Log & Damage Confirmation (shows the results of rolls and asks for ST confirmation to apply damage).
2. Include a "Quick Add NPC" button that opens a modal to input NPC stats.
3. Include styling within `<style>` tags or as Vanilla CSS classes.
4. Output ONLY the HTML file content, combining the CSS and JS inside it.
5. Use Vanilla JS (no heavy frameworks unless via CDN, but Vanilla JS is preferred).

Make it visually stunning, resembling a dark, gothic, premium tabletop RPG tool.

Output ONLY the raw HTML code. Do not wrap in markdown tags like ```html .
"""

async def main():
    print("Generating combat.html with Qwen...")
    response = await ollama_generate("qwen2.5-coder:14b", prompt)
    
    code = response.strip()
    if code.startswith("```html"):
        code = code[7:]
    elif code.startswith("```"):
        code = code[3:]
    if code.endswith("```"):
        code = code[:-3]
        
    with open("client/pages/combat.html", "w") as f:
        f.write(code.strip())
    print("Code written to client/pages/combat.html")

if __name__ == "__main__":
    asyncio.run(main())
