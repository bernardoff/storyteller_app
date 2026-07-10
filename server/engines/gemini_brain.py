import logging
import chromadb
from google import genai
from server.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class GeminiBrain:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY) if settings.GEMINI_API_KEY else None
        self.chroma_client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
        self.embedding_function = chromadb.utils.embedding_functions.OllamaEmbeddingFunction(
            url=f"{settings.OLLAMA_BASE_URL}/api/embeddings", 
            model_name=settings.OLLAMA_EMBED_MODEL
        )

    def get_context_from_chroma(self, query: str, domain: str, n_results=30) -> str:
        collection_name = f"storyteller_{domain}"
        try:
            collection = self.chroma_client.get_collection(
                name=collection_name,
                embedding_function=self.embedding_function
            )
            results = collection.query(
                query_texts=[query],
                n_results=n_results
            )
            
            if not results or not results['documents'] or not results['documents'][0]:
                return ""
                
            context_strings = results['documents'][0]
            return "\n\n---\n\n".join(context_strings)
        except Exception as e:
            logger.error(f"Error fetching from ChromaDB: {e}")
            return ""

    def ask(self, query: str, domain: str = "rules") -> str:
        if not self.client: return "Gemini API key not configured."
        
        context_string = self.get_context_from_chroma(query, domain)
        contents = f"Context:\n{context_string}\n\nQuestion:\n{query}" if context_string else query
        
        config = genai.types.GenerateContentConfig(
            temperature=0.3,
            system_instruction="You are a Vampire: The Dark Ages rules expert and Storyteller assistant. Answer based on the provided source material."
        )

        try:
            response = self.client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=contents,
                config=config
            )
            return response.text
        except Exception as e:
            logger.error(f"Error querying Gemini: {e}")
            return f"Error: {str(e)}"

    def chat(self, history: list, domain: str = "rules") -> str:
        if not self.client: return "Gemini API key not configured."
        
        # Get the last user message to query chroma
        latest_query = ""
        for entry in reversed(history):
            if entry.get('role') == 'user' and entry.get('parts'):
                latest_query = entry['parts'][0]
                break
                
        context_string = self.get_context_from_chroma(latest_query, domain) if latest_query else ""
        
        contents = []
        for entry in history:
            role = entry.get('role')
            parts = entry.get('parts', [])
            
            if role and parts:
                content_type = 'model' if role == 'model' else 'user'
                part_texts = parts.copy()
                
                # Inject context into the very last user message
                if content_type == 'user' and entry == history[-1] and context_string:
                    part_texts[0] = f"Context:\n{context_string}\n\nQuestion:\n{part_texts[0]}"
                    
                contents.append(genai.types.Content(
                    role=content_type, 
                    parts=[genai.types.Part.from_text(text=part) for part in part_texts]
                ))
        
        config = genai.types.GenerateContentConfig(
            temperature=0.7,
            system_instruction="You are the Storyteller Vampire, an advanced AI Game Master and lore expert for Vampire: The Dark Ages."
        )

        try:
            response = self.client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=contents,
                config=config
            )
            return response.text
        except Exception as e:
            logger.error(f"Error querying Gemini: {e}")
            return f"Error: {str(e)}"

brain_engine = GeminiBrain()
