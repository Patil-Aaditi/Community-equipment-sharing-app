from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import shutil
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Add fallback values FIRST
if not os.environ.get('MONGO_URL'):
    os.environ['MONGO_URL'] = 'mongodb://localhost:27017'
if not os.environ.get('DB_NAME'):
    os.environ['DB_NAME'] = 'sharesphere'

# MongoDB connection AFTER setting defaults
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        print(f"WebSocket connected for user: {user_id}")

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            print(f"WebSocket disconnected for user: {user_id}")

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_text(json.dumps(message))
                print(f"Message sent to user {user_id}: {message}")
            except Exception as e:
                print(f"Error sending message to {user_id}: {e}")
                self.disconnect(user_id)

    async def broadcast_to_transaction(self, message: dict, transaction_id: str):
        transaction = await db.transactions.find_one({"id": transaction_id})
        if transaction:
            await self.send_personal_message(message, transaction["borrower_id"])
            await self.send_personal_message(message, transaction["owner_id"])

manager = ConnectionManager()

# Add this function after the database setup
async def test_db_connection():
    try:
        await client.admin.command('ping')
        print("MongoDB connection successful")
        try:
            collections = await db.list_collection_names()
            print(f"Available collections: {collections}")
        except Exception as e:
            print(f"Warning: Could not list collections: {e}")
            await db.test.insert_one({"test": "connection"})
            await db.test.delete_many({"test": "connection"})
            print("Database write test successful")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        logger.error(f"Database connection issue: {e}")

# Create uploads directory
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Create the main app
app = FastAPI(title="ShareSphere API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Add this immediately after app creation
@app.get("/")
async def root():
    return {"message": "ShareSphere API is running!", "status": "ok"}

# Security
security = HTTPBearer()

# Serve uploaded files
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Enums
class ItemCategory(str, Enum):
    TOOLS = "Tools"
    ELECTRONICS = "Electronics" 
    OUTDOOR = "Outdoor"
    HOME_KITCHEN = "Home & Kitchen"
    BOOKS_STATIONERY = "Books & Stationery"
    SPORTS_FITNESS = "Sports & Fitness"
    EVENT_GEAR = "Event Gear"
    MISCELLANEOUS = "Miscellaneous"

class ItemStatus(str, Enum):
    AVAILABLE = "available"
    BORROWED = "borrowed"
    UNAVAILABLE = "unavailable"

class TransactionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DELIVERED = "delivered"
    RETURNED = "returned"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class ComplaintSeverity(str, Enum):
    LIGHT = "light"      # 1/4 tokens
    MEDIUM = "medium"    # 1/3 tokens  
    HIGH = "high"        # 1/2 tokens
    SEVERE = "severe"    # full tokens

class DamageSeverity(str, Enum):
    LIGHT = "light"      # 1/4 item value in tokens
    MEDIUM = "medium"    # 1/3 item value in tokens
    HIGH = "high"        # 1/2 item value in tokens
    SEVERE = "severe"    # full item value in tokens

# Pydantic Models
class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    location: str
    phone: str  # Made mandatory

    @validator('phone')
    def validate_indian_phone(cls, v):
        if not v:
            raise ValueError('Phone number is required')
        # Indian phone number validation (10 digits, optionally with +91)
        pattern = r'^(\+91|91)?[6-9]\d{9}$'
        if not re.match(pattern, v.replace(' ', '').replace('-', '')):
            raise ValueError('Please enter a valid Indian phone number (10 digits starting with 6-9)')
        return v.replace(' ', '').replace('-', '')

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    identifier: str  # email or username
    password: str

class User(UserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tokens: int = 100  # Starting tokens
    star_rating: float = 5.0
    total_reviews: int = 0
    complaint_count: int = 0
    success_rate: float = 100.0  # Start with 100% success rate
    completed_transactions: int = 0
    failed_transactions: int = 0
    is_banned: bool = False
    pending_penalties: int = 0

class UserProfile(BaseModel):
    id: str
    username: str
    full_name: str
    location: str
    phone: str
    star_rating: float
    total_reviews: int
    complaint_count: int
    success_rate: float
    is_active: bool
    tokens: int
    is_banned: bool = False
    pending_penalties: int = 0

class ItemBase(BaseModel):
    title: str
    description: str
    category: ItemCategory
    value: float  # Max 100,000 INR
    tokens_per_day: int
    available_from: datetime
    available_until: datetime
    location: str

class ItemCreate(ItemBase):
    pass

class Item(ItemBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    status: ItemStatus = ItemStatus.AVAILABLE
    images: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_borrows: int = 0
    average_rating: float = 0.0

class ItemWithOwner(Item):
    owner: UserProfile

class TransactionBase(BaseModel):
    item_id: str
    borrower_id: str
    days_requested: int
    start_date: datetime
    end_date: datetime

class TransactionCreate(BaseModel):
    item_id: str
    start_date: datetime
    end_date: datetime

class Transaction(TransactionBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    status: TransactionStatus = TransactionStatus.PENDING
    total_tokens: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    approved_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    penalty_tokens: int = 0
    is_reviewed: bool = False
    delivery_proof_images: List[str] = []  # Before lending photos
    return_proof_images: List[str] = []    # After return photos
    owner_delivery_confirmed: bool = False
    borrower_delivery_confirmed: bool = False
    owner_return_confirmed: bool = False
    borrower_return_confirmed: bool = False
    damage_reported: bool = False
    damage_severity: Optional[DamageSeverity] = None
    damage_images: List[str] = []
    damage_penalty: int = 0

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    transaction_id: str
    sender_id: str
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Review(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    transaction_id: str
    reviewer_id: str
    reviewee_id: str
    item_id: str
    rating: int  # 1-5
    comment: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ReviewCreate(BaseModel):
    rating: int
    comment: str

class Complaint(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    transaction_id: str
    complainant_id: str
    defendant_id: str
    title: str
    description: str
    proof_images: List[str] = []
    severity: Optional[ComplaintSeverity] = None
    is_resolved: bool = False
    is_valid: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None

class ComplaintCreate(BaseModel):
    title: str
    description: str
    severity: ComplaintSeverity

class DamageReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    transaction_id: str
    reporter_id: str  # Should be owner
    severity: DamageSeverity
    description: str
    proof_images: List[str] = []
    penalty_tokens: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DamageReportCreate(BaseModel):
    severity: DamageSeverity
    description: str

class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    message: str
    type: str  # 'request', 'approval', 'delivery', 'return', 'review', 'complaint', etc.
    related_id: Optional[str] = None  # transaction_id, item_id, etc.
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PendingPenalty(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    transaction_id: str
    amount: int
    reason: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_paid: bool = False

class TokenTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: int  # positive for credit, negative for debit
    transaction_type: str  # 'earned', 'spent', 'penalty', 'refund'
    description: str
    related_transaction_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

def convert_objectid_to_str(doc):
    """Convert ObjectId fields to strings in a document"""
    if isinstance(doc, dict):
        for key, value in doc.items():
            if hasattr(value, '__class__') and value.__class__.__name__ == 'ObjectId':
                doc[key] = str(value)
            elif isinstance(value, dict):
                convert_objectid_to_str(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        convert_objectid_to_str(item)
    return doc

# Utility Functions
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except ValueError:
        return False

def create_jwt_token(user_id: str) -> str:
    payload = {
        'user_id': user_id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('user_id')
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Verify user exists and is active
        user = await db.users.find_one({"id": user_id, "is_active": True})
        if not user:
            raise HTTPException(status_code=401, detail="User not found or inactive")
        
        # Check if user is banned
        if user.get('is_banned', False):
            raise HTTPException(status_code=403, detail="Account has been banned due to multiple complaints")
        
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def calculate_tokens(tokens_per_day: int, days: int) -> int:
    """Calculate total tokens: base + (days-1) * daily_rate"""
    return tokens_per_day * days

def suggest_token_value(value: float, category: ItemCategory) -> int:
    """Auto-suggest token values based on item value and category"""
    base_percentage = {
        ItemCategory.ELECTRONICS: 0.05,  # 5% per day
        ItemCategory.TOOLS: 0.03,        # 3% per day
        ItemCategory.OUTDOOR: 0.04,      # 4% per day
        ItemCategory.HOME_KITCHEN: 0.02, # 2% per day
        ItemCategory.BOOKS_STATIONERY: 0.01, # 1% per day
        ItemCategory.SPORTS_FITNESS: 0.03,   # 3% per day
        ItemCategory.EVENT_GEAR: 0.06,       # 6% per day
        ItemCategory.MISCELLANEOUS: 0.025,  # 2.5% per day
    }
    
    percentage = base_percentage.get(category, 0.03)
    suggested = int(value * percentage)
    return max(1, min(suggested, 500))  # Min 1, Max 500 tokens per day

def calculate_damage_penalty(item_value: float, severity: DamageSeverity) -> int:
    """Calculate damage penalty based on item value and severity"""
    penalty_percentages = {
        DamageSeverity.LIGHT: 0.25,    # 1/4
        DamageSeverity.MEDIUM: 0.33,   # 1/3
        DamageSeverity.HIGH: 0.50,     # 1/2
        DamageSeverity.SEVERE: 1.0     # full value
    }
    
    percentage = penalty_percentages.get(severity, 0.25)
    penalty_amount = int(item_value * percentage)
    return max(1, penalty_amount)  # Minimum 1 token penalty

async def record_token_transaction(user_id: str, amount: int, transaction_type: str, description: str, related_transaction_id: str = None):
    """Record a token transaction"""
    token_transaction = TokenTransaction(
        user_id=user_id,
        amount=amount,
        transaction_type=transaction_type,
        description=description,
        related_transaction_id=related_transaction_id
    )
    await db.token_transactions.insert_one(token_transaction.dict())

async def apply_penalty(user_id: str, penalty_amount: int, reason: str, transaction_id: str = None):
    """Apply penalty to user - deduct immediately if possible, otherwise mark as pending"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        return False
    
    if user["tokens"] >= penalty_amount:
        # Deduct immediately
        await db.users.update_one(
            {"id": user_id},
            {
                "$inc": {"tokens": -penalty_amount},
                "$set": {"pending_penalties": user.get("pending_penalties", 0)}
            }
        )
        await record_token_transaction(user_id, -penalty_amount, "penalty", reason, transaction_id)
    else:
        # Add to pending penalties
        pending_amount = user.get("pending_penalties", 0) + penalty_amount
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"pending_penalties": pending_amount}}
        )
        
        # Record pending penalty
        pending_penalty = PendingPenalty(
            user_id=user_id,
            transaction_id=transaction_id or "",
            amount=penalty_amount,
            reason=reason
        )
        await db.pending_penalties.insert_one(pending_penalty.dict())
    
    return True

async def process_pending_penalties(user_id: str):
    """Process pending penalties when user earns tokens"""
    user = await db.users.find_one({"id": user_id})
    if not user or user.get("pending_penalties", 0) <= 0:
        return
    
    pending_penalties = await db.pending_penalties.find({"user_id": user_id, "is_paid": False}).to_list(100)
    
    for penalty in pending_penalties:
        if user["tokens"] >= penalty["amount"]:
            # Deduct penalty
            await db.users.update_one(
                {"id": user_id},
                {
                    "$inc": {
                        "tokens": -penalty["amount"],
                        "pending_penalties": -penalty["amount"]
                    }
                }
            )
            
            # Mark penalty as paid
            await db.pending_penalties.update_one(
                {"id": penalty["id"]},
                {"$set": {"is_paid": True}}
            )
            
            await record_token_transaction(user_id, -penalty["amount"], "penalty", penalty["reason"], penalty["transaction_id"])
            
            # Update user object for next iteration
            user["tokens"] -= penalty["amount"]
        else:
            break  # Not enough tokens for this penalty

# WebSocket endpoint
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received WebSocket data from {user_id}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(user_id)

# Authentication Routes
@api_router.post("/auth/register")
async def register_user(user_data: UserCreate):
    # Check if email or username already exists
    existing_user = await db.users.find_one({
        "$or": [
            {"email": user_data.email},
            {"username": user_data.username}
        ]
    })
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Email or username already exists")
    
    # Hash password and create user
    hashed_password = hash_password(user_data.password)
    user_dict = user_data.dict()
    del user_dict['password']
    
    user = User(**user_dict)
    user_doc = user.dict()
    user_doc['password_hash'] = hashed_password
    
    await db.users.insert_one(user_doc)
    
    # Create JWT token
    token = create_jwt_token(user.id)
    
    return {
        "user": UserProfile(**user.dict()),
        "token": token,
        "message": "User registered successfully"
    }

@api_router.post("/auth/login")
async def login_user(login_data: UserLogin):
    # Find user by email or username
    user = await db.users.find_one({
        "$or": [
            {"email": login_data.identifier},
            {"username": login_data.identifier}
        ],
        "is_active": True
    })
    
    if not user or not verify_password(login_data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check if user is banned
    if user.get('is_banned', False):
        raise HTTPException(status_code=403, detail="Your account has been banned due to multiple complaints. Please contact support.")
    
    # Create JWT token
    token = create_jwt_token(user['id'])
    
    return {
        "user": UserProfile(**user),
        "token": token,
        "message": "Login successful"
    }

@api_router.get("/auth/me", response_model=UserProfile)
async def get_current_user_profile(current_user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**user)

@api_router.delete("/auth/delete-account")
async def delete_account(current_user_id: str = Depends(get_current_user)):
    """Delete user account - keeps transaction history but removes items"""
    try:
        # Remove user's items first
        await db.items.delete_many({"owner_id": current_user_id})
        
        # Cancel any pending transactions for user's items
        await db.transactions.update_many(
            {"owner_id": current_user_id, "status": TransactionStatus.PENDING},
            {"$set": {"status": TransactionStatus.CANCELLED}}
        )
        
        # Mark user as inactive instead of deleting (to preserve transaction history)
        await db.users.update_one(
            {"id": current_user_id},
            {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc)}}
        )
        
        return {"message": "Account deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete account")

# Item Routes
@api_router.post("/items", response_model=Item)
async def create_item(
    title: str = Form(...),
    description: str = Form(...),
    category: ItemCategory = Form(...),
    value: float = Form(...),
    tokens_per_day: int = Form(...),
    available_from: str = Form(...),
    available_until: str = Form(...),
    location: str = Form(...),
    images: List[UploadFile] = File(...),
    current_user_id: str = Depends(get_current_user)
):
    # Validate value limit
    if value > 100000:
        raise HTTPException(status_code=400, detail="Item value cannot exceed ₹1,00,000")
    
    if len(images) < 1 or len(images) > 5:
        raise HTTPException(status_code=400, detail="Please upload 1-5 images")
    
    # Save uploaded images
    image_paths = []
    for image in images:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Only image files are allowed")
        
        file_extension = image.filename.split('.')[-1]
        filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = UPLOAD_DIR / filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        image_paths.append(f"/api/uploads/{filename}")
    
    # Parse dates
    try:
        available_from_dt = datetime.fromisoformat(available_from.replace('Z', '+00:00'))
        available_until_dt = datetime.fromisoformat(available_until.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    
    # Create item
    item_data = ItemBase(
        title=title,
        description=description,
        category=category,
        value=value,
        tokens_per_day=tokens_per_day,
        available_from=available_from_dt,
        available_until=available_until_dt,
        location=location
    )
    
    item = Item(**item_data.dict(), owner_id=current_user_id, images=image_paths)
    await db.items.insert_one(item.dict())
    
    return item

@api_router.get("/items", response_model=List[ItemWithOwner])
async def get_items(
    category: Optional[ItemCategory] = None,
    location: Optional[str] = None,
    min_tokens: Optional[int] = None,
    max_tokens: Optional[int] = None,
    available_date: Optional[str] = None,
    search: Optional[str] = None
):
    query = {"status": ItemStatus.AVAILABLE}
    
    if category:
        query["category"] = category
    if location:
        query["location"] = {"$regex": location, "$options": "i"}
    if min_tokens:
        query["tokens_per_day"] = {"$gte": min_tokens}
    if max_tokens:
        if "tokens_per_day" in query:
            query["tokens_per_day"]["$lte"] = max_tokens
        else:
            query["tokens_per_day"] = {"$lte": max_tokens}
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    if available_date:
        try:
            date_dt = datetime.fromisoformat(available_date.replace('Z', '+00:00'))
            query["available_from"] = {"$lte": date_dt}
            query["available_until"] = {"$gte": date_dt}
        except ValueError:
            pass
    
    items = await db.items.find(query).to_list(100)
    
    # Get owner info for each item
    items_with_owners = []
    for item_doc in items:
        owner = await db.users.find_one({"id": item_doc["owner_id"]})
        if owner:
            item_with_owner = ItemWithOwner(**item_doc, owner=UserProfile(**owner))
            items_with_owners.append(item_with_owner)
    
    return items_with_owners

@api_router.get("/items/{item_id}", response_model=ItemWithOwner)
async def get_item(item_id: str):
    item = await db.items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    owner = await db.users.find_one({"id": item["owner_id"]})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    return ItemWithOwner(**item, owner=UserProfile(**owner))

@api_router.get("/items/suggest-tokens/{category}")
async def suggest_tokens(category: ItemCategory, value: float):
    suggested = suggest_token_value(value, category)
    return {"suggested_tokens": suggested}

@api_router.get("/items/owner/{owner_id}", response_model=List[Item])
async def get_owner_items(owner_id: str):
    items = await db.items.find({"owner_id": owner_id}).to_list(100)
    return [Item(**item) for item in items]

@api_router.delete("/items/{item_id}")
async def delete_item(
    item_id: str,
    current_user_id: str = Depends(get_current_user)
):
    # Find the item
    item = await db.items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Check if current user is the owner
    if item["owner_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this item")
    
    # Check if item has any active transactions
    active_transactions = await db.transactions.find_one({
        "item_id": item_id,
        "status": {"$in": [TransactionStatus.PENDING, TransactionStatus.APPROVED, TransactionStatus.DELIVERED]}
    })
    
    if active_transactions:
        raise HTTPException(status_code=400, detail="Cannot delete item with active transactions")
    
    # Delete the item
    await db.items.delete_one({"id": item_id})
    
    return {"message": "Item deleted successfully"}

# Transaction Routes
@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(
    transaction_data: TransactionCreate,
    current_user_id: str = Depends(get_current_user)
):
    # Get item details
    item = await db.items.find_one({"id": transaction_data.item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if item["owner_id"] == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot borrow your own item")
    
    if item["status"] != ItemStatus.AVAILABLE:
        raise HTTPException(status_code=400, detail="Item is not available")
    
    # Parse dates and ensure they are timezone-aware
    try:
        if isinstance(transaction_data.start_date, str):
            start_date = datetime.fromisoformat(transaction_data.start_date.replace('Z', '+00:00'))
        else:
            start_date = transaction_data.start_date
        
        if isinstance(transaction_data.end_date, str):
            end_date = datetime.fromisoformat(transaction_data.end_date.replace('Z', '+00:00'))
        else:
            end_date = transaction_data.end_date
        
        # Ensure datetimes are timezone-aware
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
            
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    
    # Check if dates are valid
    if start_date >= end_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    
    if start_date < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Start date cannot be in the past")
    
    # Calculate days correctly (inclusive of both dates)
    actual_days = (end_date.date() - start_date.date()).days + 1
    # Calculate total tokens
    total_tokens = calculate_tokens(item["tokens_per_day"], actual_days)
    
    # Check if borrower has enough tokens
    borrower = await db.users.find_one({"id": current_user_id})
    if borrower["tokens"] < total_tokens:
        raise HTTPException(status_code=400, detail="Insufficient tokens")
    
    # Create transaction with correct dates
    transaction = Transaction(
        item_id=transaction_data.item_id,
        borrower_id=current_user_id,
        days_requested=actual_days,
        start_date=start_date,
        end_date=end_date,
        owner_id=item["owner_id"],
        total_tokens=total_tokens
    )
    
    # Insert transaction first
    result = await db.transactions.insert_one(transaction.dict())

    # Create notifications
    await create_notification(
        user_id=item["owner_id"],
        title="New Borrow Request",
        message=f"{borrower['full_name']} wants to borrow your {item['title']}",
        type="request",
        related_id=transaction.id
    )

    return transaction

@api_router.put("/transactions/{transaction_id}/approve")
async def approve_transaction(
    transaction_id: str,
    current_user_id: str = Depends(get_current_user)
):
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction["owner_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if transaction["status"] != TransactionStatus.PENDING:
        raise HTTPException(status_code=400, detail="Transaction cannot be approved")
    
    # Update transaction status
    await db.transactions.update_one(
        {"id": transaction_id},
        {
            "$set": {
                "status": TransactionStatus.APPROVED,
                "approved_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Update item status
    await db.items.update_one(
        {"id": transaction["item_id"]},
        {"$set": {"status": ItemStatus.BORROWED}}
    )
    
    # Get item title for notification
    item = await db.items.find_one({"id": transaction["item_id"]})
    item_title = item["title"] if item else "item"
    
    # Create notification
    await create_notification(
        user_id=transaction["borrower_id"],
        title="Request Approved!",
        message=f"Your request to borrow {item_title} has been approved. Chat with the owner to arrange delivery.",
        type="approval",
        related_id=transaction_id
    )
    
    # Send real-time notification
    await manager.send_personal_message({
        "type": "notification",
        "data": {
            "title": "Request Approved!",
            "message": f"Your request to borrow {item_title} has been approved. Chat with the owner to arrange delivery.",
            "transaction_id": transaction_id
        }
    }, transaction["borrower_id"])
    
    return {"message": "Transaction approved successfully"}

@api_router.put("/transactions/{transaction_id}/reject")
async def reject_transaction(
    transaction_id: str,
    current_user_id: str = Depends(get_current_user)
):
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction["owner_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if transaction["status"] != TransactionStatus.PENDING:
        raise HTTPException(status_code=400, detail="Transaction cannot be rejected")
    
    # Update transaction status
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {"status": TransactionStatus.CANCELLED}}
    )
    
    # Get item title for notification
    item = await db.items.find_one({"id": transaction["item_id"]})
    item_title = item["title"] if item else "item"
    
    # Create notification
    await create_notification(
        user_id=transaction["borrower_id"],
        title="Request Rejected",
        message=f"Your request to borrow {item_title} has been rejected",
        type="rejection",
        related_id=transaction_id
    )
    
    # Send real-time notification
    await manager.send_personal_message({
        "type": "notification",
        "data": {
            "title": "Request Rejected",
            "message": f"Your request to borrow {item_title} has been rejected",
            "transaction_id": transaction_id
        }
    }, transaction["borrower_id"])
    
    return {"message": "Transaction rejected successfully"}

# Delivery Confirmation Routes
@api_router.post("/transactions/{transaction_id}/confirm-delivery")
async def confirm_delivery(
    transaction_id: str,
    images: List[UploadFile] = File(...),
    current_user_id: str = Depends(get_current_user)
):
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if current_user_id not in [transaction["owner_id"], transaction["borrower_id"]]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if transaction["status"] != TransactionStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Transaction must be approved first")
    
    # Save proof images
    image_paths = []
    for image in images:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Only image files are allowed")
        
        file_extension = image.filename.split('.')[-1]
        filename = f"delivery_{transaction_id}_{uuid.uuid4()}.{file_extension}"
        file_path = UPLOAD_DIR / filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        image_paths.append(f"/api/uploads/{filename}")
    
    # Update transaction based on who is confirming
    is_owner = current_user_id == transaction["owner_id"]
    update_data = {}
    
    if is_owner:
        update_data["owner_delivery_confirmed"] = True
        update_data["delivery_proof_images"] = image_paths
    else:
        update_data["borrower_delivery_confirmed"] = True
    
    # Check if both parties have confirmed
    owner_confirmed = update_data.get("owner_delivery_confirmed", transaction.get("owner_delivery_confirmed", False))
    borrower_confirmed = update_data.get("borrower_delivery_confirmed", transaction.get("borrower_delivery_confirmed", False))
    
    if owner_confirmed and borrower_confirmed:
        update_data["status"] = TransactionStatus.DELIVERED
        update_data["delivered_at"] = datetime.now(timezone.utc)
        
        # Deduct tokens from borrower and credit to owner
        await db.users.update_one(
            {"id": transaction["borrower_id"]},
            {"$inc": {"tokens": -transaction["total_tokens"]}}
        )
        await db.users.update_one(
            {"id": transaction["owner_id"]},
            {"$inc": {"tokens": transaction["total_tokens"]}}
        )
        
        # Record token transactions
        await record_token_transaction(
            transaction["borrower_id"], 
            -transaction["total_tokens"], 
            "spent", 
            f"Borrowed {transaction['item_id']}", 
            transaction_id
        )
        await record_token_transaction(
            transaction["owner_id"], 
            transaction["total_tokens"], 
            "earned", 
            f"Lent {transaction['item_id']}", 
            transaction_id
        )
        
        # Process any pending penalties for the owner who just earned tokens
        await process_pending_penalties(transaction["owner_id"])
    
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": update_data}
    )
    
    # Create notifications
    other_user_id = transaction["borrower_id"] if is_owner else transaction["owner_id"]
    role = "owner" if is_owner else "borrower"
    
    await create_notification(
        user_id=other_user_id,
        title="Delivery Confirmation",
        message=f"The {role} has confirmed delivery. Please confirm on your end.",
        type="delivery",
        related_id=transaction_id
    )
    
    if owner_confirmed and borrower_confirmed:
        item = await db.items.find_one({"id": transaction["item_id"]})
        await create_notification(
            user_id=transaction["borrower_id"],
            title="Delivery Complete",
            message=f"Tokens deducted for borrowing {item['title']}. Enjoy!",
            type="delivery_complete",
            related_id=transaction_id
        )
        await create_notification(
            user_id=transaction["owner_id"],
            title="Delivery Complete",
            message=f"Tokens credited for lending {item['title']}.",
            type="delivery_complete",
            related_id=transaction_id
        )
    
    return {"message": "Delivery confirmation recorded successfully"}

# Return Confirmation Routes
@api_router.post("/transactions/{transaction_id}/confirm-return")
async def confirm_return(
    transaction_id: str,
    images: List[UploadFile] = File(...),
    current_user_id: str = Depends(get_current_user)
):
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if current_user_id not in [transaction["owner_id"], transaction["borrower_id"]]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if transaction["status"] != TransactionStatus.DELIVERED:
        raise HTTPException(status_code=400, detail="Item must be delivered first")
    
    # Save proof images
    image_paths = []
    for image in images:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Only image files are allowed")
        
        file_extension = image.filename.split('.')[-1]
        filename = f"return_{transaction_id}_{uuid.uuid4()}.{file_extension}"
        file_path = UPLOAD_DIR / filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        image_paths.append(f"/api/uploads/{filename}")
    
    # Update transaction based on who is confirming
    is_owner = current_user_id == transaction["owner_id"]
    update_data = {}
    
    if is_owner:
        update_data["owner_return_confirmed"] = True
    else:
        update_data["borrower_return_confirmed"] = True
        update_data["return_proof_images"] = image_paths
    
    # Check if both parties have confirmed
    owner_confirmed = update_data.get("owner_return_confirmed", transaction.get("owner_return_confirmed", False))
    borrower_confirmed = update_data.get("borrower_return_confirmed", transaction.get("borrower_return_confirmed", False))
    
    if owner_confirmed and borrower_confirmed:
        update_data["status"] = TransactionStatus.RETURNED
        update_data["returned_at"] = datetime.now(timezone.utc)
        
        # Make item available again
        await db.items.update_one(
            {"id": transaction["item_id"]},
            {"$set": {"status": ItemStatus.AVAILABLE}}
        )
        
        # Check for late return penalty
        current_time = datetime.now(timezone.utc)
        end_date = transaction["end_date"]
        if isinstance(end_date, str):
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        
        if current_time > end_date:
            # Calculate late penalty
            late_days = (current_time - end_date).days
            if late_days > 0:
                item = await db.items.find_one({"id": transaction["item_id"]})
                late_penalty = item["tokens_per_day"] * late_days
                
                await apply_penalty(
                    transaction["borrower_id"],
                    late_penalty,
                    f"Late return penalty: {late_days} days late",
                    transaction_id
                )
                
                update_data["penalty_tokens"] = late_penalty
                
                await create_notification(
                    user_id=transaction["borrower_id"],
                    title="Late Return Penalty",
                    message=f"Penalty of {late_penalty} tokens applied for returning {item['title']} {late_days} days late",
                    type="penalty",
                    related_id=transaction_id
                )
    
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": update_data}
    )
    
    # Create notifications
    other_user_id = transaction["borrower_id"] if is_owner else transaction["owner_id"]
    role = "owner" if is_owner else "borrower"
    
    await create_notification(
        user_id=other_user_id,
        title="Return Confirmation",
        message=f"The {role} has confirmed return. Please confirm on your end.",
        type="return",
        related_id=transaction_id
    )
    
    if owner_confirmed and borrower_confirmed:
        item = await db.items.find_one({"id": transaction["item_id"]})
        await create_notification(
            user_id=transaction["borrower_id"],
            title="Return Complete",
            message=f"Successfully returned {item['title']}. Please leave a review!",
            type="return_complete",
            related_id=transaction_id
        )
        await create_notification(
            user_id=transaction["owner_id"],
            title="Return Complete",
            message=f"{item['title']} has been returned. Please leave a review!",
            type="return_complete",
            related_id=transaction_id
        )
    
    return {"message": "Return confirmation recorded successfully"}

# Damage Report Routes
@api_router.post("/transactions/{transaction_id}/report-damage")
async def report_damage(
    transaction_id: str,
    severity: DamageSeverity = Form(...),
    description: str = Form(...),
    images: List[UploadFile] = File(...),
    current_user_id: str = Depends(get_current_user)
):
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only owner can report damage
    if transaction["owner_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Only item owner can report damage")
    
    if transaction["status"] not in [TransactionStatus.RETURNED, TransactionStatus.DELIVERED]:
        raise HTTPException(status_code=400, detail="Can only report damage after delivery")
    
    # Save damage proof images
    image_paths = []
    for image in images:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Only image files are allowed")
        
        file_extension = image.filename.split('.')[-1]
        filename = f"damage_{transaction_id}_{uuid.uuid4()}.{file_extension}"
        file_path = UPLOAD_DIR / filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        image_paths.append(f"/api/uploads/{filename}")
    
    # Get item value for penalty calculation
    item = await db.items.find_one({"id": transaction["item_id"]})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Calculate damage penalty
    penalty_amount = calculate_damage_penalty(item["value"], severity)
    
    # Apply penalty to borrower
    await apply_penalty(
        transaction["borrower_id"],
        penalty_amount,
        f"Damage penalty for {item['title']}: {severity.value} damage",
        transaction_id
    )
    
    # Update transaction with damage info
    await db.transactions.update_one(
        {"id": transaction_id},
        {
            "$set": {
                "damage_reported": True,
                "damage_severity": severity,
                "damage_images": image_paths,
                "damage_penalty": penalty_amount
            }
        }
    )
    
    # Create damage report record
    damage_report = DamageReport(
        transaction_id=transaction_id,
        reporter_id=current_user_id,
        severity=severity,
        description=description,
        proof_images=image_paths,
        penalty_tokens=penalty_amount
    )
    await db.damage_reports.insert_one(damage_report.dict())
    
    # Create notifications
    await create_notification(
        user_id=transaction["borrower_id"],
        title="Damage Reported",
        message=f"Damage reported on {item['title']}. Penalty: {penalty_amount} tokens",
        type="damage",
        related_id=transaction_id
    )
    
    return {
        "message": "Damage reported successfully",
        "penalty_amount": penalty_amount,
        "severity": severity
    }

@api_router.get("/transactions", response_model=List[Dict[str, Any]])
async def get_user_transactions(current_user_id: str = Depends(get_current_user)):
    transactions = await db.transactions.find({
        "$or": [
            {"owner_id": current_user_id},
            {"borrower_id": current_user_id}
        ]
    }).sort("created_at", -1).to_list(100)
    
    # Get additional details for each transaction
    enhanced_transactions = []
    for transaction in transactions:
        # Convert ObjectId to string
        if "_id" in transaction:
            transaction["_id"] = str(transaction["_id"])
            
        item = await db.items.find_one({"id": transaction["item_id"]})
        if item and "_id" in item:
            item["_id"] = str(item["_id"])
            
        borrower = await db.users.find_one({"id": transaction["borrower_id"]})
        if borrower and "_id" in borrower:
            borrower["_id"] = str(borrower["_id"])
            
        owner = await db.users.find_one({"id": transaction["owner_id"]})
        if owner and "_id" in owner:
            owner["_id"] = str(owner["_id"])
        
        # Create enhanced transaction
        enhanced_transaction = {
            **transaction,
            "item": item,
            "borrower": UserProfile(**borrower) if borrower else None,
            "owner": UserProfile(**owner) if owner else None,
            "is_borrower": transaction["borrower_id"] == current_user_id
        }
        
        enhanced_transactions.append(enhanced_transaction)
    
    return enhanced_transactions

# Chat Routes - FIXED IMPLEMENTATION
@api_router.post("/chat/{transaction_id}/messages")
async def send_message(
    transaction_id: str,
    message: str = Form(...),
    current_user_id: str = Depends(get_current_user)
):
    print(f"Attempting to send message in transaction {transaction_id} from user {current_user_id}")
    
    # Verify user is part of this transaction
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        print(f"Transaction {transaction_id} not found")
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if current_user_id not in [transaction["borrower_id"], transaction["owner_id"]]:
        print(f"User {current_user_id} not authorized for transaction {transaction_id}")
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if transaction is approved
    if transaction["status"] != TransactionStatus.APPROVED:
        print(f"Transaction {transaction_id} not approved, status: {transaction['status']}")
        raise HTTPException(status_code=400, detail="Chat only available after request approval")
    
    # Create message
    chat_message = ChatMessage(
        transaction_id=transaction_id,
        sender_id=current_user_id,
        message=message.strip()
    )
    
    print(f"Creating message: {chat_message.dict()}")
    
    try:
        # Insert message into database
        result = await db.chat_messages.insert_one(chat_message.dict())
        print(f"Message inserted with result: {result}")
        
        # Get sender info
        sender = await db.users.find_one({"id": current_user_id})
        if not sender:
            raise HTTPException(status_code=404, detail="Sender not found")
        
        # Get item info for notification
        item = await db.items.find_one({"id": transaction["item_id"]})
        item_title = item["title"] if item else "item"
        
        # Determine recipient
        other_user_id = transaction["owner_id"] if current_user_id == transaction["borrower_id"] else transaction["borrower_id"]
        
        # Create notification for the other party
        await create_notification(
            user_id=other_user_id,
            title="New Message",
            message=f"{sender['full_name']} sent a message about {item_title}",
            type="message",
            related_id=transaction_id
        )
        
        # Send real-time message via WebSocket
        await manager.send_personal_message({
            "type": "new_message",
            "data": {
                "transaction_id": transaction_id,
                "message": chat_message.dict(),
                "sender": UserProfile(**sender).dict()
            }
        }, other_user_id)
        
        print(f"Message sent successfully to user {other_user_id}")
        
        return {
            **chat_message.dict(),
            "sender": UserProfile(**sender).dict()
        }
        
    except Exception as e:
        print(f"Error sending message: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(e)}")

@api_router.get("/chat/{transaction_id}/messages", response_model=List[Dict[str, Any]])
async def get_messages(
    transaction_id: str,
    current_user_id: str = Depends(get_current_user)
):
    # Verify user is part of this transaction
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if current_user_id not in [transaction["borrower_id"], transaction["owner_id"]]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get messages
    messages = await db.chat_messages.find({"transaction_id": transaction_id}).sort("timestamp", 1).to_list(100)
    
    # Enhance with sender info
    enhanced_messages = []
    for message in messages:
        # Convert ObjectId to string
        if "_id" in message:
            message["_id"] = str(message["_id"])
        
        sender = await db.users.find_one({"id": message["sender_id"]})
        if sender and "_id" in sender:
            sender["_id"] = str(sender["_id"])
        
        enhanced_message = {
            **message,
            "sender": UserProfile(**sender) if sender else None
        }
        enhanced_messages.append(enhanced_message)
    
    return enhanced_messages

# Review Routes
@api_router.post("/transactions/{transaction_id}/review")
async def create_review(
    transaction_id: str,
    review_data: ReviewCreate,
    current_user_id: str = Depends(get_current_user)
):
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if current_user_id not in [transaction["owner_id"], transaction["borrower_id"]]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if transaction["status"] != TransactionStatus.RETURNED:
        raise HTTPException(status_code=400, detail="Can only review after transaction is returned")
    
    # Check if user already reviewed this transaction
    existing_review = await db.reviews.find_one({
        "transaction_id": transaction_id,
        "reviewer_id": current_user_id
    })
    if existing_review:
        raise HTTPException(status_code=400, detail="You have already reviewed this transaction")
    
    # Determine reviewee
    reviewee_id = transaction["owner_id"] if current_user_id == transaction["borrower_id"] else transaction["borrower_id"]
    
    # Create review
    review = Review(
        transaction_id=transaction_id,
        reviewer_id=current_user_id,
        reviewee_id=reviewee_id,
        item_id=transaction["item_id"],
        rating=review_data.rating,
        comment=review_data.comment
    )
    
    await db.reviews.insert_one(review.dict())
    
    # Update reviewee's rating
    user_reviews = await db.reviews.find({"reviewee_id": reviewee_id}).to_list(1000)
    if user_reviews:
        total_rating = sum(r["rating"] for r in user_reviews)
        average_rating = total_rating / len(user_reviews)
        
        await db.users.update_one(
            {"id": reviewee_id},
            {
                "$set": {
                    "star_rating": average_rating,
                    "total_reviews": len(user_reviews)
                }
            }
        )
    
    # Check if both parties have reviewed
    review_count = await db.reviews.count_documents({"transaction_id": transaction_id})
    if review_count == 2:
        await db.transactions.update_one(
            {"id": transaction_id},
            {"$set": {"status": TransactionStatus.COMPLETED, "is_reviewed": True}}
        )
        
        # Update success rate for both users
        for user_id in [transaction["owner_id"], transaction["borrower_id"]]:
            user_transactions = await db.transactions.find({
                "$or": [{"owner_id": user_id}, {"borrower_id": user_id}],
                "status": {"$in": [TransactionStatus.COMPLETED, TransactionStatus.CANCELLED]}
            }).to_list(1000)
            
            completed_count = len([t for t in user_transactions if t["status"] == TransactionStatus.COMPLETED])
            total_count = len(user_transactions)
            success_rate = (completed_count / total_count * 100) if total_count > 0 else 100
            
            await db.users.update_one(
                {"id": user_id},
                {
                    "$set": {
                        "success_rate": success_rate,
                        "completed_transactions": completed_count,
                        "failed_transactions": total_count - completed_count
                    }
                }
            )
    
    return {"message": "Review submitted successfully"}

@api_router.get("/reviews/{user_id}")
async def get_user_reviews(user_id: str):
    reviews = await db.reviews.find({"reviewee_id": user_id}).sort("created_at", -1).to_list(50)
    
    enhanced_reviews = []
    for review in reviews:
        if "_id" in review:
            review["_id"] = str(review["_id"])
        
        reviewer = await db.users.find_one({"id": review["reviewer_id"]})
        item = await db.items.find_one({"id": review["item_id"]})
        
        enhanced_review = {
            **review,
            "reviewer": UserProfile(**reviewer) if reviewer else None,
            "item_title": item["title"] if item else "Unknown Item"
        }
        enhanced_reviews.append(enhanced_review)
    
    return enhanced_reviews

# Complaint Routes
@api_router.post("/transactions/{transaction_id}/complaint")
async def create_complaint(
    transaction_id: str,
    complaint_data: ComplaintCreate,
    images: List[UploadFile] = File(...),
    current_user_id: str = Depends(get_current_user)
):
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if current_user_id not in [transaction["owner_id"], transaction["borrower_id"]]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Save proof images
    image_paths = []
    for image in images:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Only image files are allowed")
        
        file_extension = image.filename.split('.')[-1]
        filename = f"complaint_{transaction_id}_{uuid.uuid4()}.{file_extension}"
        file_path = UPLOAD_DIR / filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        image_paths.append(f"/api/uploads/{filename}")
    
    # Determine defendant
    defendant_id = transaction["owner_id"] if current_user_id == transaction["borrower_id"] else transaction["borrower_id"]
    
    # Create complaint
    complaint = Complaint(
        transaction_id=transaction_id,
        complainant_id=current_user_id,
        defendant_id=defendant_id,
        title=complaint_data.title,
        description=complaint_data.description,
        proof_images=image_paths,
        severity=complaint_data.severity,
        is_valid=True  # Auto-validate for now, could add admin review later
    )
    
    await db.complaints.insert_one(complaint.dict())
    
    # If complaint is valid, apply penalties
    if complaint.is_valid:
        defendant = await db.users.find_one({"id": defendant_id})
        if defendant:
            # Halve the star rating
            new_rating = defendant["star_rating"] / 2
            complaint_count = defendant.get("complaint_count", 0) + 1
            
            # Check if user should be banned (20+ valid complaints)
            should_ban = complaint_count >= 20
            
            await db.users.update_one(
                {"id": defendant_id},
                {
                    "$set": {
                        "star_rating": new_rating,
                        "complaint_count": complaint_count,
                        "is_banned": should_ban
                    }
                }
            )
            
            # Create notifications
            await create_notification(
                user_id=defendant_id,
                title="Complaint Filed Against You",
                message=f"A complaint has been filed against you. Your rating has been affected.",
                type="complaint",
                related_id=transaction_id
            )
            
            if should_ban:
                await create_notification(
                    user_id=defendant_id,
                    title="Account Banned",
                    message="Your account has been banned due to multiple complaints. Contact support for assistance.",
                    type="ban",
                    related_id=None
                )
    
    return {"message": "Complaint filed successfully"}

@api_router.get("/complaints/{user_id}")
async def get_user_complaints(user_id: str):
    complaints = await db.complaints.find({"defendant_id": user_id}).sort("created_at", -1).to_list(50)
    
    enhanced_complaints = []
    for complaint in complaints:
        if "_id" in complaint:
            complaint["_id"] = str(complaint["_id"])
        
        complainant = await db.users.find_one({"id": complaint["complainant_id"]})
        
        enhanced_complaint = {
            **complaint,
            "complainant": UserProfile(**complainant) if complainant else None
        }
        enhanced_complaints.append(enhanced_complaint)
    
    return enhanced_complaints

@api_router.get("/complaints")
async def get_my_complaints(current_user_id: str = Depends(get_current_user)):
    # Get complaints filed by user
    filed_complaints = await db.complaints.find({"complainant_id": current_user_id}).sort("created_at", -1).to_list(50)
    
    # Get complaints against user
    against_complaints = await db.complaints.find({"defendant_id": current_user_id}).sort("created_at", -1).to_list(50)
    
    # Enhance with user info
    enhanced_filed = []
    for complaint in filed_complaints:
        if "_id" in complaint:
            complaint["_id"] = str(complaint["_id"])
        
        defendant = await db.users.find_one({"id": complaint["defendant_id"]})
        transaction = await db.transactions.find_one({"id": complaint["transaction_id"]})
        item = await db.items.find_one({"id": transaction["item_id"]}) if transaction else None
        
        enhanced_complaint = {
            **complaint,
            "defendant": UserProfile(**defendant) if defendant else None,
            "item_title": item["title"] if item else "Unknown Item"
        }
        enhanced_filed.append(enhanced_complaint)
    
    enhanced_against = []
    for complaint in against_complaints:
        if "_id" in complaint:
            complaint["_id"] = str(complaint["_id"])
        
        complainant = await db.users.find_one({"id": complaint["complainant_id"]})
        transaction = await db.transactions.find_one({"id": complaint["transaction_id"]})
        item = await db.items.find_one({"id": transaction["item_id"]}) if transaction else None
        
        enhanced_complaint = {
            **complaint,
            "complainant": UserProfile(**complainant) if complainant else None,
            "item_title": item["title"] if item else "Unknown Item"
        }
        enhanced_against.append(enhanced_complaint)
    
    return {
        "filed_by_me": enhanced_filed,
        "against_me": enhanced_against
    }

# Token Management Routes
@api_router.get("/tokens/history")
async def get_token_history(current_user_id: str = Depends(get_current_user)):
    transactions = await db.token_transactions.find({"user_id": current_user_id}).sort("created_at", -1).to_list(100)
    
    for transaction in transactions:
        if "_id" in transaction:
            transaction["_id"] = str(transaction["_id"])
    
    return transactions

@api_router.get("/tokens/pending-penalties")
async def get_pending_penalties(current_user_id: str = Depends(get_current_user)):
    penalties = await db.pending_penalties.find({"user_id": current_user_id, "is_paid": False}).sort("created_at", -1).to_list(100)
    
    for penalty in penalties:
        if "_id" in penalty:
            penalty["_id"] = str(penalty["_id"])
    
    return penalties

@api_router.post("/tokens/pay-penalty")
async def pay_pending_penalty(
    penalty_id: str,
    current_user_id: str = Depends(get_current_user)
):
    penalty = await db.pending_penalties.find_one({"id": penalty_id, "user_id": current_user_id, "is_paid": False})
    if not penalty:
        raise HTTPException(status_code=404, detail="Penalty not found")
    
    user = await db.users.find_one({"id": current_user_id})
    if user["tokens"] < penalty["amount"]:
        raise HTTPException(status_code=400, detail="Insufficient tokens to pay penalty")
    
    # Deduct tokens and mark penalty as paid
    await db.users.update_one(
        {"id": current_user_id},
        {
            "$inc": {
                "tokens": -penalty["amount"],
                "pending_penalties": -penalty["amount"]
            }
        }
    )
    
    await db.pending_penalties.update_one(
        {"id": penalty_id},
        {"$set": {"is_paid": True}}
    )
    
    await record_token_transaction(current_user_id, -penalty["amount"], "penalty", penalty["reason"], penalty["transaction_id"])
    
    return {"message": "Penalty paid successfully"}

# Helper Functions
async def create_notification(user_id: str, title: str, message: str, type: str, related_id: str = None):
    """Create a notification for a user"""
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        related_id=related_id
    )
    result = await db.notifications.insert_one(notification.dict())
    
    # Send real-time notification
    await manager.send_personal_message({
        "type": "notification",
        "data": notification.dict()
    }, user_id)
    
    return result

# Dashboard and Stats
@api_router.get("/dashboard")
async def get_dashboard(current_user_id: str = Depends(get_current_user)):
    try:
        user = await db.users.find_one({"id": current_user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get user's items with error handling
        try:
            user_items = await db.items.find({"owner_id": current_user_id}).to_list(100)
            # Convert ObjectId to string
            for item in user_items:
                if "_id" in item:
                    item["_id"] = str(item["_id"])
        except Exception as e:
            logger.error(f"Error fetching user items: {e}")
            user_items = []

        # Get recent transactions with error handling
        try:
            recent_transactions = await db.transactions.find({
                "$or": [
                    {"owner_id": current_user_id},
                    {"borrower_id": current_user_id}
                ]
            }).sort("created_at", -1).to_list(10)
            # Convert ObjectId to string
            for transaction in recent_transactions:
                if "_id" in transaction:
                    transaction["_id"] = str(transaction["_id"])
        except Exception as e:
            logger.error(f"Error fetching transactions: {e}")
            recent_transactions = []
        
        # Get counts with error handling
        try:
            unread_notifications = await db.notifications.count_documents({
                "user_id": current_user_id,
                "is_read": False
            })
        except Exception as e:
            logger.error(f"Error counting notifications: {e}")
            unread_notifications = 0
        
        try:
            pending_requests = await db.transactions.count_documents({
                "owner_id": current_user_id,
                "status": TransactionStatus.PENDING
            })
        except Exception as e:
            logger.error(f"Error counting pending requests: {e}")
            pending_requests = 0
        
        try:
            active_members_count = await db.users.count_documents({"is_active": True})
        except Exception as e:
            logger.error(f"Error counting active members: {e}")
            active_members_count = 0

        return {
            "user": UserProfile(**user),
            "user_items_count": len(user_items),
            "recent_transactions": recent_transactions,  
            "unread_notifications": unread_notifications,
            "pending_requests": pending_requests,
            "active_members": active_members_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Notification Routes
@api_router.get("/notifications", response_model=List[Dict[str, Any]])
async def get_notifications(current_user_id: str = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {"user_id": current_user_id}
    ).sort("created_at", -1).to_list(50)
    
    # Convert ObjectId to string for each notification
    for notification in notifications:
        if "_id" in notification:
            notification["_id"] = str(notification["_id"])
    
    return notifications

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user_id: str = Depends(get_current_user)
):
    await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user_id},
        {"$set": {"is_read": True}}
    )
    return {"message": "Notification marked as read"}

@api_router.delete("/notifications/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user_id: str = Depends(get_current_user)
):
    await db.notifications.delete_one({"id": notification_id, "user_id": current_user_id})
    return {"message": "Notification deleted successfully"}

@api_router.put("/notifications/mark-all-read")
async def mark_all_notifications_read(current_user_id: str = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": current_user_id, "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"message": "All notifications marked as read"}

# Feedback Route
@api_router.post("/feedback")
async def submit_feedback(
    title: str = Form(...),
    message: str = Form(...),
    current_user_id: str = Depends(get_current_user)
):
    feedback = {
        "id": str(uuid.uuid4()),
        "user_id": current_user_id,
        "title": title,
        "message": message,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.feedback.insert_one(feedback)
    return {"message": "Feedback submitted successfully"}

# Basic status check endpoint (keeping for testing)
@api_router.get("/")
async def root():
    return {"message": "ShareSphere API is running!"}

@api_router.get("/health")
async def health_check():
    try:
        # Test database connection
        await client.admin.command('ping')
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {str(e)}")

@api_router.get("/test")
async def test_endpoint():
    return {"status": "ok", "message": "API is reachable", "timestamp": datetime.now(timezone.utc)}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # Be more specific
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add this to startup
@app.on_event("startup")
async def startup_db_client():
    await test_db_connection()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()