import sqlite3

def patch():
    conn = sqlite3.connect('data/storyteller.db')
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE session_logs ADD COLUMN audio_status VARCHAR(20) DEFAULT 'none';")
        print("Added audio_status")
    except Exception as e:
        print(e)
        
    try:
        cursor.execute("ALTER TABLE session_logs ADD COLUMN raw_transcript TEXT;")
        print("Added raw_transcript")
    except Exception as e:
        print(e)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    patch()
