import sqlite3

def check():
    conn = sqlite3.connect('data/storyteller.db')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM campaigns")
    print("Campaigns:", cursor.fetchall())
    
    cursor.execute("SELECT * FROM session_logs")
    print("Session Logs:", cursor.fetchall())
    conn.close()

if __name__ == "__main__":
    check()
