# models.py
from sqlalchemy import Column, Integer, String, Float, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Configurazione di SQLite (creerà un file locale 'creaturekind.db')
SQLALCHEMY_DATABASE_URL = "sqlite:///./creaturekind.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- TABELLA UTENTI ---
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    plan = Column(String, default="Observer") # Observer, Explorer, Creator
    dna_credits = Column(Integer, default=0)

# Crea le tabelle nel file fisico
Base.metadata.create_all(bind=engine)