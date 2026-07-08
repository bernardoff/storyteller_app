import os
import streamlit as st
from chromadb import PersistentClient
import chromadb.utils.embedding_functions as ef

# Create a shared embedding function instance requesting GPU first, falling back to CPU
embedding_func = ef.ONNXMiniLM_L6_V2(preferred_providers=["CUDAExecutionProvider", "CPUExecutionProvider"])

@st.cache_resource
def get_chroma_client():
    return PersistentClient('./chroma_db')

def initialize_knowledge_base(knowledge_dir):
    # Load all .md files in knowledge_dir, chunk by double newline ('\n\n')
    paragraphs = []
    if not os.path.exists(knowledge_dir):
        return
    for filename in os.listdir(knowledge_dir):
        if filename.endswith('.md'):
            with open(os.path.join(knowledge_dir, filename), 'r', encoding='utf-8') as file:
                content = file.read()
                chunks = content.split('\n\n')
                paragraphs.extend([c.strip() for c in chunks if c.strip()])

    # Get the Chroma client and collection 'v20_rules'
    chroma_client = get_chroma_client()
    collection_name = 'v20_rules'
    
    # Check if we need to embed
    try:
        collection = chroma_client.get_collection(name=collection_name, embedding_function=embedding_func)
        if collection.count() > 0:
            return
    except:
        collection = chroma_client.create_collection(name=collection_name, embedding_function=embedding_func)

    if not paragraphs:
        return

    # Add to ChromaDB in batches of 5000 (sqlite limits)
    # Chroma's DefaultEmbeddingFunction automatically embeds the documents locally!
    batch_size = 5000
    for i in range(0, len(paragraphs), batch_size):
        batch = paragraphs[i:i+batch_size]
        ids = [f"id_{j}" for j in range(i, i+len(batch))]
        collection.add(ids=ids, documents=batch)

def search_rules(query, n_results=3):
    chroma_client = get_chroma_client()
    try:
        collection = chroma_client.get_collection(name='v20_rules', embedding_function=embedding_func)
    except:
        return ""
        
    if collection.count() == 0:
        return ""
        
    # Chroma automatically embeds the query
    results = collection.query(query_texts=[query], n_results=n_results)

    # Return a single string joining the returned paragraphs
    if results['documents'] and results['documents'][0]:
        return '\n\n'.join(results['documents'][0])
    return ""
