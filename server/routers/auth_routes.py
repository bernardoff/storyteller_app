from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, ConfigDict
from typing import List

from server.database import get_db, User, InviteCode
import server.auth as auth
from server.config import get_settings
from google.oauth2 import id_token
from google.auth.transport import requests
settings = get_settings()

router = APIRouter(prefix="/api/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str
    invite_code: str

class SetupRequest(BaseModel):
    username: str
    password: str
    display_name: str
    setup_key: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    display_name: str

class InviteCodeResponse(BaseModel):
    code: str

class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    credits_remaining: int
    
    model_config = ConfigDict(from_attributes=True)

class GoogleAuthRequest(BaseModel):
    credential: str

@router.post("/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalars().first()
    if not user or not user.password_hash or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
    access_token = auth.create_access_token(data={"sub": user.username})
    return TokenResponse(access_token=access_token, role=user.role, display_name=user.display_name)

@router.post("/google", response_model=TokenResponse)
async def google_login(request: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    try:
        idinfo = id_token.verify_oauth2_token(request.credential, requests.Request(), settings.GOOGLE_CLIENT_ID)
        email = idinfo.get("email")
        google_id = idinfo.get("sub")
        display_name = idinfo.get("name", email)
        
        result = await db.execute(select(User).where((User.google_id == google_id) | (User.email == email)))
        user = result.scalars().first()
        
        if not user:
            role = "storyteller" if email == "bernardoff@gmail.com" else "player"
            user = User(
                username=email,
                email=email,
                google_id=google_id,
                display_name=display_name,
                role=role,
                credits_remaining=settings.DEFAULT_PLAYER_CREDITS
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        
        access_token = auth.create_access_token(data={"sub": user.username})
        return TokenResponse(access_token=access_token, role=user.role, display_name=user.display_name)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

@router.post("/setup", response_model=TokenResponse)
async def setup(request: SetupRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar()
    if count > 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Setup already completed")
    if request.setup_key != settings.SETUP_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid setup key")
    
    user = User(
        username=request.username, 
        display_name=request.display_name, 
        role="storyteller", 
        password_hash=auth.get_password_hash(request.password)
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    access_token = auth.create_access_token(data={"sub": user.username})
    return TokenResponse(access_token=access_token, role=user.role, display_name=user.display_name)

@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InviteCode).where(InviteCode.code == request.invite_code, InviteCode.used_by == None))
    invite_code = result.scalars().first()
    if not invite_code:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or already used invite code")
    
    user = User(
        username=request.username, 
        display_name=request.display_name, 
        role="player", 
        password_hash=auth.get_password_hash(request.password), 
        credits_remaining=settings.DEFAULT_PLAYER_CREDITS
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    invite_code.used_by = user.id
    await db.commit()
    
    access_token = auth.create_access_token(data={"sub": user.username})
    return TokenResponse(access_token=access_token, role=user.role, display_name=user.display_name)

@router.post("/invite", response_model=InviteCodeResponse)
async def create_invite(current_user: User = Depends(auth.require_storyteller), db: AsyncSession = Depends(get_db)):
    code = auth.generate_invite_code()
    invite = InviteCode(code=code, created_by=current_user.id)
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return InviteCodeResponse(code=invite.code)

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(auth.get_current_user)):
    return current_user

@router.get("/players", response_model=List[UserResponse])
async def read_players(current_user: User = Depends(auth.require_storyteller), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.role == "player"))
    players = result.scalars().all()
    return players
