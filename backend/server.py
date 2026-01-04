from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import bcrypt
import jwt
import stripe
from openai import OpenAI
from emergentintegrations.llm.chat import LlmChat, UserMessage
import base64
import json
import aiofiles

ROOT_DIR = Path(__file__).parent
MEDIA_DIR = ROOT_DIR / 'media'
MEDIA_DIR.mkdir(exist_ok=True)

load_dotenv(ROOT_DIR / '.env')

# Configure logging FIRST before using logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection with proper error handling
mongo_url = os.environ.get('MONGO_URL')
if not mongo_url:
    logger.error("MONGO_URL environment variable is not set!")
    raise ValueError("MONGO_URL environment variable is required")

try:
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[os.environ.get('DB_NAME', 'basketball_tracker')]
    logger.info("MongoDB client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize MongoDB client: {e}")
    raise

# Helper to convert MongoDB documents
def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.isoformat()
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if key == '_id':
                continue  # Skip MongoDB's _id field
            elif isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, dict):
                result[key] = serialize_doc(value)
            elif isinstance(value, list):
                result[key] = [serialize_doc(v) for v in value]
            else:
                result[key] = value
        return result
    return doc

# Stripe setup (test mode)
stripe.api_key = os.environ.get('STRIPE_SECRET_KEY', 'sk_test_placeholder')

# OpenAI/Emergent LLM setup
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
openai_client = None
if EMERGENT_LLM_KEY:
    # Try multiple base URLs for compatibility
    try:
        openai_client = OpenAI(
            api_key=EMERGENT_LLM_KEY
        )
    except Exception as e:
        logger.warning(f"Failed to initialize OpenAI client: {e}")

# JWT settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'basketball-tracker-secret-key-2025')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Create the main app
app = FastAPI(title="Basketball Stat Tracker API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()

# ==================== MODELS ====================

# User Models
class UserBase(BaseModel):
    email: EmailStr
    username: str

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    token: str
    email: EmailStr
    name: Optional[str] = None

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    username: str
    password_hash: str
    subscription_tier: str = "free"  # free, pro, team
    subscription_expires: Optional[datetime] = None
    stripe_customer_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    auth_provider: str = "email"  # email, google

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    subscription_tier: str
    subscription_expires: Optional[datetime] = None
    created_at: datetime

# Player Models
class PlayerStats(BaseModel):
    points: int = 0
    rebounds: int = 0
    offensive_rebounds: int = 0
    defensive_rebounds: int = 0
    assists: int = 0
    steals: int = 0
    blocks: int = 0
    turnovers: int = 0
    fouls: int = 0
    fg_made: int = 0
    fg_attempted: int = 0
    three_pt_made: int = 0
    three_pt_attempted: int = 0
    ft_made: int = 0
    ft_attempted: int = 0
    plus_minus: int = 0
    minutes_played: int = 0

class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    team_id: Optional[str] = None
    name: str
    number: Optional[int] = None
    position: Optional[str] = None
    height: Optional[str] = None  # e.g., "6'2" or "188cm"
    weight: Optional[int] = None  # in lbs
    photo: Optional[str] = None  # base64
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PlayerCreate(BaseModel):
    name: str
    number: Optional[int] = None
    position: Optional[str] = None
    team_id: Optional[str] = None
    photo: Optional[str] = None
    height: Optional[str] = None
    weight: Optional[int] = None

class PlayerUpdate(BaseModel):
    name: Optional[str] = None
    number: Optional[int] = None
    position: Optional[str] = None
    team_id: Optional[str] = None  # Can be set to null to remove from team
    photo: Optional[str] = None
    height: Optional[str] = None
    weight: Optional[int] = None

# Team Models
class Team(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    logo: Optional[str] = None  # base64
    color_primary: str = "#FF6B35"
    color_secondary: str = "#FFFFFF"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TeamCreate(BaseModel):
    name: str
    logo: Optional[str] = None
    color_primary: str = "#FF6B35"
    color_secondary: str = "#FFFFFF"

# Shot Chart Models
class ShotAttempt(BaseModel):
    x: float  # 0-100 percentage of court width
    y: float  # 0-100 percentage of court length
    made: bool
    shot_type: str  # "2pt", "3pt", "ft"
    quarter: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# Game Models
class GamePlayerStats(BaseModel):
    player_id: str
    player_name: str
    stats: PlayerStats = Field(default_factory=PlayerStats)
    shots: List[ShotAttempt] = []
    stat_events: List[Dict[str, Any]] = []  # Track individual stat events with period

class GameMedia(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # "photo", "video"
    data: str  # base64
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    description: Optional[str] = None
    is_highlight: bool = False
    quarter: Optional[int] = None

class Game(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    team_id: Optional[str] = None
    home_team_name: str = "My Team"  # Name of the user's team
    opponent_name: str
    game_date: datetime
    location: Optional[str] = None  # home, away
    game_type: Optional[str] = None  # preseason, tournament, regular_season, playoffs
    venue: Optional[str] = None  # Custom venue name
    period_type: str = "quarters"  # quarters (4 periods) or halves (2 periods)
    
    # Scores
    our_score: int = 0
    opponent_score: int = 0
    
    # Game state
    status: str = "in_progress"  # in_progress, completed
    current_period: int = 1  # Current quarter (1-4) or half (1-2)
    active_player_ids: List[str] = []  # Players currently "in" the game (for team mode)
    court_side: str = "top"  # Which side is 1st half: "top" or "bottom"
    
    # Sharing
    share_token: Optional[str] = None  # Unique token for public sharing
    is_public: bool = False  # Whether the game is publicly viewable
    
    # Player stats
    player_stats: List[GamePlayerStats] = []
    
    # Media
    media: List[GameMedia] = []
    scoreboard_photo: Optional[str] = None  # base64
    
    # Notes and tags
    notes: Optional[str] = None
    tags: List[str] = []
    
    # AI Summary
    ai_summary: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

class GameCreate(BaseModel):
    team_id: Optional[str] = None
    home_team_name: str = "My Team"  # Name of the user's team
    opponent_name: str
    game_date: datetime
    location: Optional[str] = None  # home, away
    game_type: Optional[str] = None  # preseason, tournament, regular_season, playoffs
    venue: Optional[str] = None  # Custom venue name
    period_type: str = "quarters"  # quarters or halves
    player_ids: List[str] = []

class StatUpdate(BaseModel):
    player_id: str
    stat_type: str  # points, rebounds, assists, etc.
    value: int = 1
    shot_location: Optional[Dict[str, float]] = None  # {x, y} for shot chart
    
    class Config:
        extra = "ignore"  # Ignore any extra fields

class GameUpdate(BaseModel):
    our_score: Optional[int] = None
    opponent_score: Optional[int] = None
    current_period: Optional[int] = None  # Current quarter or half
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    scoreboard_photo: Optional[str] = None
    status: Optional[str] = None
    active_player_ids: Optional[List[str]] = None  # Players currently "in" the game
    court_side: Optional[str] = None  # Which side is 1st half: "top" or "bottom"
    team_id: Optional[str] = None
    home_team_name: Optional[str] = None
    player_minutes: Optional[Dict[str, int]] = None  # Player ID -> seconds played

# Highlight Reel Models
class HighlightReel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    description: Optional[str] = None
    game_ids: List[str] = []
    media_ids: List[str] = []
    season: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    ai_description: Optional[str] = None

class HighlightReelCreate(BaseModel):
    name: str
    description: Optional[str] = None
    game_ids: List[str] = []
    media_ids: List[str] = []
    season: Optional[str] = None

# Subscription Models
class SubscriptionCreate(BaseModel):
    tier: str  # pro, team
    billing_period: str = "yearly"  # monthly or yearly
    payment_method_id: Optional[str] = None

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())

def create_token(user_id: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Master admin emails with full access
MASTER_ADMIN_EMAILS = ["marcellosher33@yahoo.com"]

def check_subscription(user: dict, required_tier: str) -> bool:
    """Check if user has required subscription tier"""
    # Master admin emails always have full access
    if user.get("email", "").lower() in [e.lower() for e in MASTER_ADMIN_EMAILS]:
        return True
    
    tier_levels = {"free": 0, "pro": 1, "team": 2}
    user_tier = user.get("subscription_tier", "free")
    
    # Check subscription status
    sub_status = user.get("subscription_status", "active")
    if sub_status in ["canceled", "expired", "payment_failed"]:
        # If subscription is canceled/expired/failed, treat as free tier
        return tier_levels["free"] >= tier_levels[required_tier]
    
    # Check if subscription is expired
    expires = user.get("subscription_expires")
    if expires:
        # Handle both datetime objects and strings
        if isinstance(expires, str):
            try:
                expires = datetime.fromisoformat(expires.replace('Z', '+00:00'))
            except:
                expires = None
        if expires and isinstance(expires, datetime) and expires < datetime.utcnow():
            return tier_levels["free"] >= tier_levels[required_tier]
    
    return tier_levels.get(user_tier, 0) >= tier_levels.get(required_tier, 0)

def is_master_admin(user: dict) -> bool:
    """Check if user is a master admin"""
    return user.get("email", "").lower() in [e.lower() for e in MASTER_ADMIN_EMAILS]

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if username exists
    existing_username = await db.users.find_one({"username": user_data.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    user = User(
        email=user_data.email,
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        auth_provider="email"
    )
    
    await db.users.insert_one(user.dict())
    token = create_token(user.id, user.email)
    
    return {
        "token": token,
        "user": UserResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            subscription_tier=user.subscription_tier,
            subscription_expires=user.subscription_expires,
            created_at=user.created_at
        )
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["email"])
    
    return {
        "token": token,
        "user": UserResponse(
            id=user["id"],
            email=user["email"],
            username=user["username"],
            subscription_tier=user.get("subscription_tier", "free"),
            subscription_expires=user.get("subscription_expires"),
            created_at=user["created_at"]
        )
    }

@api_router.post("/auth/google")
async def google_auth(auth_data: GoogleAuthRequest):
    """Handle Google OAuth login"""
    # Check if user exists
    user = await db.users.find_one({"email": auth_data.email})
    
    if user:
        # Update existing user if needed
        token = create_token(user["id"], user["email"])
        return {
            "token": token,
            "user": UserResponse(
                id=user["id"],
                email=user["email"],
                username=user["username"],
                subscription_tier=user.get("subscription_tier", "free"),
                subscription_expires=user.get("subscription_expires"),
                created_at=user["created_at"]
            )
        }
    
    # Create new user
    username = auth_data.name or auth_data.email.split("@")[0]
    # Ensure unique username
    base_username = username
    counter = 1
    while await db.users.find_one({"username": username}):
        username = f"{base_username}{counter}"
        counter += 1
    
    new_user = User(
        email=auth_data.email,
        username=username,
        password_hash="",  # No password for OAuth users
        auth_provider="google"
    )
    
    await db.users.insert_one(new_user.dict())
    token = create_token(new_user.id, new_user.email)
    
    return {
        "token": token,
        "user": UserResponse(
            id=new_user.id,
            email=new_user.email,
            username=new_user.username,
            subscription_tier=new_user.subscription_tier,
            subscription_expires=new_user.subscription_expires,
            created_at=new_user.created_at
        )
    }

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        username=user["username"],
        subscription_tier=user.get("subscription_tier", "free"),
        subscription_expires=user.get("subscription_expires"),
        created_at=user["created_at"]
    )

# ==================== PLAYER ROUTES ====================

@api_router.post("/players")
async def create_player(player_data: PlayerCreate, user: dict = Depends(get_current_user)):
    player = Player(
        user_id=user["id"],
        name=player_data.name,
        number=player_data.number,
        position=player_data.position,
        team_id=player_data.team_id,
        photo=player_data.photo,
        height=player_data.height,
        weight=player_data.weight
    )
    await db.players.insert_one(player.dict())
    return player

@api_router.get("/players")
async def get_players(team_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if team_id:
        query["team_id"] = team_id
    players = await db.players.find(query).to_list(100)
    return serialize_doc(players)

@api_router.get("/players/{player_id}")
async def get_player(player_id: str, user: dict = Depends(get_current_user)):
    player = await db.players.find_one({"id": player_id, "user_id": user["id"]})
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return serialize_doc(player)

@api_router.put("/players/{player_id}")
async def update_player(player_id: str, player_data: PlayerUpdate, user: dict = Depends(get_current_user)):
    # Build update dict, only including fields that were actually provided
    update_data = {}
    data_dict = player_data.dict()
    
    for key, value in data_dict.items():
        # Include the field if it was explicitly set (even if to None for team_id)
        if key == 'team_id':
            # Always include team_id to allow removing from team
            update_data[key] = value
        elif value is not None:
            update_data[key] = value
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.players.update_one(
        {"id": player_id, "user_id": user["id"]},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Player not found")
    
    updated_player = await db.players.find_one({"id": player_id})
    return serialize_doc(updated_player)

@api_router.delete("/players/{player_id}")
async def delete_player(player_id: str, user: dict = Depends(get_current_user)):
    result = await db.players.delete_one({"id": player_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Player not found")
    return {"message": "Player deleted"}

# ==================== TEAM ROUTES ====================

@api_router.post("/teams")
async def create_team(team_data: TeamCreate, user: dict = Depends(get_current_user)):
    if not check_subscription(user, "team"):
        raise HTTPException(status_code=403, detail="Team tier subscription required")
    
    team = Team(
        user_id=user["id"],
        name=team_data.name,
        logo=team_data.logo,
        color_primary=team_data.color_primary,
        color_secondary=team_data.color_secondary
    )
    await db.teams.insert_one(team.dict())
    return team

@api_router.get("/teams")
async def get_teams(user: dict = Depends(get_current_user)):
    teams = await db.teams.find({"user_id": user["id"]}).to_list(50)
    return serialize_doc(teams)

@api_router.get("/teams/{team_id}")
async def get_team(team_id: str, user: dict = Depends(get_current_user)):
    team = await db.teams.find_one({"id": team_id, "user_id": user["id"]})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return serialize_doc(team)

@api_router.put("/teams/{team_id}")
async def update_team(team_id: str, team_data: TeamCreate, user: dict = Depends(get_current_user)):
    result = await db.teams.update_one(
        {"id": team_id, "user_id": user["id"]},
        {"$set": team_data.dict(exclude_unset=True)}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Team not found")
    updated_team = await db.teams.find_one({"id": team_id})
    return serialize_doc(updated_team)

@api_router.delete("/teams/{team_id}")
async def delete_team(team_id: str, user: dict = Depends(get_current_user)):
    result = await db.teams.delete_one({"id": team_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Team not found")
    return {"message": "Team deleted"}

@api_router.get("/teams/{team_id}/players")
async def get_team_players(team_id: str, user: dict = Depends(get_current_user)):
    """Get all players in a team"""
    team = await db.teams.find_one({"id": team_id, "user_id": user["id"]})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    players = await db.players.find({"team_id": team_id, "user_id": user["id"]}).to_list(100)
    return serialize_doc(players)

@api_router.post("/teams/{team_id}/players/{player_id}")
async def add_player_to_team(team_id: str, player_id: str, user: dict = Depends(get_current_user)):
    """Add a player to a team"""
    team = await db.teams.find_one({"id": team_id, "user_id": user["id"]})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    player = await db.players.find_one({"id": player_id, "user_id": user["id"]})
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    await db.players.update_one(
        {"id": player_id},
        {"$set": {"team_id": team_id}}
    )
    return {"message": "Player added to team"}

@api_router.delete("/teams/{team_id}/players/{player_id}")
async def remove_player_from_team(team_id: str, player_id: str, user: dict = Depends(get_current_user)):
    """Remove a player from a team"""
    await db.players.update_one(
        {"id": player_id, "user_id": user["id"], "team_id": team_id},
        {"$set": {"team_id": None}}
    )
    return {"message": "Player removed from team"}

# ==================== GAME ROUTES ====================

@api_router.post("/games")
async def create_game(game_data: GameCreate, user: dict = Depends(get_current_user)):
    # Get players for this game
    player_stats = []
    for player_id in game_data.player_ids:
        player = await db.players.find_one({"id": player_id, "user_id": user["id"]})
        if player:
            player_stats.append(GamePlayerStats(
                player_id=player_id,
                player_name=player["name"]
            ))
    
    game = Game(
        user_id=user["id"],
        team_id=game_data.team_id,
        home_team_name=game_data.home_team_name,
        opponent_name=game_data.opponent_name,
        game_date=game_data.game_date,
        location=game_data.location,
        game_type=game_data.game_type,
        venue=game_data.venue,
        period_type=game_data.period_type,
        player_stats=player_stats
    )
    
    await db.games.insert_one(game.dict())
    return game

@api_router.get("/games")
async def get_games(
    status: Optional[str] = None,
    team_id: Optional[str] = None,
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    query = {"user_id": user["id"]}
    if status:
        query["status"] = status
    if team_id:
        query["team_id"] = team_id
    
    # Free tier can only see last 2 completed games
    if not check_subscription(user, "pro"):
        # Get in-progress games
        in_progress = await db.games.find({**query, "status": "in_progress"}).sort("created_at", -1).to_list(50)
        # Get last 2 completed games
        completed = await db.games.find({**query, "status": "completed"}).sort("completed_at", -1).to_list(2)
        return serialize_doc(in_progress + completed)
    
    games = await db.games.find(query).sort("game_date", -1).to_list(limit)
    return serialize_doc(games)

@api_router.get("/games/{game_id}")
async def get_game(game_id: str, user: dict = Depends(get_current_user)):
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return serialize_doc(game)

@api_router.put("/games/{game_id}")
async def update_game(game_id: str, game_data: GameUpdate, user: dict = Depends(get_current_user)):
    # Check if user can edit (pro+ for completed games)
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if game.get("status") == "completed" and not check_subscription(user, "pro"):
        raise HTTPException(status_code=403, detail="Pro subscription required to edit completed games")
    
    update_data = game_data.dict(exclude_unset=True)
    if game_data.status == "completed":
        update_data["completed_at"] = datetime.utcnow()
    
    # Handle player_minutes - update each player's stats with their minutes
    if game_data.player_minutes:
        player_stats = game.get("player_stats", [])
        for ps in player_stats:
            player_id = ps.get("player_id")
            if player_id in game_data.player_minutes:
                ps["stats"]["minutes_played"] = game_data.player_minutes[player_id]
        update_data["player_stats"] = player_stats
        # Remove player_minutes from update_data as we've processed it
        del update_data["player_minutes"]
    
    await db.games.update_one(
        {"id": game_id, "user_id": user["id"]},
        {"$set": update_data}
    )
    updated_game = await db.games.find_one({"id": game_id})
    return serialize_doc(updated_game)

# ============ LIVE GAME SHARING ============

import secrets

@api_router.post("/games/{game_id}/share")
async def create_share_link(game_id: str, user: dict = Depends(get_current_user)):
    """Generate a share token for public game viewing"""
    # Check subscription - live sharing requires Pro
    if not check_subscription(user, "pro"):
        raise HTTPException(status_code=403, detail="Pro subscription required for live sharing")
    
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Generate unique share token if not already exists
    share_token = game.get("share_token") or secrets.token_urlsafe(16)
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"share_token": share_token, "is_public": True}}
    )
    
    return {
        "share_token": share_token,
        "share_url": f"/live/{share_token}"
    }

@api_router.delete("/games/{game_id}/share")
async def revoke_share_link(game_id: str, user: dict = Depends(get_current_user)):
    """Revoke public sharing for a game"""
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"is_public": False}}
    )
    
    return {"message": "Share link revoked"}

@api_router.get("/live/{share_token}")
async def get_public_game(share_token: str):
    """Public endpoint - no auth required. Get game by share token."""
    game = await db.games.find_one({"share_token": share_token, "is_public": True})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found or not shared")
    
    # Return game data without sensitive info
    game_data = serialize_doc(game)
    # Remove user_id for privacy
    game_data.pop("user_id", None)
    return game_data

# ============ SEASON STATS ============

@api_router.get("/season-stats")
async def get_season_stats(user: dict = Depends(get_current_user)):
    """Get aggregated season statistics"""
    games = await db.games.find({"user_id": user["id"]}).to_list(1000)
    
    if not games:
        return {
            "total_games": 0,
            "wins": 0,
            "losses": 0,
            "ties": 0,
            "total_points_for": 0,
            "total_points_against": 0,
            "avg_points_for": 0,
            "avg_points_against": 0,
            "player_season_stats": [],
            "recent_games": [],
            "best_game": None,
            "worst_game": None,
        }
    
    completed_games = [g for g in games if g.get("status") == "completed"]
    
    # Calculate win/loss record
    wins = sum(1 for g in completed_games if g.get("our_score", 0) > g.get("opponent_score", 0))
    losses = sum(1 for g in completed_games if g.get("our_score", 0) < g.get("opponent_score", 0))
    ties = sum(1 for g in completed_games if g.get("our_score", 0) == g.get("opponent_score", 0))
    
    # Calculate totals
    total_points_for = sum(g.get("our_score", 0) for g in completed_games)
    total_points_against = sum(g.get("opponent_score", 0) for g in completed_games)
    
    # Aggregate player stats across all games
    player_totals = {}
    for game in games:
        for ps in game.get("player_stats", []):
            pid = ps.get("player_id")
            if pid not in player_totals:
                player_totals[pid] = {
                    "player_id": pid,
                    "player_name": ps.get("player_name", "Unknown"),
                    "games_played": 0,
                    "total_points": 0,
                    "total_rebounds": 0,
                    "total_assists": 0,
                    "total_steals": 0,
                    "total_blocks": 0,
                    "total_turnovers": 0,
                    "total_fg_made": 0,
                    "total_fg_attempted": 0,
                    "total_3pt_made": 0,
                    "total_3pt_attempted": 0,
                    "total_ft_made": 0,
                    "total_ft_attempted": 0,
                    "game_scores": [],  # For trend data
                }
            
            stats = ps.get("stats", {})
            pt = player_totals[pid]
            pt["games_played"] += 1
            pt["total_points"] += stats.get("points", 0)
            pt["total_rebounds"] += stats.get("rebounds", 0) or (stats.get("offensive_rebounds", 0) + stats.get("defensive_rebounds", 0))
            pt["total_assists"] += stats.get("assists", 0)
            pt["total_steals"] += stats.get("steals", 0)
            pt["total_blocks"] += stats.get("blocks", 0)
            pt["total_turnovers"] += stats.get("turnovers", 0)
            pt["total_fg_made"] += stats.get("fg_made", 0)
            pt["total_fg_attempted"] += stats.get("fg_attempted", 0)
            pt["total_3pt_made"] += stats.get("three_pt_made", 0)
            pt["total_3pt_attempted"] += stats.get("three_pt_attempted", 0)
            pt["total_ft_made"] += stats.get("ft_made", 0)
            pt["total_ft_attempted"] += stats.get("ft_attempted", 0)
            pt["total_minutes"] = pt.get("total_minutes", 0) + stats.get("minutes_played", 0)
            
            # Add to trend data
            pt["game_scores"].append({
                "game_id": game.get("id"),
                "game_date": game.get("game_date"),
                "opponent": game.get("opponent_name"),
                "points": stats.get("points", 0),
                "rebounds": stats.get("rebounds", 0) or (stats.get("offensive_rebounds", 0) + stats.get("defensive_rebounds", 0)),
                "assists": stats.get("assists", 0),
                "minutes": stats.get("minutes_played", 0),
            })
    
    # Calculate averages
    player_season_stats = []
    for pid, pt in player_totals.items():
        gp = pt["games_played"]
        total_mins = pt.get("total_minutes", 0)
        if gp > 0:
            player_season_stats.append({
                "player_id": pt["player_id"],
                "player_name": pt["player_name"],
                "games_played": gp,
                "ppg": round(pt["total_points"] / gp, 1),
                "rpg": round(pt["total_rebounds"] / gp, 1),
                "apg": round(pt["total_assists"] / gp, 1),
                "spg": round(pt["total_steals"] / gp, 1),
                "bpg": round(pt["total_blocks"] / gp, 1),
                "topg": round(pt["total_turnovers"] / gp, 1),
                "mpg": round(total_mins / 60 / gp, 1),  # Minutes per game
                "fg_pct": round((pt["total_fg_made"] / pt["total_fg_attempted"] * 100) if pt["total_fg_attempted"] > 0 else 0, 1),
                "three_pt_pct": round((pt["total_3pt_made"] / pt["total_3pt_attempted"] * 100) if pt["total_3pt_attempted"] > 0 else 0, 1),
                "ft_pct": round((pt["total_ft_made"] / pt["total_ft_attempted"] * 100) if pt["total_ft_attempted"] > 0 else 0, 1),
                "totals": {
                    "points": pt["total_points"],
                    "rebounds": pt["total_rebounds"],
                    "assists": pt["total_assists"],
                    "steals": pt["total_steals"],
                    "blocks": pt["total_blocks"],
                    "minutes": total_mins,  # Total seconds played
                },
                "trend_data": sorted(pt["game_scores"], key=lambda x: x.get("game_date") or ""),
            })
    
    # Sort by PPG
    player_season_stats.sort(key=lambda x: x["ppg"], reverse=True)
    
    # Find best/worst games by point differential
    best_game = None
    worst_game = None
    if completed_games:
        sorted_by_diff = sorted(completed_games, key=lambda g: g.get("our_score", 0) - g.get("opponent_score", 0), reverse=True)
        best_game = serialize_doc(sorted_by_diff[0]) if sorted_by_diff else None
        worst_game = serialize_doc(sorted_by_diff[-1]) if sorted_by_diff else None
    
    # Recent games (last 5)
    recent_games = sorted(games, key=lambda g: g.get("game_date") or g.get("created_at"), reverse=True)[:5]
    recent_games = [serialize_doc(g) for g in recent_games]
    
    return {
        "total_games": len(games),
        "completed_games": len(completed_games),
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "win_pct": round(wins / len(completed_games) * 100, 1) if completed_games else 0,
        "total_points_for": total_points_for,
        "total_points_against": total_points_against,
        "avg_points_for": round(total_points_for / len(completed_games), 1) if completed_games else 0,
        "avg_points_against": round(total_points_against / len(completed_games), 1) if completed_games else 0,
        "point_differential": total_points_for - total_points_against,
        "player_season_stats": player_season_stats,
        "recent_games": recent_games,
        "best_game": best_game,
        "worst_game": worst_game,
    }

# ============ UNDO HISTORY ============

@api_router.get("/games/{game_id}/undo-history")
async def get_undo_history(game_id: str, user: dict = Depends(get_current_user)):
    """Get last 10 stat events that can be undone"""
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    stat_history = game.get("stat_history", [])
    # Return last 10 entries, most recent first
    return {"history": stat_history[-10:][::-1]}

@api_router.post("/games/{game_id}/undo/{entry_index}")
async def undo_specific_stat(game_id: str, entry_index: int, user: dict = Depends(get_current_user)):
    """Undo a specific stat entry by its index in history"""
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    stat_history = game.get("stat_history", [])
    if entry_index < 0 or entry_index >= len(stat_history):
        raise HTTPException(status_code=400, detail="Invalid entry index")
    
    # Get the entry to undo (index from end, since we show reversed)
    actual_index = len(stat_history) - 1 - entry_index
    entry = stat_history[actual_index]
    
    player_id = entry.get("player_id")
    stat_type = entry.get("stat_type")
    value = entry.get("value", 1)
    shot_id = entry.get("shot_id")
    stat_event_id = entry.get("stat_event_id")
    
    # Find and update player stats
    player_stats = game.get("player_stats", [])
    for ps in player_stats:
        if ps.get("player_id") == player_id:
            stats = ps.get("stats", {})
            
            # Reverse the stat
            if stat_type in ["points_2", "miss_2"]:
                if stat_type == "points_2":
                    stats["points"] = max(0, stats.get("points", 0) - 2)
                    stats["fg_made"] = max(0, stats.get("fg_made", 0) - 1)
                stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) - 1)
                # Remove shot
                if shot_id:
                    ps["shots"] = [s for s in ps.get("shots", []) if s.get("id") != shot_id]
            elif stat_type in ["points_3", "miss_3"]:
                if stat_type == "points_3":
                    stats["points"] = max(0, stats.get("points", 0) - 3)
                    stats["fg_made"] = max(0, stats.get("fg_made", 0) - 1)
                    stats["three_pt_made"] = max(0, stats.get("three_pt_made", 0) - 1)
                stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) - 1)
                stats["three_pt_attempted"] = max(0, stats.get("three_pt_attempted", 0) - 1)
                if shot_id:
                    ps["shots"] = [s for s in ps.get("shots", []) if s.get("id") != shot_id]
            elif stat_type == "ft_made":
                stats["points"] = max(0, stats.get("points", 0) - 1)
                stats["ft_made"] = max(0, stats.get("ft_made", 0) - 1)
                stats["ft_attempted"] = max(0, stats.get("ft_attempted", 0) - 1)
            elif stat_type == "ft_missed":
                stats["ft_attempted"] = max(0, stats.get("ft_attempted", 0) - 1)
            elif stat_type in ["offensive_rebounds", "defensive_rebounds"]:
                stats[stat_type] = max(0, stats.get(stat_type, 0) - value)
                stats["rebounds"] = max(0, stats.get("rebounds", 0) - value)
            elif stat_type in ["assists", "steals", "blocks", "turnovers", "fouls"]:
                stats[stat_type] = max(0, stats.get(stat_type, 0) - value)
            
            # Remove stat event if exists
            if stat_event_id:
                ps["stat_events"] = [e for e in ps.get("stat_events", []) if e.get("id") != stat_event_id]
            
            ps["stats"] = stats
            break
    
    # Remove from history
    stat_history.pop(actual_index)
    
    # Recalculate score
    our_score = sum(ps.get("stats", {}).get("points", 0) for ps in player_stats)
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {
            "player_stats": player_stats,
            "stat_history": stat_history,
            "our_score": our_score
        }}
    )
    
    updated_game = await db.games.find_one({"id": game_id})
    return serialize_doc(updated_game)

# Debug endpoint to see raw request body
from fastapi import Request
@api_router.post("/games/{game_id}/stats-debug")
async def record_stat_debug(game_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Debug endpoint to see raw request body"""
    body = await request.body()
    print(f"[DEBUG] Raw body: {body}")
    try:
        import json
        data = json.loads(body)
        print(f"[DEBUG] Parsed JSON: {data}")
    except Exception as e:
        print(f"[DEBUG] JSON parse error: {e}")
    return {"received": str(body)}

@api_router.post("/games/{game_id}/stats")
async def record_stat(game_id: str, stat: StatUpdate, user: dict = Depends(get_current_user)):
    """Record a stat during live game"""
    print(f"[record_stat] Received: game_id={game_id}, stat={stat.dict()}")
    
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Find player in game stats
    player_stats = game.get("player_stats", [])
    stat_history = game.get("stat_history", [])
    player_found = False
    shot_id = None
    
    for ps in player_stats:
        if ps["player_id"] == stat.player_id:
            player_found = True
            stats = ps.get("stats", {})
            current_period = game.get("current_period", game.get("current_quarter", 1))
            
            # Handle different stat types
            if stat.stat_type == "points_2":
                stats["points"] = stats.get("points", 0) + 2
                stats["fg_made"] = stats.get("fg_made", 0) + 1
                stats["fg_attempted"] = stats.get("fg_attempted", 0) + 1
                if stat.shot_location:
                    shot_id = str(uuid.uuid4())
                    ps.setdefault("shots", []).append({
                        "id": shot_id,
                        "x": stat.shot_location["x"],
                        "y": stat.shot_location["y"],
                        "made": True,
                        "shot_type": "2pt",
                        "period": current_period,
                        "timestamp": datetime.utcnow().isoformat()
                    })
            elif stat.stat_type == "points_3":
                stats["points"] = stats.get("points", 0) + 3
                stats["three_pt_made"] = stats.get("three_pt_made", 0) + 1
                stats["three_pt_attempted"] = stats.get("three_pt_attempted", 0) + 1
                stats["fg_made"] = stats.get("fg_made", 0) + 1  # 3pt shots count as field goals
                stats["fg_attempted"] = stats.get("fg_attempted", 0) + 1  # 3pt shots count as field goals
                if stat.shot_location:
                    shot_id = str(uuid.uuid4())
                    ps.setdefault("shots", []).append({
                        "id": shot_id,
                        "x": stat.shot_location["x"],
                        "y": stat.shot_location["y"],
                        "made": True,
                        "shot_type": "3pt",
                        "period": current_period,
                        "timestamp": datetime.utcnow().isoformat()
                    })
            elif stat.stat_type == "ft_made":
                stats["points"] = stats.get("points", 0) + 1
                stats["ft_made"] = stats.get("ft_made", 0) + 1
                stats["ft_attempted"] = stats.get("ft_attempted", 0) + 1
                # Track FT event with period
                ft_event_id = str(uuid.uuid4())
                ps.setdefault("stat_events", []).append({
                    "id": ft_event_id,
                    "stat_type": "ft_made",
                    "value": 1,
                    "period": current_period,
                    "timestamp": datetime.utcnow().isoformat()
                })
            elif stat.stat_type == "ft_missed":
                stats["ft_attempted"] = stats.get("ft_attempted", 0) + 1
                # Track FT miss event with period
                ft_event_id = str(uuid.uuid4())
                ps.setdefault("stat_events", []).append({
                    "id": ft_event_id,
                    "stat_type": "ft_missed",
                    "value": 1,
                    "period": current_period,
                    "timestamp": datetime.utcnow().isoformat()
                })
            elif stat.stat_type == "miss_2":
                stats["fg_attempted"] = stats.get("fg_attempted", 0) + 1
                if stat.shot_location:
                    shot_id = str(uuid.uuid4())
                    ps.setdefault("shots", []).append({
                        "id": shot_id,
                        "x": stat.shot_location["x"],
                        "y": stat.shot_location["y"],
                        "made": False,
                        "shot_type": "2pt",
                        "period": current_period,
                        "timestamp": datetime.utcnow().isoformat()
                    })
            elif stat.stat_type == "miss_3":
                stats["three_pt_attempted"] = stats.get("three_pt_attempted", 0) + 1
                stats["fg_attempted"] = stats.get("fg_attempted", 0) + 1  # 3pt shots count as field goals
                if stat.shot_location:
                    shot_id = str(uuid.uuid4())
                    ps.setdefault("shots", []).append({
                        "id": shot_id,
                        "x": stat.shot_location["x"],
                        "y": stat.shot_location["y"],
                        "made": False,
                        "shot_type": "3pt",
                        "period": current_period,
                        "timestamp": datetime.utcnow().isoformat()
                    })
            elif stat.stat_type in ["rebounds", "offensive_rebounds", "defensive_rebounds", "assists", "steals", "blocks", "turnovers", "fouls"]:
                stats[stat.stat_type] = stats.get(stat.stat_type, 0) + stat.value
                # Also increment total rebounds for offensive/defensive
                if stat.stat_type in ["offensive_rebounds", "defensive_rebounds"]:
                    stats["rebounds"] = stats.get("rebounds", 0) + stat.value
                # Track stat event with period for filtering
                stat_event_id = str(uuid.uuid4())
                ps.setdefault("stat_events", []).append({
                    "id": stat_event_id,
                    "stat_type": stat.stat_type,
                    "value": stat.value,
                    "period": current_period,
                    "timestamp": datetime.utcnow().isoformat()
                })
            elif stat.stat_type == "plus_minus":
                stats["plus_minus"] = stats.get("plus_minus", 0) + stat.value
            elif stat.stat_type == "minutes":
                stats["minutes_played"] = stats.get("minutes_played", 0) + stat.value
            
            ps["stats"] = stats
            
            # Add to stat_history for undo functionality
            stat_history.append({
                "player_id": stat.player_id,
                "stat_type": stat.stat_type,
                "value": stat.value,
                "shot_id": shot_id,
                "timestamp": datetime.utcnow().isoformat()
            })
            break
    
    if not player_found:
        raise HTTPException(status_code=404, detail="Player not in this game")
    
    # Update our_score based on points
    total_points = sum(ps.get("stats", {}).get("points", 0) for ps in player_stats)
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"player_stats": player_stats, "our_score": total_points, "stat_history": stat_history}}
    )
    
    updated_game = await db.games.find_one({"id": game_id})
    return serialize_doc(updated_game)

# Stat adjustment model
class StatAdjustment(BaseModel):
    player_id: str
    stat_type: str
    adjustment: int  # positive or negative value

@api_router.post("/games/{game_id}/stats/adjust")
async def adjust_stat(game_id: str, adjustment: StatAdjustment, user: dict = Depends(get_current_user)):
    """Manually adjust a stat value (add or subtract)"""
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    player_stats = game.get("player_stats", [])
    player_found = False
    
    for ps in player_stats:
        if ps["player_id"] == adjustment.player_id:
            player_found = True
            stats = ps.get("stats", {})
            
            # Handle point adjustments specially
            if adjustment.stat_type == "points":
                stats["points"] = max(0, stats.get("points", 0) + adjustment.adjustment)
            elif adjustment.stat_type == "fg_made":
                stats["fg_made"] = max(0, stats.get("fg_made", 0) + adjustment.adjustment)
                if adjustment.adjustment > 0:
                    stats["fg_attempted"] = stats.get("fg_attempted", 0) + adjustment.adjustment
                    stats["points"] = stats.get("points", 0) + (2 * adjustment.adjustment)
                else:
                    stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) + adjustment.adjustment)
                    stats["points"] = max(0, stats.get("points", 0) + (2 * adjustment.adjustment))
            elif adjustment.stat_type == "three_pt_made":
                stats["three_pt_made"] = max(0, stats.get("three_pt_made", 0) + adjustment.adjustment)
                stats["fg_made"] = max(0, stats.get("fg_made", 0) + adjustment.adjustment)
                if adjustment.adjustment > 0:
                    stats["three_pt_attempted"] = stats.get("three_pt_attempted", 0) + adjustment.adjustment
                    stats["fg_attempted"] = stats.get("fg_attempted", 0) + adjustment.adjustment
                    stats["points"] = stats.get("points", 0) + (3 * adjustment.adjustment)
                else:
                    stats["three_pt_attempted"] = max(0, stats.get("three_pt_attempted", 0) + adjustment.adjustment)
                    stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) + adjustment.adjustment)
                    stats["points"] = max(0, stats.get("points", 0) + (3 * adjustment.adjustment))
            elif adjustment.stat_type == "ft_made":
                stats["ft_made"] = max(0, stats.get("ft_made", 0) + adjustment.adjustment)
                if adjustment.adjustment > 0:
                    stats["ft_attempted"] = stats.get("ft_attempted", 0) + adjustment.adjustment
                    stats["points"] = stats.get("points", 0) + adjustment.adjustment
                else:
                    stats["ft_attempted"] = max(0, stats.get("ft_attempted", 0) + adjustment.adjustment)
                    stats["points"] = max(0, stats.get("points", 0) + adjustment.adjustment)
            elif adjustment.stat_type in ["rebounds", "offensive_rebounds", "defensive_rebounds", "assists", "steals", "blocks", "turnovers", "fouls"]:
                stats[adjustment.stat_type] = max(0, stats.get(adjustment.stat_type, 0) + adjustment.adjustment)
                # Also update total rebounds for offensive/defensive
                if adjustment.stat_type in ["offensive_rebounds", "defensive_rebounds"]:
                    stats["rebounds"] = max(0, stats.get("rebounds", 0) + adjustment.adjustment)
            
            ps["stats"] = stats
            break
    
    if not player_found:
        raise HTTPException(status_code=404, detail="Player not in this game")
    
    total_points = sum(ps.get("stats", {}).get("points", 0) for ps in player_stats)
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"player_stats": player_stats, "our_score": total_points}}
    )
    
    updated_game = await db.games.find_one({"id": game_id})
    return serialize_doc(updated_game)

@api_router.post("/games/{game_id}/stats/undo")
async def undo_last_stat(game_id: str, user: dict = Depends(get_current_user)):
    """Undo the last recorded stat by removing from stat_history"""
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    stat_history = game.get("stat_history", [])
    if not stat_history:
        raise HTTPException(status_code=400, detail="No stats to undo")
    
    last_stat = stat_history.pop()
    player_stats = game.get("player_stats", [])
    
    # Reverse the last stat
    for ps in player_stats:
        if ps["player_id"] == last_stat["player_id"]:
            stats = ps.get("stats", {})
            stat_type = last_stat["stat_type"]
            
            if stat_type == "points_2":
                stats["points"] = max(0, stats.get("points", 0) - 2)
                stats["fg_made"] = max(0, stats.get("fg_made", 0) - 1)
                stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) - 1)
            elif stat_type == "points_3":
                stats["points"] = max(0, stats.get("points", 0) - 3)
                stats["three_pt_made"] = max(0, stats.get("three_pt_made", 0) - 1)
                stats["three_pt_attempted"] = max(0, stats.get("three_pt_attempted", 0) - 1)
                stats["fg_made"] = max(0, stats.get("fg_made", 0) - 1)
                stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) - 1)
            elif stat_type == "ft_made":
                stats["points"] = max(0, stats.get("points", 0) - 1)
                stats["ft_made"] = max(0, stats.get("ft_made", 0) - 1)
                stats["ft_attempted"] = max(0, stats.get("ft_attempted", 0) - 1)
            elif stat_type == "ft_missed":
                stats["ft_attempted"] = max(0, stats.get("ft_attempted", 0) - 1)
            elif stat_type == "miss_2":
                stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) - 1)
            elif stat_type == "miss_3":
                stats["three_pt_attempted"] = max(0, stats.get("three_pt_attempted", 0) - 1)
                stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) - 1)
            elif stat_type in ["rebounds", "offensive_rebounds", "defensive_rebounds", "assists", "steals", "blocks", "turnovers", "fouls"]:
                stats[stat_type] = max(0, stats.get(stat_type, 0) - 1)
                # Also decrement total rebounds for offensive/defensive
                if stat_type in ["offensive_rebounds", "defensive_rebounds"]:
                    stats["rebounds"] = max(0, stats.get("rebounds", 0) - 1)
            
            # Remove shot from shots array if it was a shot
            if last_stat.get("shot_id"):
                ps["shots"] = [s for s in ps.get("shots", []) if s.get("id") != last_stat["shot_id"]]
            
            ps["stats"] = stats
            break
    
    total_points = sum(ps.get("stats", {}).get("points", 0) for ps in player_stats)
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"player_stats": player_stats, "our_score": total_points, "stat_history": stat_history}}
    )
    
    updated_game = await db.games.find_one({"id": game_id})
    return serialize_doc(updated_game)

# Shot management
class ShotUpdate(BaseModel):
    x: float
    y: float

@api_router.put("/games/{game_id}/players/{player_id}/shots/{shot_index}")
async def update_shot_location(
    game_id: str, 
    player_id: str, 
    shot_index: int, 
    shot_update: ShotUpdate,
    user: dict = Depends(get_current_user)
):
    """Update a shot's location on the chart"""
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    player_stats = game.get("player_stats", [])
    
    for ps in player_stats:
        if ps["player_id"] == player_id:
            shots = ps.get("shots", [])
            if shot_index < 0 or shot_index >= len(shots):
                raise HTTPException(status_code=404, detail="Shot not found")
            
            shots[shot_index]["x"] = shot_update.x
            shots[shot_index]["y"] = shot_update.y
            ps["shots"] = shots
            break
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"player_stats": player_stats}}
    )
    
    updated_game = await db.games.find_one({"id": game_id})
    return serialize_doc(updated_game)

@api_router.delete("/games/{game_id}/players/{player_id}/shots/{shot_index}")
async def delete_shot(
    game_id: str,
    player_id: str,
    shot_index: int,
    user: dict = Depends(get_current_user)
):
    """Delete a shot from the chart and adjust stats accordingly"""
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    player_stats = game.get("player_stats", [])
    
    for ps in player_stats:
        if ps["player_id"] == player_id:
            shots = ps.get("shots", [])
            if shot_index < 0 or shot_index >= len(shots):
                raise HTTPException(status_code=404, detail="Shot not found")
            
            shot = shots[shot_index]
            stats = ps.get("stats", {})
            
            # Adjust stats based on shot type
            if shot["shot_type"] == "2pt":
                stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) - 1)
                if shot["made"]:
                    stats["fg_made"] = max(0, stats.get("fg_made", 0) - 1)
                    stats["points"] = max(0, stats.get("points", 0) - 2)
            elif shot["shot_type"] == "3pt":
                stats["three_pt_attempted"] = max(0, stats.get("three_pt_attempted", 0) - 1)
                stats["fg_attempted"] = max(0, stats.get("fg_attempted", 0) - 1)
                if shot["made"]:
                    stats["three_pt_made"] = max(0, stats.get("three_pt_made", 0) - 1)
                    stats["fg_made"] = max(0, stats.get("fg_made", 0) - 1)
                    stats["points"] = max(0, stats.get("points", 0) - 3)
            
            shots.pop(shot_index)
            ps["shots"] = shots
            ps["stats"] = stats
            break
    
    total_points = sum(ps.get("stats", {}).get("points", 0) for ps in player_stats)
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"player_stats": player_stats, "our_score": total_points}}
    )
    
    updated_game = await db.games.find_one({"id": game_id})
    return serialize_doc(updated_game)

@api_router.post("/games/{game_id}/media")
async def add_game_media(
    game_id: str,
    media_type: str = Form(...),
    data: str = Form(...),
    description: Optional[str] = Form(None),
    is_highlight: bool = Form(False),
    quarter: Optional[int] = Form(None),
    user: dict = Depends(get_current_user)
):
    """Add photo or video to game"""
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Check subscription for video
    if media_type == "video" and not check_subscription(user, "pro"):
        raise HTTPException(status_code=403, detail="Pro subscription required for video recording")
    
    media = GameMedia(
        type=media_type,
        data=data,
        description=description,
        is_highlight=is_highlight,
        quarter=quarter
    )
    
    await db.games.update_one(
        {"id": game_id},
        {"$push": {"media": media.dict()}}
    )
    
    return {"message": "Media added", "media_id": media.id}

@api_router.delete("/games/{game_id}/media/{media_id}")
async def delete_game_media(game_id: str, media_id: str, user: dict = Depends(get_current_user)):
    """Delete media from game"""
    result = await db.games.update_one(
        {"id": game_id, "user_id": user["id"]},
        {"$pull": {"media": {"id": media_id}}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Media not found")
    return {"message": "Media deleted"}

@api_router.delete("/games/{game_id}")
async def delete_game(game_id: str, user: dict = Depends(get_current_user)):
    result = await db.games.delete_one({"id": game_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Game not found")
    return {"message": "Game deleted"}

# ==================== AI ROUTES ====================

@api_router.post("/games/{game_id}/ai-summary")
async def generate_ai_summary(game_id: str, user: dict = Depends(get_current_user)):
    """Generate AI summary of the game"""
    if not check_subscription(user, "pro"):
        raise HTTPException(status_code=403, detail="Pro subscription required for AI summaries")
    
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Get the team name - use home_team_name if available, otherwise default
    team_name = game.get('home_team_name') or 'Our Team'
    
    # Build game context
    player_summaries = []
    for ps in game.get("player_stats", []):
        stats = ps.get("stats", {})
        player_summaries.append(
            f"{ps['player_name']}: {stats.get('points', 0)} pts, {stats.get('rebounds', 0)} reb, "
            f"{stats.get('assists', 0)} ast, {stats.get('steals', 0)} stl, {stats.get('blocks', 0)} blk"
        )
    
    prompt = f"""Generate a comprehensive basketball game summary for social media sharing.

Game Details:
- {team_name} Score: {game.get('our_score', 0)}
- Opponent ({game.get('opponent_name', 'Opponent')}): {game.get('opponent_score', 0)}
- Date: {game.get('game_date', 'Unknown')}
- Location: {game.get('location', 'Unknown')}

Player Statistics for {team_name}:
{chr(10).join(player_summaries)}

Notes: {game.get('notes', 'None')}

IMPORTANT: Always refer to the team as "{team_name}" in your summary, never use "Our Team" or "Your Team".

Please provide:
1. A headline summary (1 sentence) - use the team name "{team_name}"
2. Key highlights and standout performers
3. Notable statistics
4. A social media ready recap (under 280 characters) - use the team name "{team_name}"
"""
    
    try:
        # Use emergent integrations library with correct API
        session_id = f"game-summary-{game_id}"
        llm = LlmChat(
            api_key=EMERGENT_LLM_KEY, 
            session_id=session_id, 
            system_message="You are a sports journalist specializing in basketball game summaries."
        )
        message = UserMessage(text=prompt)
        summary = await llm.send_message(message)
        
        # Save summary to game
        await db.games.update_one(
            {"id": game_id},
            {"$set": {"ai_summary": summary}}
        )
        
        return {"summary": summary}
    except Exception as e:
        logger.error(f"AI summary error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

@api_router.post("/highlight-description")
async def generate_highlight_description(
    media_ids: List[str],
    context: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Generate AI description for highlight reel"""
    if not check_subscription(user, "pro"):
        raise HTTPException(status_code=403, detail="Pro subscription required")
    
    if not openai_client:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    prompt = f"""Generate an exciting highlight reel description for basketball footage.
Context: {context or 'Basketball game highlights'}
Number of clips: {len(media_ids)}

Create:
1. An engaging title for the highlight reel
2. A brief, exciting description (2-3 sentences)
3. Suggested hashtags for social media
"""
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200
        )
        return {"description": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

# ==================== HIGHLIGHT REEL ROUTES ====================

@api_router.post("/highlight-reels")
async def create_highlight_reel(reel_data: HighlightReelCreate, user: dict = Depends(get_current_user)):
    if not check_subscription(user, "pro"):
        raise HTTPException(status_code=403, detail="Pro subscription required for highlight reels")
    
    reel = HighlightReel(
        user_id=user["id"],
        name=reel_data.name,
        description=reel_data.description,
        game_ids=reel_data.game_ids,
        media_ids=reel_data.media_ids,
        season=reel_data.season
    )
    await db.highlight_reels.insert_one(reel.dict())
    return reel

@api_router.get("/highlight-reels")
async def get_highlight_reels(user: dict = Depends(get_current_user)):
    if not check_subscription(user, "pro"):
        raise HTTPException(status_code=403, detail="Pro subscription required")
    
    reels = await db.highlight_reels.find({"user_id": user["id"]}).to_list(50)
    return reels

@api_router.get("/highlight-reels/{reel_id}")
async def get_highlight_reel(reel_id: str, user: dict = Depends(get_current_user)):
    reel = await db.highlight_reels.find_one({"id": reel_id, "user_id": user["id"]})
    if not reel:
        raise HTTPException(status_code=404, detail="Highlight reel not found")
    return reel

@api_router.delete("/highlight-reels/{reel_id}")
async def delete_highlight_reel(reel_id: str, user: dict = Depends(get_current_user)):
    result = await db.highlight_reels.delete_one({"id": reel_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Highlight reel not found")
    return {"message": "Highlight reel deleted"}

# ==================== STATS & ANALYTICS ROUTES ====================

@api_router.get("/players/{player_id}/stats")
async def get_player_stats(player_id: str, user: dict = Depends(get_current_user)):
    """Get aggregated stats for a player across all games"""
    player = await db.players.find_one({"id": player_id, "user_id": user["id"]})
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    games = await db.games.find({
        "user_id": user["id"],
        "player_stats.player_id": player_id,
        "status": "completed"
    }).to_list(1000)
    
    total_stats = {
        "games_played": 0,
        "total_points": 0,
        "total_rebounds": 0,
        "total_assists": 0,
        "total_steals": 0,
        "total_blocks": 0,
        "total_turnovers": 0,
        "total_fouls": 0,
        "total_fg_made": 0,
        "total_fg_attempted": 0,
        "total_3pt_made": 0,
        "total_3pt_attempted": 0,
        "total_ft_made": 0,
        "total_ft_attempted": 0,
        "total_minutes": 0,
        "game_history": []
    }
    
    for game in games:
        for ps in game.get("player_stats", []):
            if ps["player_id"] == player_id:
                stats = ps.get("stats", {})
                total_stats["games_played"] += 1
                total_stats["total_points"] += stats.get("points", 0)
                total_stats["total_rebounds"] += stats.get("rebounds", 0)
                total_stats["total_assists"] += stats.get("assists", 0)
                total_stats["total_steals"] += stats.get("steals", 0)
                total_stats["total_blocks"] += stats.get("blocks", 0)
                total_stats["total_turnovers"] += stats.get("turnovers", 0)
                total_stats["total_fouls"] += stats.get("fouls", 0)
                total_stats["total_fg_made"] += stats.get("fg_made", 0)
                total_stats["total_fg_attempted"] += stats.get("fg_attempted", 0)
                total_stats["total_3pt_made"] += stats.get("three_pt_made", 0)
                total_stats["total_3pt_attempted"] += stats.get("three_pt_attempted", 0)
                total_stats["total_ft_made"] += stats.get("ft_made", 0)
                total_stats["total_ft_attempted"] += stats.get("ft_attempted", 0)
                total_stats["total_minutes"] += stats.get("minutes_played", 0)
                
                total_stats["game_history"].append({
                    "game_id": game["id"],
                    "date": game["game_date"],
                    "opponent": game["opponent_name"],
                    "stats": stats
                })
                break
    
    # Calculate averages
    gp = total_stats["games_played"] or 1
    total_stats["averages"] = {
        "ppg": round(total_stats["total_points"] / gp, 1),
        "rpg": round(total_stats["total_rebounds"] / gp, 1),
        "apg": round(total_stats["total_assists"] / gp, 1),
        "spg": round(total_stats["total_steals"] / gp, 1),
        "bpg": round(total_stats["total_blocks"] / gp, 1),
        "fg_pct": round(total_stats["total_fg_made"] / max(total_stats["total_fg_attempted"], 1) * 100, 1),
        "three_pt_pct": round(total_stats["total_3pt_made"] / max(total_stats["total_3pt_attempted"], 1) * 100, 1),
        "ft_pct": round(total_stats["total_ft_made"] / max(total_stats["total_ft_attempted"], 1) * 100, 1)
    }
    
    return total_stats

# ==================== SUBSCRIPTION ROUTES ====================

SUBSCRIPTION_PRICES = {
    "pro_monthly": {"amount": 599, "name": "Pro Monthly", "interval": "month", "tier": "pro"},
    "pro_yearly": {"amount": 5999, "name": "Pro Yearly", "interval": "year", "tier": "pro"},
    "team_monthly": {"amount": 1699, "name": "Team Monthly", "interval": "month", "tier": "team"},
    "team_yearly": {"amount": 15999, "name": "Team Yearly", "interval": "year", "tier": "team"}
}

@api_router.get("/subscriptions/prices")
async def get_subscription_prices():
    """Get all subscription pricing options"""
    return {
        "pro": {
            "monthly": {"price": 5.99, "yearly_total": 69.99, "price_id": "pro_monthly", "savings": None},
            "yearly": {"price": 59.99, "price_id": "pro_yearly", "savings": "Save $10"}
        },
        "team": {
            "monthly": {"price": 16.99, "yearly_total": 199.99, "price_id": "team_monthly", "savings": None},
            "yearly": {"price": 159.99, "price_id": "team_yearly", "savings": "Save $40"}
        }
    }

@api_router.post("/subscriptions/create-checkout")
async def create_checkout_session(sub_data: SubscriptionCreate, user: dict = Depends(get_current_user)):
    """Create Stripe checkout session for subscription"""
    # Build price key from tier and billing period
    price_key = f"{sub_data.tier}_{sub_data.billing_period}"
    
    if price_key not in SUBSCRIPTION_PRICES:
        raise HTTPException(status_code=400, detail="Invalid subscription tier or billing period")
    
    price_info = SUBSCRIPTION_PRICES[price_key]
    
    try:
        # Create or get Stripe customer
        customer_id = user.get("stripe_customer_id")
        if not customer_id:
            customer = stripe.Customer.create(
                email=user["email"],
                metadata={"user_id": user["id"]}
            )
            customer_id = customer.id
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"stripe_customer_id": customer_id}}
            )
        
        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "unit_amount": price_info["amount"],
                    "product_data": {
                        "name": f"CourtClock {price_info['name']} Subscription"
                    },
                    "recurring": {"interval": price_info["interval"]}
                },
                "quantity": 1
            }],
            mode="subscription",
            success_url=f"{os.environ.get('FRONTEND_URL', 'http://localhost:8081')}/subscription-success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{os.environ.get('FRONTEND_URL', 'http://localhost:8081')}/subscription-cancel",
            metadata={"user_id": user["id"], "tier": price_info["tier"], "billing_period": sub_data.billing_period}
        )
        
        return {"checkout_url": session.url, "session_id": session.id}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/subscriptions/webhook")
async def stripe_webhook(request_body: dict):
    """Handle Stripe webhook events for subscription changes"""
    event_type = request_body.get("type")
    data = request_body.get("data", {}).get("object", {})
    
    logger.info(f"Stripe webhook received: {event_type}")
    
    if event_type == "checkout.session.completed":
        # New subscription purchase
        user_id = data.get("metadata", {}).get("user_id")
        tier = data.get("metadata", {}).get("tier")
        billing_period = data.get("metadata", {}).get("billing_period", "yearly")
        subscription_id = data.get("subscription")
        
        if user_id and tier:
            # Set expiration based on billing period
            if billing_period == "monthly":
                expires = datetime.utcnow() + timedelta(days=30)
            else:
                expires = datetime.utcnow() + timedelta(days=365)
            
            await db.users.update_one(
                {"id": user_id},
                {"$set": {
                    "subscription_tier": tier,
                    "subscription_expires": expires,
                    "stripe_subscription_id": subscription_id,
                    "subscription_status": "active",
                    "billing_period": billing_period
                }}
            )
            logger.info(f"User {user_id} subscribed to {tier} ({billing_period})")
    
    elif event_type == "customer.subscription.updated":
        # Subscription upgraded, downgraded, or modified
        subscription_id = data.get("id")
        status = data.get("status")  # active, past_due, canceled, etc.
        
        # Find user by subscription ID
        user = await db.users.find_one({"stripe_subscription_id": subscription_id})
        if user:
            # Get the new price/tier from the subscription items
            items = data.get("items", {}).get("data", [])
            new_tier = "free"
            
            if items and status == "active":
                price_id = items[0].get("price", {}).get("id")
                # Map price ID to tier (you'd configure these in your Stripe dashboard)
                price_to_tier = {
                    os.environ.get("STRIPE_PRO_PRICE_ID", "price_pro"): "pro",
                    os.environ.get("STRIPE_TEAM_PRICE_ID", "price_team"): "team",
                }
                new_tier = price_to_tier.get(price_id, "pro")
            
            # Handle different subscription statuses
            if status == "active":
                # Get period end for expiration
                period_end = data.get("current_period_end")
                expires = datetime.fromtimestamp(period_end) if period_end else datetime.utcnow() + timedelta(days=30)
                
                await db.users.update_one(
                    {"id": user["id"]},
                    {"$set": {
                        "subscription_tier": new_tier,
                        "subscription_expires": expires,
                        "subscription_status": "active"
                    }}
                )
                logger.info(f"User {user['id']} subscription updated to {new_tier}")
                
            elif status in ["past_due", "unpaid"]:
                # Payment failed but subscription not yet canceled
                await db.users.update_one(
                    {"id": user["id"]},
                    {"$set": {"subscription_status": status}}
                )
                logger.warning(f"User {user['id']} subscription payment issue: {status}")
                
            elif status == "canceled":
                # Subscription canceled - downgrade to free
                await db.users.update_one(
                    {"id": user["id"]},
                    {"$set": {
                        "subscription_tier": "free",
                        "subscription_expires": None,
                        "subscription_status": "canceled"
                    }}
                )
                logger.info(f"User {user['id']} subscription canceled, downgraded to free")
    
    elif event_type == "customer.subscription.deleted":
        # Subscription fully deleted/expired - downgrade to free
        subscription_id = data.get("id")
        
        user = await db.users.find_one({"stripe_subscription_id": subscription_id})
        if user:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {
                    "subscription_tier": "free",
                    "subscription_expires": None,
                    "subscription_status": "expired",
                    "stripe_subscription_id": None
                }}
            )
            logger.info(f"User {user['id']} subscription deleted, downgraded to free")
    
    elif event_type == "invoice.payment_failed":
        # Payment failed
        subscription_id = data.get("subscription")
        
        user = await db.users.find_one({"stripe_subscription_id": subscription_id})
        if user:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"subscription_status": "payment_failed"}}
            )
            logger.warning(f"User {user['id']} payment failed")
    
    elif event_type == "invoice.paid":
        # Payment succeeded - ensure subscription is active
        subscription_id = data.get("subscription")
        
        user = await db.users.find_one({"stripe_subscription_id": subscription_id})
        if user:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"subscription_status": "active"}}
            )
            logger.info(f"User {user['id']} payment succeeded")
    
    return {"status": "ok"}

@api_router.get("/subscriptions/status")
async def get_subscription_status(user: dict = Depends(get_current_user)):
    """Get current subscription status with feature access info"""
    user_tier = user.get("subscription_tier", "free")
    sub_status = user.get("subscription_status", "active")
    expires = user.get("subscription_expires")
    
    # Check if actually active
    is_active = check_subscription(user, user_tier)
    effective_tier = user_tier if is_active else "free"
    
    # Master admin gets full access
    if is_master_admin(user):
        effective_tier = "team"
        is_active = True
    
    # Define features by tier
    tier_features = {
        "free": {
            "max_games_visible": 2,
            "ai_summaries": False,
            "edit_completed_games": False,
            "teams": False,
            "export_pdf": False,
            "live_sharing": False,
            "season_stats": False,
        },
        "pro": {
            "max_games_visible": -1,  # unlimited
            "ai_summaries": True,
            "edit_completed_games": True,
            "teams": False,
            "export_pdf": True,
            "live_sharing": True,
            "season_stats": True,
        },
        "team": {
            "max_games_visible": -1,
            "ai_summaries": True,
            "edit_completed_games": True,
            "teams": True,
            "export_pdf": True,
            "live_sharing": True,
            "season_stats": True,
        },
    }
    
    return {
        "tier": user_tier,
        "effective_tier": effective_tier,
        "status": sub_status if not is_master_admin(user) else "master",
        "expires": expires,
        "is_active": is_active,
        "is_master": is_master_admin(user),
        "billing_period": user.get("billing_period", "yearly"),
        "features": tier_features.get(effective_tier, tier_features["free"]),
        "stripe_subscription_id": user.get("stripe_subscription_id"),
    }

@api_router.post("/subscriptions/cancel")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    """Cancel the user's subscription"""
    subscription_id = user.get("stripe_subscription_id")
    
    if not subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription found")
    
    try:
        # Cancel in Stripe (at period end to let them use remaining time)
        if stripe.api_key:
            stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True
            )
        
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"subscription_status": "canceling"}}
        )
        
        return {"message": "Subscription will be canceled at the end of the billing period"}
    except Exception as e:
        logger.error(f"Failed to cancel subscription: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel subscription")

@api_router.post("/subscriptions/reactivate")
async def reactivate_subscription(user: dict = Depends(get_current_user)):
    """Reactivate a canceled subscription before it expires"""
    subscription_id = user.get("stripe_subscription_id")
    
    if not subscription_id:
        raise HTTPException(status_code=400, detail="No subscription found")
    
    if user.get("subscription_status") != "canceling":
        raise HTTPException(status_code=400, detail="Subscription is not in canceling state")
    
    try:
        if stripe.api_key:
            stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=False
            )
        
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"subscription_status": "active"}}
        )
        
        return {"message": "Subscription reactivated"}
    except Exception as e:
        logger.error(f"Failed to reactivate subscription: {e}")
        raise HTTPException(status_code=500, detail="Failed to reactivate subscription")

# For testing: manually upgrade subscription
@api_router.post("/subscriptions/test-upgrade")
async def test_upgrade_subscription(tier: str, user: dict = Depends(get_current_user)):
    """Test endpoint to upgrade subscription (for development only)"""
    if tier not in ["free", "pro", "team"]:
        raise HTTPException(status_code=400, detail="Invalid tier")
    
    expires = datetime.utcnow() + timedelta(days=365) if tier != "free" else None
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "subscription_tier": tier,
            "subscription_expires": expires
        }}
    )
    
    return {"message": f"Upgraded to {tier}", "expires": expires}

# ==================== MEDIA UPLOAD ====================

class MediaUploadResponse(BaseModel):
    id: str
    url: str
    type: str
    filename: str

@api_router.post("/media/upload", response_model=MediaUploadResponse)
async def upload_media(
    file: UploadFile = File(...),
    game_id: str = Form(...),
    media_type: str = Form(...),
    user: dict = Depends(get_current_user)
):
    """Upload media file (photo or video) and return URL"""
    # Validate game belongs to user
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Generate unique filename
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else ('mp4' if media_type == 'video' else 'jpg')
    media_id = str(uuid.uuid4())
    filename = f"{media_id}.{file_ext}"
    
    # Create game-specific directory
    game_media_dir = MEDIA_DIR / game_id
    game_media_dir.mkdir(exist_ok=True)
    
    # Save file
    file_path = game_media_dir / filename
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    # Generate URL
    media_url = f"/api/media/{game_id}/{filename}"
    
    # Add media reference to game document (just the URL, not the actual data)
    media_entry = {
        "id": media_id,
        "type": media_type,
        "url": media_url,
        "filename": filename,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    await db.games.update_one(
        {"id": game_id},
        {"$push": {"media": media_entry}}
    )
    
    return MediaUploadResponse(
        id=media_id,
        url=media_url,
        type=media_type,
        filename=filename
    )

@api_router.post("/media/upload-base64")
async def upload_media_base64(
    game_id: str = Form(...),
    media_type: str = Form(...),
    data: str = Form(...),
    user: dict = Depends(get_current_user)
):
    """Upload media from base64 data (for mobile compatibility)"""
    # Validate game belongs to user
    game = await db.games.find_one({"id": game_id, "user_id": user["id"]})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Generate unique filename
    file_ext = 'mp4' if media_type == 'video' else 'jpg'
    media_id = str(uuid.uuid4())
    filename = f"{media_id}.{file_ext}"
    
    # Create game-specific directory
    game_media_dir = MEDIA_DIR / game_id
    game_media_dir.mkdir(exist_ok=True)
    
    # Decode base64 and save file
    try:
        # Remove data URI prefix if present
        if ',' in data:
            data = data.split(',')[1]
        
        file_content = base64.b64decode(data)
        file_path = game_media_dir / filename
        
        async with aiofiles.open(file_path, 'wb') as out_file:
            await out_file.write(file_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode media: {str(e)}")
    
    # Generate URL
    media_url = f"/api/media/{game_id}/{filename}"
    
    # Add media reference to game document
    media_entry = {
        "id": media_id,
        "type": media_type,
        "url": media_url,
        "filename": filename,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    await db.games.update_one(
        {"id": game_id},
        {"$push": {"media": media_entry}}
    )
    
    return {
        "id": media_id,
        "url": media_url,
        "type": media_type,
        "filename": filename
    }

@api_router.get("/media/{game_id}/{filename}")
async def get_media(game_id: str, filename: str):
    """Serve media file"""
    file_path = MEDIA_DIR / game_id / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Media not found")
    
    # Determine content type
    ext = filename.split('.')[-1].lower()
    content_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'webm': 'video/webm'
    }
    content_type = content_types.get(ext, 'application/octet-stream')
    
    return FileResponse(file_path, media_type=content_type)

# ==================== ROOT & HEALTH ====================

@api_router.get("/")
async def root():
    return {"message": "Basketball Stat Tracker API", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
