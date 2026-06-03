from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
)

# expire_on_commit=False ZORUNLU: commit sonrası session kapansa da ORM
# attribute'larına erişim yeni sorgu tetiklemesin / detached-instance hatası vermesin.
SessionMaker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
