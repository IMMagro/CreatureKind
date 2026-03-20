import json
import asyncio
import random
import neat
import gc
import pickle 
import os     
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse 

from physics import ToroidalSpace
from biology import Plant, SmartCreature, Egg

class GameEngine:
    def __init__(self):
        self.tick = 0
        self.running = False
        self.tps = 60 
        self.world = ToroidalSpace(width=6400, height=3600)
        
        self.flora = []
        self.biomass = [] 
        self.creatures = []
        self.eggs = [] 
        self.generation = 0 
        self.genome_id_counter = 1000
        
        self.neat_config = neat.Config(neat.DefaultGenome, neat.DefaultReproduction,
                                       neat.DefaultSpeciesSet, neat.DefaultStagnation,
                                       'config-neat.txt')

        self.save_file = "saves/world_state.pkl"
        if os.path.exists(self.save_file):
            self.load_state() 
        else:
            self.init_big_bang() 

    def init_big_bang(self):
        print("💥 Innesco del Big Bang (Generazione 0)...")
        for i in range(150): 
            self.flora.append(Plant(id=f"plant_{i}", start_x=random.uniform(0, 6400), start_y=random.uniform(0, 3600)))
            
        self.pop = neat.Population(self.neat_config)
        genomes = list(self.pop.population.values())
        for i, genome in enumerate(genomes):
            self.creatures.append(SmartCreature(id=f"c_{i}", x=random.uniform(0, 6400), y=random.uniform(0, 3600), genome=genome, neat_config=self.neat_config))

    def save_state(self):
        os.makedirs("saves", exist_ok=True) 
        state = {
            "generation": self.generation, 
            "genome_id_counter": self.genome_id_counter,
            "pop": self.pop,
            "config": self.neat_config # <-- LA CURA! Salviamo la Mappa dei Neuroni!
        }
        with open(self.save_file, "wb") as f:
            pickle.dump(state, f)
        print(f"💾 DNA E MEMORIA SALVATI: Generazione {self.generation} messa in cassaforte.")

    def load_state(self):
        print(f"📂 Trovato DNA antico! Rigenerazione del mondo in corso...")
        with open(self.save_file, "rb") as f:
            state = pickle.load(f)
            
        # 1. Carichiamo la genetica E la mappa dei neuroni!
        self.generation = state["generation"]
        self.genome_id_counter = state["genome_id_counter"]
        self.pop = state["pop"]
        self.neat_config = state["config"] # <-- RIPRISTINIAMO LA MEMORIA!
        
        # 2. Resettiamo il mondo fisico (Tick a 0, niente biomassa)
        self.tick = 0
        self.flora = []
        self.biomass = []
        self.creatures = []
        self.eggs = []
        
        # 3. Facciamo crescere piante nuove in un mondo intatto
        for i in range(150): 
            self.flora.append(Plant(id=f"plant_{i}", start_x=random.uniform(0, 6400), start_y=random.uniform(0, 3600)))
            
        # 4. Invece di farli nascere già adulti, deponiamo le UOVA della generazione salvata!
        genomes = list(self.pop.population.values())
        for i, genome in enumerate(genomes):
            x = random.uniform(0, 6400), random.uniform(0, 3600)
            self.eggs.append(Egg(id=f"egg_{i}", x=x[0], y=x[1], genome=genome, neat_config=self.neat_config))
            
        print(f"✅ Mondo nuovo generato. {len(self.eggs)} Uova della Gen {self.generation} in incubazione.")
    def next_generation(self):
        print(f"🧬 Estinzione Gen {self.generation}! Calcolo dell'evoluzione in corso...")
        self.pop.species.speciate(self.neat_config, self.pop.population, self.generation)
        new_population = self.pop.reproduction.reproduce(self.neat_config, self.pop.species, self.neat_config.pop_size, self.generation)
        self.pop.population = new_population
        self.generation += 1
        
        for i, (genome_id, genome) in enumerate(self.pop.population.items()):
            x = random.uniform(0, 6400), random.uniform(0, 3600)
            self.eggs.append(Egg(id=f"egg_{i}", x=x[0], y=x[1], genome=genome, neat_config=self.neat_config))
        
        gc.collect()
        self.save_state()

    async def loop(self):
        self.running = True
        while self.running:
            self.tick += 1
            
            decay_amount = int(len(self.biomass) * 0.002) + 1
            for _ in range(decay_amount):
                if self.biomass:
                    idx = random.randint(0, len(self.biomass) - 1)
                    self.biomass[idx] = self.biomass[-1] 
                    self.biomass.pop()
            
            new_spores, surviving_flora = [], []
            for plant in self.flora:
                spore = plant.update(self.world)
                if spore and len(self.flora) < 300: new_spores.append(spore)
                if plant.is_dead: self.biomass.extend(plant.pixels)
                else: surviving_flora.append(plant)
            self.flora = surviving_flora + new_spores
            
            surviving_eggs = []
            for egg in self.eggs:
                hatchling = egg.update()
                if hatchling: self.creatures.append(hatchling)
                else: surviving_eggs.append(egg)
            self.eggs = surviving_eggs
            
            surviving_creatures = []
            for creature in self.creatures:
                creature.update(self.world, self.flora, self.biomass, self.creatures)
                if creature.is_dead: self.biomass.extend(creature.pixels)
                else: surviving_creatures.append(creature)
            self.creatures = surviving_creatures
            
            for i, c1 in enumerate(self.creatures):
                if c1.is_dead: continue
                for c2 in self.creatures[i+1:]:
                    if c2.is_dead: continue
                    dist = self.world.distance(c1.pixels[0].x, c1.pixels[0].y, c2.pixels[0].x, c2.pixels[0].y)
                    if dist < 20.0:
                        if c1.energy > 1200 and c2.energy > 1200 and c1.mating_cooldown == 0 and c2.mating_cooldown == 0:
                            c1.energy -= 400
                            c2.energy -= 400
                            c1.mating_cooldown = 150
                            c2.mating_cooldown = 150
                            self.genome_id_counter += 1
                            new_genome = neat.DefaultGenome(self.genome_id_counter)
                            new_genome.configure_crossover(c1.genome, c2.genome, self.neat_config.genome_config)
                            new_genome.mutate(self.neat_config.genome_config)
                            egg_x, egg_y = (c1.pixels[0].x + c2.pixels[0].x) / 2, (c1.pixels[0].y + c2.pixels[0].y) / 2
                            self.eggs.append(Egg(id=f"egg_{self.genome_id_counter}", x=egg_x, y=egg_y, genome=new_genome, neat_config=self.neat_config))
                            break 
                        else:
                            if c1.energy > c2.energy: attacker, defender = c1, c2
                            else: attacker, defender = c2, c1
                            attacker.energy += 150
                            attacker.genome.fitness += 20.0 
                            defender.energy -= 150
                            defender.pixels[0].x += random.uniform(-30, 30)
                            defender.pixels[0].y += random.uniform(-30, 30)
                            break
            
            if len(self.creatures) == 0 and len(self.eggs) == 0:
                self.next_generation()
                
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
    return FileResponse("frontend_test/index.html")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data_str = await websocket.receive_text()
            
            if data_str.startswith("{"):
                try:
                    command = json.loads(data_str)
                    
                    # 1. AGGANCIO DEL BERSAGLIO
                    if command.get("action") == "inspect":
                        click_x, click_y = command["x"], command["y"]
                        closest, min_dist = None, 150.0
                        for c in engine.creatures:
                            dist = engine.world.distance(click_x, click_y, c.pixels[0].x, c.pixels[0].y)
                            if dist < min_dist:
                                min_dist, closest = dist, c
                                
                        if closest:
                            # Non mandiamo i dati, mandiamo solo l'ID da agganciare!
                            await websocket.send_json({"type": "tracking_id", "id": closest.id})

                                # 2. MIRACOLO DIVINO
                        elif command.get("action") == "spawn_food":
                            drop_x, drop_y = command["x"], command["y"]
                            print(f"⚡ MIRACOLO! Generato cibo divino alle coordinate {int(drop_x)}, {int(drop_y)}")
                            for _ in range(5):
                                offset_x, offset_y = random.uniform(-15, 15), random.uniform(-15, 15)
                                engine.biomass.append(Pixel(id=f"divine_{engine.tick}_{_}", x=drop_x+offset_x, y=drop_y+offset_y, pixel_type="Biomass"))
                                engine.flora.append(Plant(id=f"miracle_{engine.tick}", start_x=drop_x, start_y=drop_y))
                        
               
                    # 3. RICHIESTA DATI IN TEMPO REALE
                    elif command.get("action") == "req":
                        all_pixels = []
                        for plant in engine.flora:
                            for p in plant.pixels: all_pixels.append([p.type, int(p.x), int(p.y)])
                        for p in engine.biomass: all_pixels.append([p.type, int(p.x), int(p.y)])
                        for creature in engine.creatures:
                            for p in creature.pixels: all_pixels.append([p.type, int(p.x), int(p.y)])
                        for egg in engine.eggs:
                            for p in egg.pixels: all_pixels.append([p.type, int(p.x), int(p.y)])

                        # Cerca i dati live della creatura tracciata (se esiste)
                        tracked_data = None
                        tracked_id = command.get("track_id")
                        if tracked_id:
                            for c in engine.creatures:
                                if c.id == tracked_id:
                                    tracked_data = {
                                        "id": c.id, "energy": round(c.energy, 1),
                                        "fitness": round(c.genome.fitness, 1), "cooldown": c.mating_cooldown
                                    }
                                    break

                        await websocket.send_json({
                            "type": "world_state",
                            "tick": engine.tick,
                            "generation": engine.generation,
                            "plants_count": len(engine.flora),
                            "biomass_count": len(engine.biomass),
                            "creatures_count": len(engine.creatures),
                            "eggs_count": len(engine.eggs),
                            "pixels": all_pixels,
                            "tracked_info": tracked_data # INFO IN TEMPO REALE!
                        })
                except json.JSONDecodeError: pass
    except WebSocketDisconnect:
        pass