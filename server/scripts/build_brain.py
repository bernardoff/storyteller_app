import chromadb
import os
import json
from server.config import get_settings

def chunk_text(text, max_length=3000, overlap=500):
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + max_length, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start += max_length - overlap
    return chunks

def update_progress(status, progress, message):
    os.makedirs('./data', exist_ok=True)
    with open('./data/rebuild_progress.json', 'w') as f:
        json.dump({"status": status, "progress": progress, "message": message}, f)

def build_brain():
    settings = get_settings()
    client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
    
    try:
        client.delete_collection(name='storyteller_rules')
    except ValueError:
        pass
    storyteller_rules = client.create_collection(
        name='storyteller_rules', 
        embedding_function=chromadb.utils.embedding_functions.OllamaEmbeddingFunction(
            url=f"{settings.OLLAMA_BASE_URL}/api/embeddings", 
            model_name=settings.OLLAMA_EMBED_MODEL
        )
    )
    
    try:
        client.delete_collection(name='storyteller_lore')
    except ValueError:
        pass
    storyteller_lore = client.create_collection(
        name='storyteller_lore', 
        embedding_function=chromadb.utils.embedding_functions.OllamaEmbeddingFunction(
            url=f"{settings.OLLAMA_BASE_URL}/api/embeddings", 
            model_name=settings.OLLAMA_EMBED_MODEL
        )
    )
    
    rules_files = []
    lore_files = []
    
    files = os.listdir(settings.KNOWLEDGE_BASE_PATH)
    total_files = len(files)
    for idx, filename in enumerate(files):
        file_path = os.path.join(settings.KNOWLEDGE_BASE_PATH, filename)
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read()
        
        if 'Core' in filename or 'Rules' in filename:
            rules_files.append((filename, text))
        else:
            lore_files.append((filename, text))
        
        update_progress("running", int((idx + 1) / total_files * 10), f"Reading file {idx + 1}/{total_files}: {filename}")
    
    # Process and embed in batches
    for group_name, collection, group_files in zip(['rules', 'lore'], [storyteller_rules, storyteller_lore], [rules_files, lore_files]):
        documents = []
        metadatas = []
        ids = []
        
        for filename, text in group_files:
            chunks = chunk_text(text)
            for idx, chunk in enumerate(chunks):
                documents.append(chunk)
                metadatas.append({"source": filename})
                ids.append(f"{filename}_{idx}")
                
        total_chunks = len(documents)
        batch_size = 50
        
        for i in range(0, total_chunks, batch_size):
            batch_docs = documents[i:i+batch_size]
            batch_meta = metadatas[i:i+batch_size]
            batch_ids = ids[i:i+batch_size]
            
            # This triggers Ollama API for embeddings
            collection.add(documents=batch_docs, metadatas=batch_meta, ids=batch_ids)
            
            # progress from 10% to 100%
            progress_base = 10 if group_name == 'rules' else 55
            progress = progress_base + int((i / total_chunks) * 45)
            update_progress("running", progress, f"Embedding {group_name} chunks: {i}/{total_chunks}")
            print(f"Embedding {group_name} chunks: {i}/{total_chunks}")
            
    update_progress("completed", 100, "Cache rebuild complete.")
    print("Cache rebuild complete.")

if __name__ == "__main__":
    build_brain()
