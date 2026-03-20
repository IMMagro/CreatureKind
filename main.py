import asyncio
from fastapi.responses import FileResponse # AGGIUNGI QUESTA RIGA!
import random
import neat
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from physics import ToroidalSpace
from biology import Plant, SmartCreature

class GameEngine:
    def __init__(self):
        self.tick = 0
        self.running = False
        self.tps = 30 
        self.world = ToroidalSpace(width=6400, height=3600)
        
        self.flora = []
        self.biomass = [] 
        self.creatures = []
        
        # --- INIT NEAT ---
        self.neat_config = neat.Config(neat.DefaultGenome, neat.DefaultReproduction,
                                       neat.DefaultSpeciesSet, neat.DefaultStagnation,
                                       'config-neat.txt')
        
        # Inizializziamo le piante
        for i in range(150): 
            self.flora.append(Plant(id=f"plant_{i}", start_x=random.uniform(0, 6400), start_y=random.uniform(0, 3600)))
            
        # --- LA CORREZIONE: Generazione 0 ---
        # Creiamo una vera "Popolazione" di NEAT. Questo accende tutti i registri interni (Innovation Tracker)
        # e genera automaticamente 50 genomi validi (il pop_size scritto nel config)
        neat_population = neat.Population(self.neat_config)
        
        # Estraiamo i 50 cervelli appena creati e li infiliamo nei corpi delle nostre creature fisiche
        genomes = list(neat_population.population.values())
        
        for i, genome in enumerate(genomes):
            x = random.uniform(0, 6400)
            y = random.uniform(0, 3600)
            self.creatures.append(SmartCreature(id=f"c_{i}", x=x, y=y, genome=genome, neat_config=self.neat_config))

    async def loop(self):
        self.running = True
        print(f"🌍 Mondo con NEAT avviato! Generazione 0 (50 Creature) in corso.")
        
        while self.running:
            self.tick += 1
            
            # Aggiornamento Piante
            new_spores, surviving_flora = [], []
            for plant in self.flora:
                spore = plant.update(self.world)
                if spore: new_spores.append(spore)
                if plant.is_dead: self.biomass.extend(plant.pixels)
                else: surviving_flora.append(plant)
            self.flora = surviving_flora + new_spores
            
            # Aggiornamento Creature Intelligenti
            surviving_creatures = []
            for creature in self.creatures:
                creature.update(self.world, self.flora, self.biomass)
                if creature.is_dead: self.biomass.extend(creature.pixels)
                else: surviving_creatures.append(creature)
            self.creatures = surviving_creatures
                
            await asyncio.sleep(1 / self.tps)

engine = GameEngine()

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(engine.loop())
    yield
    engine.running = False
    task.cancel()

app = FastAPI(lifespan=lifespan)
@app.get("/")
async def serve_frontend():
    # Assicurati che il percorso sia corretto rispetto a dove si trova main.py
    return FileResponse("frontend_test/index.html")
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
            all_pixels = []
            for plant in engine.flora:
                for p in plant.pixels: all_pixels.append({"type": p.type, "x": p.x, "y": p.y})
            for p in engine.biomass: all_pixels.append({"type": p.type, "x": p.x, "y": p.y})
            for creature in engine.creatures:
                for p in creature.pixels: all_pixels.append({"type": p.type, "x": p.x, "y": p.y})

            await websocket.send_json({
                "tick": engine.tick,
                "plants_count": len(engine.flora),
                "biomass_count": len(engine.biomass),
                "creatures_count": len(engine.creatures),
                "pixels": all_pixels
            })
    except WebSocketDisconnect:
        pass