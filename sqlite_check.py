import sqlite3

def check():
    conn = sqlite3.connect('data/storyteller.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, session_number, title FROM session_logs")
    rows = cursor.fetchall()
    print("Session Logs in DB:")
    for row in rows:
        print(row)
    conn.close()

if __name__ == "__main__":
    check()
