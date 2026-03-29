# models.py
from sqlalchemy import Column, Integer, String, Float, create_engine, ForeignKey, Text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import json

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
    plan = Column(String, default="Explorer") 
    dna_credits = Column(Integer, default=500)
    
    # Un utente può scoprire molte specie!
    discoveries = relationship("DiscoveredSpecies", back_populates="discoverer")

# --- NUOVA TABELLA: IL CODEX (BESTIARIO) ---
class DiscoveredSpecies(Base):
    __tablename__ = "discovered_species"

    id = Column(Integer, primary_key=True, index=True)
    species_name = Column(String, unique=True, index=True) # Es: "Reaper-X"
    type = Column(String) # "Predatore", "Erbivoro", "Spazzino" (Calcolato in base ai pixel)
    desc = Column(Text) # La storia generata automaticamente
    
    # Statistiche al momento della cattura
    generation_found = Column(Integer)
    fitness_score = Column(Float)
    speed = Column(String)
    diet = Column(String)
    
    # Dati grezzi in formato JSON Testuale (per poterli ridisegnare su Angular!)
    morphology_json = Column(Text) 
    brain_json = Column(Text)
    
    # Chi l'ha scoperta?
    discoverer_id = Column(Integer, ForeignKey("users.id"))
    discoverer = relationship("User", back_populates="discoveries")

# Aggiorna il file fisico del DB con le nuove tabelle
Base.metadata.create_all(bind=engine)