#!/bin/bash
# AI Sales System — Setup FastAPI Backend
# Создаёт всю структуру Python-приложения

set -e

cd ~/aisales

echo "==> Создаю структуру папок..."
mkdir -p app/{core,models,schemas,routers}
touch app/__init__.py
touch app/core/__init__.py
touch app/models/__init__.py
touch app/schemas/__init__.py
touch app/routers/__init__.py

echo "==> Создаю requirements.txt..."
cat > requirements.txt << 'REQS'
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
psycopg2-binary==2.9.9
pydantic==2.9.2
pydantic-settings==2.5.2
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
python-multipart==0.0.12
redis==5.1.0
httpx==0.27.2
email-validator==2.2.0
REQS

echo "==> Создаю Dockerfile..."
cat > Dockerfile << 'DOCKERFILE'
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./app /app/app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
DOCKERFILE

echo "==> Создаю app/core/config.py..."
cat > app/core/config.py << 'CONFIG'
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "AI Sales System"
    APP_ENV: str = "production"
    DEBUG: bool = False

    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    REDIS_PASSWORD: str
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379

    @property
    def redis_url(self) -> str:
        return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
CONFIG

echo "==> Создаю app/core/database.py..."
cat > app/core/database.py << 'DATABASE'
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
DATABASE

echo "==> Создаю app/core/security.py..."
cat > app/core/security.py << 'SECURITY'
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.JWT_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
SECURITY

echo "==> Создаю app/core/deps.py..."
cat > app/core/deps.py << 'DEPS'
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    payload = decode_token(token)
    if not payload:
        raise credentials_exception

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise credentials_exception

    return user
DEPS

echo "==> Создаю app/models/user.py..."
cat > app/models/user.py << 'USER_MODEL'
from sqlalchemy import Column, String, Boolean, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    viewer = "viewer"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, name="user_role"), nullable=False, default=UserRole.viewer)
    is_active = Column(Boolean, nullable=False, default=True)
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
USER_MODEL

echo "==> Создаю app/models/client.py..."
cat > app/models/client.py << 'CLIENT_MODEL'
from sqlalchemy import Column, String, Integer, DateTime, Enum, ARRAY, Text, BigInteger, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base


class FunnelStage(str, enum.Enum):
    hello = "hello"
    discovery = "discovery"
    pitch = "pitch"
    objections = "objections"
    close = "close"
    followup = "followup"
    closed_won = "closed_won"
    closed_lost = "closed_lost"


class ClientSegment(str, enum.Enum):
    segment_a = "segment_a"
    segment_b = "segment_b"
    segment_c = "segment_c"
    unknown = "unknown"


class Client(Base):
    __tablename__ = "clients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ig_username = Column(String(255))
    ig_user_id = Column(String(100), index=True)
    tg_username = Column(String(255))
    tg_user_id = Column(BigInteger, index=True)
    phone = Column(String(50))
    email = Column(String(255))
    display_name = Column(String(255))
    segment = Column(Enum(ClientSegment, name="client_segment"), default=ClientSegment.unknown)
    funnel_stage = Column(Enum(FunnelStage, name="funnel_stage"), default=FunnelStage.hello)
    qual_score = Column(Integer, default=0)
    predicted_deal_amount = Column(Numeric(10, 2))
    source = Column(String(100))
    tags = Column(ARRAY(String), default=list)
    notes = Column(Text)
    metadata_json = Column("metadata", JSONB, default=dict)
    consent_given_at = Column(DateTime(timezone=True))
    first_contact_at = Column(DateTime(timezone=True))
    last_contact_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
CLIENT_MODEL

echo "==> Создаю app/schemas/user.py..."
cat > app/schemas/user.py << 'USER_SCHEMA'
from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: UserRole = UserRole.viewer


class UserOut(UserBase):
    id: UUID
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
USER_SCHEMA

echo "==> Создаю app/schemas/client.py..."
cat > app/schemas/client.py << 'CLIENT_SCHEMA'
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.models.client import FunnelStage, ClientSegment


class ClientBase(BaseModel):
    ig_username: Optional[str] = None
    tg_username: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None
    segment: ClientSegment = ClientSegment.unknown
    funnel_stage: FunnelStage = FunnelStage.hello
    qual_score: int = Field(default=0, ge=0, le=100)
    source: Optional[str] = None
    tags: list[str] = []
    notes: Optional[str] = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    display_name: Optional[str] = None
    segment: Optional[ClientSegment] = None
    funnel_stage: Optional[FunnelStage] = None
    qual_score: Optional[int] = None
    tags: Optional[list[str]] = None
    notes: Optional[str] = None


class ClientOut(ClientBase):
    id: UUID
    predicted_deal_amount: Optional[Decimal] = None
    first_contact_at: Optional[datetime] = None
    last_contact_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
CLIENT_SCHEMA

echo "==> Создаю app/routers/health.py..."
cat > app/routers/health.py << 'HEALTH'
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db


router = APIRouter(tags=["system"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "database": "up" if db_ok else "down",
    }
HEALTH

echo "==> Создаю app/routers/auth.py..."
cat > app/routers/auth.py << 'AUTH'
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User
from app.schemas.user import LoginRequest, TokenResponse, UserOut
from app.core.deps import get_current_user


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is disabled")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)
AUTH

echo "==> Создаю app/routers/clients.py..."
cat > app/routers/clients.py << 'CLIENTS'
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.client import Client, FunnelStage, ClientSegment
from app.schemas.client import ClientCreate, ClientUpdate, ClientOut


router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientOut])
def list_clients(
    funnel_stage: Optional[FunnelStage] = None,
    segment: Optional[ClientSegment] = None,
    min_score: Optional[int] = Query(None, ge=0, le=100),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Client)
    if funnel_stage:
        q = q.filter(Client.funnel_stage == funnel_stage)
    if segment:
        q = q.filter(Client.segment == segment)
    if min_score is not None:
        q = q.filter(Client.qual_score >= min_score)
    return q.order_by(Client.qual_score.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=ClientOut, status_code=201)
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    client = Client(**payload.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientOut)
def get_client(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: UUID,
    payload: ClientUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(client, field, value)

    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(client)
    db.commit()
    return None
CLIENTS

echo "==> Создаю app/main.py..."
cat > app/main.py << 'MAIN'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import health, auth, clients


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(clients.router)


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "status": "running"}
MAIN

echo "==> Проверяю JWT_SECRET_KEY в .env..."
if ! grep -q "JWT_SECRET_KEY" .env; then
    JWT_SECRET=$(openssl rand -hex 32)
    echo "" >> .env
    echo "JWT_SECRET_KEY=$JWT_SECRET" >> .env
    echo "    JWT_SECRET_KEY добавлен в .env"
else
    echo "    JWT_SECRET_KEY уже есть"
fi

echo "==> Добавляю сервис api в docker-compose.yml..."
if ! grep -q "  api:" docker-compose.yml; then
    # Делаем бэкап
    cp docker-compose.yml docker-compose.yml.bak
    
    # Вставляем блок api перед networks
    python3 << 'PYTHON'
with open('docker-compose.yml', 'r') as f:
    content = f.read()

api_block = '''  api:
    build: .
    container_name: aisales-api
    restart: unless-stopped
    env_file: .env
    environment:
      POSTGRES_HOST: postgres
      REDIS_HOST: redis
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "127.0.0.1:8000:8000"
    networks:
      - aisales-net

'''

content = content.replace('networks:\n  aisales-net:', api_block + 'networks:\n  aisales-net:')

with open('docker-compose.yml', 'w') as f:
    f.write(content)

print("    api сервис добавлен в docker-compose.yml")
PYTHON
else
    echo "    api сервис уже есть в docker-compose.yml"
fi

echo ""
echo "==> Все файлы созданы успешно!"
echo ""
echo "Структура:"
find app -type f -name "*.py" | sort
echo ""
echo "Следующий шаг: docker compose build api && docker compose up -d api"
