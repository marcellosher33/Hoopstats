from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'basketball_tracker')]

# Helper to convert MongoDB documents
def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable format"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
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
                result[key] = [serialize_doc(v) if isinstance(v, (dict, list)) else v for v in value]
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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
    photo: Optional[str] = None  # base64
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PlayerCreate(BaseModel):
    name: str
    number: Optional[int] = None
    position: Optional[str] = None
    team_id: Optional[str] = None
    photo: Optional[str] = None

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

def check_subscription(user: dict, required_tier: str) -> bool:
    """Check if user has required subscription tier"""
    tier_levels = {"free": 0, "pro": 1, "team": 2}
    user_tier = user.get("subscription_tier", "free")
    
    # Check if subscription is expired
    expires = user.get("subscription_expires")
    if expires and isinstance(expires, datetime) and expires < datetime.utcnow():
        return tier_levels["free"] >= tier_levels[required_tier]
    
    return tier_levels.get(user_tier, 0) >= tier_levels.get(required_tier, 0)

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
        photo=player_data.photo
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
async def update_player(player_id: str, player_data: PlayerCreate, user: dict = Depends(get_current_user)):
    result = await db.players.update_one(
        {"id": player_id, "user_id": user["id"]},
        {"$set": player_data.dict(exclude_unset=True)}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Player not found")
    return await db.players.find_one({"id": player_id})

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
    return teams

@api_router.get("/teams/{team_id}")
async def get_team(team_id: str, user: dict = Depends(get_current_user)):
    team = await db.teams.find_one({"id": team_id, "user_id": user["id"]})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team

@api_router.put("/teams/{team_id}")
async def update_team(team_id: str, team_data: TeamCreate, user: dict = Depends(get_current_user)):
    result = await db.teams.update_one(
        {"id": team_id, "user_id": user["id"]},
        {"$set": team_data.dict(exclude_unset=True)}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Team not found")
    return await db.teams.find_one({"id": team_id})

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
    
    await db.games.update_one(
        {"id": game_id, "user_id": user["id"]},
        {"$set": update_data}
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
    player_found = False
    
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
                    ps.setdefault("shots", []).append({
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
                    ps.setdefault("shots", []).append({
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
            elif stat.stat_type == "ft_missed":
                stats["ft_attempted"] = stats.get("ft_attempted", 0) + 1
            elif stat.stat_type == "miss_2":
                stats["fg_attempted"] = stats.get("fg_attempted", 0) + 1
                if stat.shot_location:
                    ps.setdefault("shots", []).append({
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
                    ps.setdefault("shots", []).append({
                        "x": stat.shot_location["x"],
                        "y": stat.shot_location["y"],
                        "made": False,
                        "shot_type": "3pt",
                        "period": current_period,
                        "timestamp": datetime.utcnow().isoformat()
                    })
            elif stat.stat_type in ["rebounds", "assists", "steals", "blocks", "turnovers", "fouls"]:
                stats[stat.stat_type] = stats.get(stat.stat_type, 0) + stat.value
            elif stat.stat_type == "plus_minus":
                stats["plus_minus"] = stats.get("plus_minus", 0) + stat.value
            elif stat.stat_type == "minutes":
                stats["minutes_played"] = stats.get("minutes_played", 0) + stat.value
            
            ps["stats"] = stats
            break
    
    if not player_found:
        raise HTTPException(status_code=404, detail="Player not in this game")
    
    # Update our_score based on points
    total_points = sum(ps.get("stats", {}).get("points", 0) for ps in player_stats)
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"player_stats": player_stats, "our_score": total_points}}
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
            elif adjustment.stat_type in ["rebounds", "assists", "steals", "blocks", "turnovers", "fouls"]:
                stats[adjustment.stat_type] = max(0, stats.get(adjustment.stat_type, 0) + adjustment.adjustment)
            
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
            elif stat_type in ["rebounds", "assists", "steals", "blocks", "turnovers", "fouls"]:
                stats[stat_type] = max(0, stats.get(stat_type, 0) - 1)
            
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
- Our Team Score: {game.get('our_score', 0)}
- Opponent ({game.get('opponent_name', 'Opponent')}): {game.get('opponent_score', 0)}
- Date: {game.get('game_date', 'Unknown')}
- Location: {game.get('location', 'Unknown')}

Player Statistics:
{chr(10).join(player_summaries)}

Notes: {game.get('notes', 'None')}

Please provide:
1. A headline summary (1 sentence)
2. Key highlights and standout performers
3. Notable statistics
4. A social media ready recap (under 280 characters)
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
    "pro": {"amount": 6999, "name": "Pro", "interval": "year"},
    "team": {"amount": 19999, "name": "Team", "interval": "year"}
}

@api_router.post("/subscriptions/create-checkout")
async def create_checkout_session(sub_data: SubscriptionCreate, user: dict = Depends(get_current_user)):
    """Create Stripe checkout session for subscription"""
    if sub_data.tier not in SUBSCRIPTION_PRICES:
        raise HTTPException(status_code=400, detail="Invalid subscription tier")
    
    price_info = SUBSCRIPTION_PRICES[sub_data.tier]
    
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
                        "name": f"Basketball Tracker {price_info['name']} Subscription"
                    },
                    "recurring": {"interval": price_info["interval"]}
                },
                "quantity": 1
            }],
            mode="subscription",
            success_url=f"{os.environ.get('FRONTEND_URL', 'http://localhost:8081')}/subscription-success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{os.environ.get('FRONTEND_URL', 'http://localhost:8081')}/subscription-cancel",
            metadata={"user_id": user["id"], "tier": sub_data.tier}
        )
        
        return {"checkout_url": session.url, "session_id": session.id}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/subscriptions/webhook")
async def stripe_webhook(request_body: dict):
    """Handle Stripe webhook events"""
    event_type = request_body.get("type")
    data = request_body.get("data", {}).get("object", {})
    
    if event_type == "checkout.session.completed":
        user_id = data.get("metadata", {}).get("user_id")
        tier = data.get("metadata", {}).get("tier")
        
        if user_id and tier:
            expires = datetime.utcnow() + timedelta(days=365)
            await db.users.update_one(
                {"id": user_id},
                {"$set": {
                    "subscription_tier": tier,
                    "subscription_expires": expires
                }}
            )
    
    return {"status": "ok"}

@api_router.get("/subscriptions/status")
async def get_subscription_status(user: dict = Depends(get_current_user)):
    """Get current subscription status"""
    return {
        "tier": user.get("subscription_tier", "free"),
        "expires": user.get("subscription_expires"),
        "is_active": check_subscription(user, user.get("subscription_tier", "free"))
    }

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
