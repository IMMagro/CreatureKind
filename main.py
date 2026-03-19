# main.py
import asyncio
import random
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from physics import ToroidalSpace
from biology import Plant, PrimitiveCreature # Importiamo la nuova creatura!

class GameEngine:
    def __init__(self):
        self.tick = 0
        self.running = False
        self.tps = 30 
        
        # NUOVO MONDO 16:9 (Adatto agli schermi moderni)
        self.world = ToroidalSpace(width=6400, height=3600)
        
        self.flora = []
        self.biomass = [] 
        self.creatures = [] # Nuova lista per gli animali!
        
        # Creiamo 150 piante per riempire questo mondo gigantesco
        for i in range(150): 
            self.flora.append(Plant(id=f"plant_{i}", start_x=random.uniform(0, 6400), start_y=random.uniform(0, 3600)))
            
        # Facciamo nascere 10 Creature (Gli Spazzini primordiali)
        for i in range(10):
            self.creatures.append(PrimitiveCreature(id=f"c_{i}", x=random.uniform(0, 6400), y=random.uniform(0, 3600)))

    async def loop(self):
        self.running = True
        print(f"🌍 Mondo 6400x3600 avviato! Con piante e prime creature.")
        
        while self.running:
            self.tick += 1
            
            # 1. AGGIORNAMENTO PIANTE
            new_spores = []
            surviving_flora = []
            for plant in self.flora:
                spore = plant.update(self.world)
                if spore: new_spores.append(spore)
                
                if plant.is_dead:
                    self.biomass.extend(plant.pixels)
                else:
                    surviving_flora.append(plant)
            self.flora = surviving_flora + new_spores
            
            # 2. AGGIORNAMENTO CREATURE
            surviving_creatures = []
            for creature in self.creatures:
                # Novità: Passiamo sia la flora viva che la biomassa morta!
                creature.update(self.world, self.flora, self.biomass)
                
                if creature.is_dead:
                    self.biomass.extend(creature.pixels)
                else:
                    surviving_creatures.append(creature)
            self.creatures = surviving_creatures

engine = GameEngine()

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(engine.loop())
    yield
    engine.running = False
    task.cancel()

app = FastAPI(lifespan=lifespan)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
            
            all_pixels = []
            for plant in engine.flora:
                for p in plant.pixels: all_pixels.append({"type": p.type, "x": p.x, "y": p.y})
            
            for p in engine.biomass:
                all_pixels.append({"type": p.type, "x": p.x, "y": p.y})
                
            for creature in engine.creatures:
                for p in creature.pixels: all_pixels.append({"type": p.type, "x": p.x, "y": p.y})

            # Passiamo anche il numero di creature all'HUD
            await websocket.send_json({
                "tick": engine.tick,
                "plants_count": len(engine.flora),
                "biomass_count": len(engine.biomass),
                "creatures_count": len(engine.creatures),
                "pixels": all_pixels
            })
    except WebSocketDisconnect:
        pass