import sqlite3

def check():
    conn = sqlite3.connect('data/storyteller.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM session_logs WHERE detailed_log IS NULL")
    rows = cursor.fetchall()
    print("Sessions with NULL detailed_log:", len(rows))
    conn.close()

if __name__ == "__main__":
    check()
