import os
import streamlit as st
from chromadb import PersistentClient
import chromadb.utils.embedding_functions as ef
from concurrent.futures import ThreadPoolExecutor

# Use Ollama for embeddings which natively targets the GPU!
embedding_func = ef.OllamaEmbeddingFunction(
    url="http://localhost:11434/api/embeddings",
    model_name="all-minilm:l6-v2",
)

@st.cache_resource
def get_chroma_client():
    return PersistentClient('./chroma_db')

def initialize_knowledge_base(knowledge_dir):
    paragraphs = []
    if not os.path.exists(knowledge_dir):
        return
    for filename in os.listdir(knowledge_dir):
        if filename.endswith('.md'):
            with open(os.path.join(knowledge_dir, filename), 'r', encoding='utf-8') as file:
                content = file.read()
                chunks = content.split('\n\n')
                paragraphs.extend([c.strip() for c in chunks if c.strip()])

    chroma_client = get_chroma_client()
    collection_name = 'v20_rules'
    
    try:
        collection = chroma_client.get_collection(name=collection_name, embedding_function=embedding_func)
    except:
        collection = chroma_client.create_collection(name=collection_name, embedding_function=embedding_func)

    if not paragraphs:
        return
        
    current_count = collection.count()
    if current_count >= len(paragraphs):
        return

    # Process in mega-blocks of 10,000 to save progress progressively
    mega_batch_size = 10000
    batch_size = 100
    
    # Start from where we left off
    for mega_i in range(current_count, len(paragraphs), mega_batch_size):
        mega_batch = paragraphs[mega_i:mega_i+mega_batch_size]
        
        batches = []
        ids_list = []
        
        for i in range(0, len(mega_batch), batch_size):
            batch = mega_batch[i:i+batch_size]
            batches.append(batch)
            global_offset = mega_i + i
            ids_list.append([f"id_{j}" for j in range(global_offset, global_offset+len(batch))])

        embeddings_list = [None] * len(batches)
        
        def process_batch(idx):
            import time
            max_retries = 5
            for attempt in range(max_retries):
                try:
                    embeddings_list[idx] = embedding_func(input=batches[idx])
                    break
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise e
                    time.sleep(2)
            
        # Melt the GPU with 8 workers!
        with ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(process_batch, range(len(batches))))

        # Write sequentially to ChromaDB
        for i in range(len(batches)):
            collection.add(ids=ids_list[i], documents=batches[i], embeddings=embeddings_list[i])
            
        print(f"Indexed {collection.count()} / {len(paragraphs)} chunks...")

def search_rules(query, n_results=3):
    chroma_client = get_chroma_client()
    try:
        collection = chroma_client.get_collection(name='v20_rules', embedding_function=embedding_func)
    except:
        return ""
        
    if collection.count() == 0:
        return ""
        
    results = collection.query(query_texts=[query], n_results=n_results)

    if results['documents'] and results['documents'][0]:
        return '\n\n'.join(results['documents'][0])
    return ""
