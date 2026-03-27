import json
import asyncio
import random
import neat
import gc
import pickle 
import os
import math
import bcrypt
import copy

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.responses import FileResponse 
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from physics import ToroidalSpace, Pixel, SpatialGrid
from biology import Plant, SmartCreature, Egg
from models import SessionLocal, User

# ==========================================
# LA BIOLOGIA: MUTAZIONI FISICHE E ACQUA
# ==========================================
BASE_MORPHOLOGY = [
    ("Neuro", 0, 0),     
    ("Gastro", 10, 0),   
    ("Power", -10, 10)   
]

def check_water_for_plant(x, y, water_zones, space):
    is_in_water = False
    is_near_water = False
    for w in water_zones:
        dist = space.distance(x, y, w["x"], w["y"])
        if dist <= w["radius"] - 15:
            is_in_water = True
            break
        elif dist <= w["radius"] + 80:
            is_near_water = True
            break
    return is_near_water, is_in_water

def mutate_morphology(morph_parent1, morph_parent2):
    child_morph = copy.deepcopy(morph_parent1)
    if random.random() < 0.20:
        mutation_type = random.choice(["grow", "shrink", "change"])
        if mutation_type == "grow" and len(child_morph) < 10:
            anchor = random.choice(child_morph)
            new_type = random.choice(["Power", "Power", "Power", "Gastro", "Gastro"])
            offset_x, offset_y = random.choice([(10,0), (-10,0), (0,10), (0,-10)])
            child_morph.append((new_type, anchor[1] + offset_x, anchor[2] + offset_y))
            print("🧬 È NATO UN MUTANTE (Crescita)!")
        elif mutation_type == "shrink" and len(child_morph) > 3:
            idx = random.randint(1, len(child_morph) - 1)
            child_morph.pop(idx)
            print("🧬 È NATO UN MUTANTE (Restringimento)!")
        elif mutation_type == "change" and len(child_morph) > 1:
            idx = random.randint(1, len(child_morph) - 1)
            old_piece = child_morph[idx]
            new_type = "Power" if old_piece[0] == "Gastro" else "Gastro"
            child_morph[idx] = (new_type, old_piece[1], old_piece[2])
            print(f"🧬 MUTAZIONE: Organo trasformato in {new_type}!")
    return child_morph

# ==========================================
# IL MOTORE DELL'UNIVERSO
# =========================================
class GameEngine:
    def __init__(self):
        self.tick = 0
        self.running = False
        self.tps = 30
        self.world = ToroidalSpace(width=6400, height=3600)
        self.spatial_grid = SpatialGrid(6400, 3600, 150.0)
        self.flora = []
        self.biomass = [] 
        self.creatures = []
        self.eggs = [] 
        self.generation = 0 
        self.genome_id_counter = 1000
        
        self.water_zones = [
            {"x": 1000, "y": 800, "radius": 400},
            {"x": 1400, "y": 900, "radius": 350},
            {"x": 1600, "y": 1300, "radius": 250},
            {"x": 3600, "y": 1800, "radius": 600},
            {"x": 3700, "y": 1900, "radius": 500},
            {"x": 2800, "y": 2000, "radius": 450},
            {"x": 5000, "y": 2800, "radius": 200},
            {"x": 5300, "y": 3000, "radius": 150},
            {"x": 5100, "y": 3200, "radius": 220},
            {"x": 5600, "y": 2900, "radius": 180}
        ]
            
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
            x, y = random.uniform(0, 6400), random.uniform(0, 3600)
            near_w, in_w = check_water_for_plant(x, y, self.water_zones, self.world)
            self.flora.append(Plant(id=f"plant_{i}", start_x=x, start_y=y, is_near_water=near_w, is_in_water=in_w))
            
        self.pop = neat.Population(self.neat_config)
        genomes = list(self.pop.population.values())
        for i, genome in enumerate(genomes):
            self.creatures.append(SmartCreature(id=f"c_{i}", x=random.uniform(0, 6400), y=random.uniform(0, 3600), genome=genome, neat_config=self.neat_config, morphology=BASE_MORPHOLOGY))

    def save_state(self):
        os.makedirs("saves", exist_ok=True) 
        state = {
            "generation": self.generation, 
            "genome_id_counter": self.genome_id_counter,
            "pop": self.pop,
            "config": self.neat_config 
        }
        with open(self.save_file, "wb") as f:
            pickle.dump(state, f)
        print(f"💾 DNA E MEMORIA SALVATI: Generazione {self.generation} messa in cassaforte.")

    def load_state(self):
        print(f"📂 Trovato DNA antico! Rigenerazione del mondo in corso...")
        with open(self.save_file, "rb") as f:
            state = pickle.load(f)
            
        self.generation = state["generation"]
        self.genome_id_counter = state["genome_id_counter"]
        self.pop = state["pop"]
        self.neat_config = state["config"] 
        
        self.tick = 0
        self.flora = []
        self.biomass = []
        self.creatures = []
        self.eggs = []
        
        # CORREZIONE: Calcoliamo l'acqua per le piante rinate!
        for i in range(150): 
            x, y = random.uniform(0, 6400), random.uniform(0, 3600)
            near_w, in_w = check_water_for_plant(x, y, self.water_zones, self.world)
            self.flora.append(Plant(id=f"plant_{i}", start_x=x, start_y=y, is_near_water=near_w, is_in_water=in_w))
            
        genomes = list(self.pop.population.values())
        for i, genome in enumerate(genomes):
            x, y = random.uniform(0, 6400), random.uniform(0, 3600)
            self.eggs.append(Egg(id=f"egg_{i}", x=x, y=y, genome=genome, neat_config=self.neat_config, morphology=BASE_MORPHOLOGY))
            
        print(f"✅ Mondo nuovo generato. {len(self.eggs)} Uova della Gen {self.generation} in incubazione.")
        
    def next_generation(self):
        print(f"🧬 Estinzione Gen {self.generation}! Calcolo dell'evoluzione in corso...")
        self.pop.species.speciate(self.neat_config, self.pop.population, self.generation)
        new_population = self.pop.reproduction.reproduce(self.neat_config, self.pop.species, self.neat_config.pop_size, self.generation)
        self.pop.population = new_population
        self.generation += 1
        
        for i, (genome_id, genome) in enumerate(self.pop.population.items()):
            x, y = random.uniform(0, 6400), random.uniform(0, 3600)
            self.eggs.append(Egg(id=f"egg_{i}", x=x, y=y, genome=genome, neat_config=self.neat_config, morphology=BASE_MORPHOLOGY))        
        
        gc.collect()
        self.save_state()

    async def loop(self):
        self.running = True
        print("🌍 Ecosistema online e in esecuzione!")
        
        # --- LA SCATOLA NERA INIZIA QUI ---
        try:
            while self.running:
                self.tick += 1
                
                # --- 1. SUPER-DECOMPOSIZIONE ---
                decay_rate = 0.05 if len(self.biomass) > 1000 else 0.005
                decay_amount = int(len(self.biomass) * decay_rate) + 1
                
                for _ in range(decay_amount):
                    if self.biomass:
                        idx = random.randint(0, len(self.biomass) - 1)
                        self.biomass[idx] = self.biomass[-1] 
                        self.biomass.pop()
                        
                self.spatial_grid.clear()
                for b_pixel in self.biomass:
                    self.spatial_grid.insert(b_pixel)
                
                # --- 2. AGGIORNAMENTO PIANTE ---
                new_spores, surviving_flora = [], []
                total_plant_pixels = sum(len(p.pixels) for p in self.flora)
                
                for plant in self.flora:
                    spore = plant.update(self.world)
                    
                    if spore and len(self.flora) < 250 and total_plant_pixels < 5000: 
                        near_w, in_w = check_water_for_plant(spore.pixels[0].x, spore.pixels[0].y, self.water_zones, self.world)
                        spore.is_near_water = near_w
                        spore.is_in_water = in_w
                        new_spores.append(spore)
                        
                    if plant.is_dead: self.biomass.extend(plant.pixels)
                    else: surviving_flora.append(plant)
                
                self.flora = surviving_flora + new_spores
                
                # --- 3. UOVA ---
                surviving_eggs = []
                for egg in self.eggs:
                    hatchling = egg.update()
                    if hatchling: self.creatures.append(hatchling)
                    else: surviving_eggs.append(egg)
                self.eggs = surviving_eggs
                
                # --- 4. CREATURE E INTELLIGENZA ---
                surviving_creatures = []
                for creature in self.creatures:
                    creature.update(self.world, self.flora, self.biomass, self.creatures, self.water_zones, self.spatial_grid)
                    if creature.is_dead: self.biomass.extend(creature.pixels)
                    else: surviving_creatures.append(creature)
                self.creatures = surviving_creatures
                
                # --- 5. COMBATTIMENTO E ACCOPPIAMENTO ---
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
                                child_morphology = mutate_morphology(c1.morphology, c2.morphology)
                                
                                self.eggs.append(Egg(id=f"egg_{self.genome_id_counter}", x=egg_x, y=egg_y, genome=new_genome, neat_config=self.neat_config, morphology=child_morphology))
                                break 
                            else:
                                if c1.energy > c2.energy: attacker, defender = c1, c2
                                else: attacker, defender = c2, c1
                                
                                damage = 100 + (sum(1 for p in attacker.morphology if p[0] == "Gastro") * 50)
                                attacker.energy = min(800.0, attacker.energy + damage)
                                attacker.genome.fitness += 20.0 
                                defender.energy -= damage
                                defender.pixels[0].x += random.uniform(-30, 30)
                                defender.pixels[0].y += random.uniform(-30, 30)
                                break
                
                # --- 6. ESTINZIONE ---
                if len(self.creatures) == 1 and len(self.eggs) == 0:
                    self.next_generation()
                    
                # --- 7. IL BATTITO DEL CUORE (HEARTBEAT NEL TERMINALE) ---
                if self.tick % self.tps == 0:
                    print(f"⏱️ [TICK: {self.tick:06d}] | 🧬 GEN: {self.generation:03d} | 🦠 Creature: {len(self.creatures):03d} | 🥚 Uova: {len(self.eggs):03d} | 🌿 Piante: {len(self.flora):03d} | 🪨 Biomassa: {len(self.biomass):05d}")
                    
                await asyncio.sleep(1 / self.tps)
                
        except Exception as e:
            # --- LA SCATOLA NERA CATTURA L'ERRORE! ---
            import traceback
            print(f"\n❌ CRASH CRITICO NEL MOTORE AL TICK {self.tick} ❌")
            print("==================================================")
            traceback.print_exc() # Stampa la riga esatta che ha causato il crash
            print("==================================================")
            self.running = False # Ferma il motore ma lascia il server web acceso

engine = GameEngine()

# ==========================================
# 🌐 SERVER E API
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(engine.loop())
    yield
    engine.running = False
    task.cancel()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

class UserLogin(BaseModel):
    email: str
    password: str

class UserRegister(BaseModel):
    username: str
    email: str
    password: str

@app.post("/api/register")
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user_data.email).first()
    if db_user: raise HTTPException(status_code=400, detail="Email già registrata")
    
    hashed_pw = get_password_hash(user_data.password)
    new_user = User(username=user_data.username, email=user_data.email, hashed_password=hashed_pw, plan="Explorer", dna_credits=500)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "Registrazione completata", "id": new_user.id}

class RechargeData(BaseModel):
    email: str

@app.post("/api/recharge")
async def recharge_dna(data: RechargeData, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        user.dna_credits += 100
        db.commit()
        return {"new_credits": user.dna_credits}
    raise HTTPException(status_code=404, detail="User not found")

@app.post("/api/login")
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email o Password errati")
    return {"id": user.id, "username": user.username, "email": user.email, "plan": user.plan, "dna_credits": user.dna_credits}

@app.get("/api/server-stats")
async def get_server_stats():
    max_fit = 0
    for c in engine.creatures:
        if c.genome.fitness > max_fit: max_fit = c.genome.fitness
    return {
        "totalGenerations": engine.generation,
        "maxFitnessReached": round(max_fit, 2),
        "uptime": f"Tick: {engine.tick}", 
        "extinctionEvents": engine.generation 
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data_str = await websocket.receive_text()
            
            if data_str.startswith("{"):
                try:
                    command = json.loads(data_str)
                    
                    if command.get("action") == "inspect":
                        click_x, click_y = command["x"], command["y"]
                        closest, min_dist = None, 150.0
                        for c in engine.creatures:
                            dist = engine.world.distance(click_x, click_y, c.pixels[0].x, c.pixels[0].y)
                            if dist < min_dist:
                                min_dist, closest = dist, c
                                
                        if closest:
                            await websocket.send_json({"type": "tracking_id", "id": closest.id})

                    # 2. MIRACOLO DIVINO (COSTA 5 PUNTI DNA!)
                    # 2. MIRACOLO DIVINO (COSTA 5 PUNTI DNA!)
                    elif command.get("action") == "spawn_food":
                        user_email = command.get("user_email")
                        if not user_email: continue
                        
                        db = SessionLocal()
                        user = db.query(User).filter(User.email == user_email).first()
                        
                        if user and user.dna_credits >= 5:
                            user.dna_credits -= 5
                            db.commit()
                            
                            # SALVIAMO I DATI PRIMA DI CHIUDERE IL DB!
                            safe_username = user.username
                            safe_credits = user.dna_credits
                            db.close()
                            
                            drop_x, drop_y = command["x"], command["y"]
                            print(f"⚡ MIRACOLO di {safe_username}! (-5 DNA). Rimasti: {safe_credits}")
                            
                            for _ in range(5):
                                offset_x, offset_y = random.uniform(-15, 15), random.uniform(-15, 15)
                                engine.biomass.append(Pixel(id=f"divine_{engine.tick}_{_}", x=drop_x+offset_x, y=drop_y+offset_y, pixel_type="Biomass"))
                            engine.flora.append(Plant(id=f"miracle_{engine.tick}", start_x=drop_x, start_y=drop_y, is_near_water=False, is_in_water=False))
                            
                            await websocket.send_json({"type": "credit_update", "credits": safe_credits})
                        else:
                            db.close()
                            await websocket.send_json({"type": "error", "message": "Punti DNA Insufficienti!"})
                    # 3. PUNIZIONE DIVINA (DISTRUGGE UNA PIANTA - COSTA 5 PUNTI DNA)
                    elif command.get("action") == "smite_plant":
                        user_email = command.get("user_email")
                        if not user_email: continue
                        
                        db = SessionLocal()
                        user = db.query(User).filter(User.email == user_email).first()
                        
                        if user and user.dna_credits >= 5:
                            # Cerca la pianta più vicina al click (entro 50 pixel)
                            click_x, click_y = command["x"], command["y"]
                            target_plant = None
                            min_dist = 50.0
                            
                            for plant in engine.flora:
                                if not plant.is_dead and plant.pixels:
                                    dist = engine.world.distance(click_x, click_y, plant.pixels[0].x, plant.pixels[0].y)
                                    if dist < min_dist:
                                        min_dist = dist
                                        target_plant = plant
                                        
                            if target_plant:
                                # Paga e distruggi!
                                user.dna_credits -= 5
                                db.commit()
                                safe_credits = user.dna_credits
                                db.close()
                                
                                # La pianta brucia istantaneamente, lasciando biomassa!
                                target_plant._die()
                                print(f"🌩️ PUNIZIONE di {user.username}! (-5 DNA). Rimasti: {safe_credits}")
                                
                                await websocket.send_json({"type": "credit_update", "credits": safe_credits})
                            else:
                                db.close()
                                # Non ha colpito nessuna pianta
                        else:
                            db.close()
                            await websocket.send_json({"type": "error", "message": "Punti DNA Insufficienti!"})    
                    elif command.get("action") == "req":
                        all_pixels = []
                        for plant in engine.flora:
                            for p in plant.pixels: all_pixels.append([p.type, int(p.x), int(p.y)])
                        for p in engine.biomass: all_pixels.append([p.type, int(p.x), int(p.y)])
                        for creature in engine.creatures:
                            for p in creature.pixels: all_pixels.append([p.type, int(p.x), int(p.y), creature.id])
                        for egg in engine.eggs:
                            for p in egg.pixels: all_pixels.append([p.type, int(p.x), int(p.y)])

                        tracked_data = None
                        tracked_id = command.get("track_id")
                        # --- TRACCIAMENTO E LETTURA DEL CERVELLO ---
                        tracked_data = None
                        tracked_id = command.get("track_id")
                        if tracked_id:
                            for c in engine.creatures:
                                if c.id == tracked_id:
                                    
                                    # 1. Estraiamo la struttura della Rete Neurale dal Genoma NEAT!
                                    brain_nodes = []
                                    brain_conns = []
                                    
                                    # I nodi (Neuroni)
                                    for node_id, node_gene in c.genome.nodes.items():
                                        # Passiamo l'ID e il bias (quanto è sensibile il neurone)
                                        brain_nodes.append({"id": node_id, "bias": node_gene.bias})
                                        
                                    # Le connessioni (Sinapsi)
                                    for conn_key, conn_gene in c.genome.connections.items():
                                        if conn_gene.enabled: # Mostriamo solo quelle funzionanti!
                                            # in_node, out_node, peso della connessione (rosso/verde)
                                            brain_conns.append({
                                                "in": conn_key[0], 
                                                "out": conn_key[1], 
                                                "weight": conn_gene.weight
                                            })

                                    # 2. Assembliamo il pacchetto dati completo per Angular
                                    tracked_data = {
                                        "id": c.id, 
                                        "energy": round(c.energy, 1),
                                        "hydration": round(c.hydration, 1), 
                                        "age": c.age,
                                        "fitness": round(c.genome.fitness, 1), 
                                        "cooldown": c.mating_cooldown,
                                        "morphology": c.morphology,
                                        # I nuovi dati del cervello!
                                        "brain": {
                                            "nodes": brain_nodes,
                                            "connections": brain_conns
                                        }
                                    }
                                    break

                        await websocket.send_json({
                            "type": "world_state",
                            "water_zones": engine.water_zones,
                            "tick": engine.tick,
                            "generation": engine.generation,
                            "plants_count": len(engine.flora),
                            "biomass_count": len(engine.biomass),
                            "creatures_count": len(engine.creatures),
                            "eggs_count": len(engine.eggs),
                            "pixels": all_pixels,
                            "tracked_info": tracked_data 
                        })
                except json.JSONDecodeError: pass
    except WebSocketDisconnect:
        pass