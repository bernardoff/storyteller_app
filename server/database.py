from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, ForeignKey, Boolean, Integer, Float, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from server.config import get_settings

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    google_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    role: Mapped[str] = mapped_column(String(20), default='player')
    credits_remaining: Mapped[int] = mapped_column(default=5)
    credits_total_used: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    is_active: Mapped[bool] = mapped_column(default=True)

class InviteCode(Base):
    __tablename__ = 'invite_codes'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    used_by: Mapped[Optional[int]] = mapped_column(ForeignKey('users.id'), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    used_at: Mapped[Optional[datetime]] = mapped_column(nullable=True, default=None)

class Character(Base):
    __tablename__ = 'characters'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    name: Mapped[str] = mapped_column(String(100))
    clan: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    generation: Mapped[Optional[int]] = mapped_column(nullable=True)
    nature: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    demeanor: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    road: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    road_rating: Mapped[Optional[int]] = mapped_column(nullable=True)
    physical_strength: Mapped[int] = mapped_column(default=1)
    physical_dexterity: Mapped[int] = mapped_column(default=1)
    physical_stamina: Mapped[int] = mapped_column(default=1)
    social_charisma: Mapped[int] = mapped_column(default=1)
    social_manipulation: Mapped[int] = mapped_column(default=1)
    social_appearance: Mapped[int] = mapped_column(default=1)
    mental_perception: Mapped[int] = mapped_column(default=1)
    mental_intelligence: Mapped[int] = mapped_column(default=1)
    mental_wits: Mapped[int] = mapped_column(default=1)
    abilities_talents_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    abilities_skills_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    abilities_knowledges_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    other_traits_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    health_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    equipment_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    blood_pool_pts: Mapped[int] = mapped_column(default=1)
    concept: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sire: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    chronicle: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    specializations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    abilities_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    disciplines_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    backgrounds_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    virtue_conscience: Mapped[int] = mapped_column(default=1)
    virtue_self_control: Mapped[int] = mapped_column(default=1)
    virtue_courage: Mapped[int] = mapped_column(default=1)
    willpower_max: Mapped[int] = mapped_column(default=1)
    willpower_current: Mapped[int] = mapped_column(default=1)
    blood_pool_max: Mapped[int] = mapped_column(default=10)
    blood_pool_current: Mapped[int] = mapped_column(default=10)
    health_levels_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    merits_flaws_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    experience_total: Mapped[int] = mapped_column(default=0)
    experience_spent: Mapped[int] = mapped_column(default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_npc: Mapped[bool] = mapped_column(default=False)
    character_type: Mapped[str] = mapped_column(String(20), default="PC")
    is_locked: Mapped[bool] = mapped_column(default=False)
    campaign_era: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(nullable=True, onupdate=func.now())

class Campaign(Base):
    __tablename__ = 'campaigns'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_era: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    current_in_game_date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    masquerade_threat_level: Mapped[int] = mapped_column(default=0)

class SessionLog(Base):
    __tablename__ = 'session_logs'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey('campaigns.id'))
    session_number: Mapped[int]
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    in_game_date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detailed_log: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_events_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    npcs_encountered_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    items_acquired_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    played_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    audio_status: Mapped[str] = mapped_column(String(20), default='none')
    raw_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

class SessionAttendance(Base):
    __tablename__ = 'session_attendance'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey('session_logs.id'))
    character_id: Mapped[int] = mapped_column(ForeignKey('characters.id'))
    xp_gained: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=func.now())

class CombatEncounter(Base):
    __tablename__ = 'combat_encounters'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey('campaigns.id'))
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey('session_logs.id'), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(default=True)
    current_turn_index: Mapped[int] = mapped_column(default=0)
    round_number: Mapped[int] = mapped_column(default=1)
    combatants_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    combat_log_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phase: Mapped[str] = mapped_column(String(20), default='initiative')
    initiative_roster_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pending_actions_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    damage_suggestions_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())

class DiceRoll(Base):
    __tablename__ = 'dice_rolls'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    campaign_id: Mapped[Optional[int]] = mapped_column(ForeignKey('campaigns.id'), nullable=True)
    pool_size: Mapped[int]
    difficulty: Mapped[int]
    specialty: Mapped[bool]
    rolls_json: Mapped[str] = mapped_column(Text)
    successes: Mapped[int]
    is_botch: Mapped[bool]
    result_label: Mapped[str] = mapped_column(String(50))
    context: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    rolled_at: Mapped[datetime] = mapped_column(default=func.now())

class TokenUsage(Base):
    __tablename__ = 'token_usage'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    provider: Mapped[str] = mapped_column(String(20))
    input_tokens: Mapped[int] = mapped_column(default=0)
    output_tokens: Mapped[int] = mapped_column(default=0)
    credits_cost: Mapped[float] = mapped_column(default=0.0)
    purpose: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(default=func.now())

class Image(Base):
    __tablename__ = 'images'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    campaign_id: Mapped[Optional[int]] = mapped_column(ForeignKey('campaigns.id'), nullable=True)
    filename: Mapped[str] = mapped_column(String(255))
    prompt: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(20))
    credits_cost: Mapped[float] = mapped_column(default=0.0)
    tags_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    shared: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())

class XpExpenditure(Base):
    __tablename__ = 'xp_expenditures'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    character_id: Mapped[int] = mapped_column(ForeignKey('characters.id'))
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey('session_logs.id'), nullable=True)
    cost: Mapped[int]
    description: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(default=func.now())

class DiablerieRecord(Base):
    __tablename__ = 'diablerie_records'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    diablerist_id: Mapped[int] = mapped_column(ForeignKey('characters.id'))
    victim_name: Mapped[str] = mapped_column(String(100))
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey('session_logs.id'), nullable=True)
    generation_gained: Mapped[int] = mapped_column(default=0)
    disciplines_gained: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())

class Vinculum(Base):
    __tablename__ = 'vinculum'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey('characters.id'))
    target_id: Mapped[int] = mapped_column(ForeignKey('characters.id'))
    rating: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(default=func.now())

class Asset(Base):
    __tablename__ = 'assets'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('characters.id'))
    name: Mapped[str] = mapped_column(String(200))
    asset_type: Mapped[str] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

class Weapon(Base):
    __tablename__ = 'weapons'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey('characters.id'), nullable=True)
    name: Mapped[str] = mapped_column(String(100))
    stats_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

class SinRecord(Base):
    __tablename__ = 'sin_records'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    character_id: Mapped[int] = mapped_column(ForeignKey('characters.id'))
    description: Mapped[str] = mapped_column(Text)
    humanity_loss: Mapped[int] = mapped_column(default=0)
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey('session_logs.id'), nullable=True)

class EquipmentCatalog(Base):
    __tablename__ = 'equipment_catalog'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stats_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

class HouseRule(Base):
    __tablename__ = 'house_rules'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)

_engine = None
_session_factory = None

def _get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(settings.DATABASE_URL, echo=False)
    return _engine

def _get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(_get_engine(), expire_on_commit=False)
    return _session_factory

async def init_db():
    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    session_factory = _get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
