# main.py
import asyncio
import random
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from physics import ToroidalSpace
from biology import Plant

class GameEngine:
    def __init__(self):
        self.tick = 0
        self.running = False
        self.tps = 30 # Rimettiamo a 30 TPS ora che il codice è ottimizzato
        
        # IL MONDO SI ESPANDE: 5000 x 5000
        self.world = ToroidalSpace(width=5000, height=5000)
        
        self.flora = []
        self.biomass = [] # Qui finiranno le foglie morte / pixel in decomposizione
        
        for i in range(50): # Partiamo con 50 piante sparse nell'enorme mappa
            x = random.uniform(0, 5000)
            y = random.uniform(0, 5000)
            self.flora.append(Plant(id=f"plant_{i}", start_x=x, start_y=y))

    async def loop(self):
        self.running = True
        print(f"🌍 Ecosistema 5000x5000 avviato!")
        
        while self.running:
            self.tick += 1
            
            new_spores = []
            surviving_flora = []
            
            # --- CICLO VITALE ---
            for plant in self.flora:
                # La pianta si aggiorna e magari ritorna un "seme"
                spore = plant.update(self.world)
                if spore:
                    new_spores.append(spore)
                
                # Smistamento dei morti
                if plant.is_dead:
                    # Sposta i pixel morti nella lista "biomass" del server
                    self.biomass.extend(plant.pixels)
                else:
                    surviving_flora.append(plant)
            
            # Aggiorna la lista delle piante vive (rimuovendo i morti e aggiungendo i neonati)
            self.flora = surviving_flora + new_spores
                
            await asyncio.sleep(1 / self.tps)

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
            # 1. Raccoglie i pixel vivi (Gastro)
            for plant in engine.flora:
                for p in plant.pixels:
                    all_pixels.append({"id": p.id, "type": p.type, "x": p.x, "y": p.y})
            
            # 2. Raccoglie i pixel morti (Biomass)
            for p in engine.biomass:
                all_pixels.append({"id": p.id, "type": p.type, "x": p.x, "y": p.y})

            await websocket.send_json({
                "tick": engine.tick,
                "plants_count": len(engine.flora),
                "biomass_count": len(engine.biomass),
                "pixels": all_pixels
            })
    except WebSocketDisconnect:
        pass