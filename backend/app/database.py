import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

# Load variables from .env file
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def create_db_engine(url: str):
    """Docker runs on PostgreSQL and needs nothing special. The portable
    Windows build runs on SQLite (one file, no database server to install),
    which needs three adjustments to behave like PostgreSQL here:

    * check_same_thread=False: FastAPI serves requests from a thread pool, and
      SQLite refuses a connection used from a thread other than the one that
      opened it.
    * foreign_keys=ON: PostgreSQL always enforces foreign keys; SQLite only
      does when asked, per connection.
    * busy_timeout: wait instead of failing if a second request arrives while
      one is writing.
    """
    if not url.startswith("sqlite"):
        return create_engine(url)

    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=10000")
        cursor.close()

    return engine


if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Set it in the environment or in a .env file, "
        "e.g. postgresql://user:password@localhost:5432/taskalign"
    )

# Create the SQLAlchemy engine
engine = create_db_engine(DATABASE_URL)

# Create a SessionLocal class for database operations
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for our database models to inherit from
Base = declarative_base()

# Dependency to get the DB session in FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()