import os
path = r"c:\Users\Pc\Google Drive\Storyteller_app\knowledge_base"
for f in os.listdir(path):
    ascii_name = f.encode('ascii', 'ignore').decode('ascii')
    if ascii_name != f:
        os.rename(os.path.join(path, f), os.path.join(path, ascii_name))
        print(f"Renamed {f} to {ascii_name}")
