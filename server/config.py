from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    
    GEMINI_API_KEY: str = ''
    GOOGLE_CLIENT_ID: str = ''
    SECRET_KEY: str = 'change-me-to-a-random-secret'
    SETUP_KEY: str = 'storyteller-setup'
    DATABASE_URL: str = 'sqlite+aiosqlite:///./data/storyteller.db'
    OLLAMA_BASE_URL: str = 'http://localhost:11434'
    OLLAMA_MODEL: str = 'qwen2.5-coder:14b'
    OLLAMA_EMBED_MODEL: str = 'all-minilm:l6-v2'
    CHROMA_DB_PATH: str = './chroma_db'
    KNOWLEDGE_BASE_PATH: str = './knowledge_base'
    DEFAULT_PLAYER_CREDITS: int = 5
    JWT_ALGORITHM: str = 'HS256'
    JWT_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: list[str] = ['http://localhost:5173', 'http://localhost:3000']
    
    GEMINI_MODEL: str = 'gemini-1.5-flash'
    GEMINI_BRAIN_ENABLED: bool = True
    GEMINI_CACHE_TTL_MINUTES: int = 60

@lru_cache
def get_settings() -> Settings:
    return Settings()
