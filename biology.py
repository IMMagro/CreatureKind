# biology.py
import neat
import math
import random
from physics import Pixel, ToroidalSpace

class Plant:
    def __init__(self, id: str, start_x: float, start_y: float):
        self.id = id
        self.energy = 50.0
        self.age = 0
        self.max_age = random.randint(500, 1500) 
        self.is_dead = False
        
        first_cell = Pixel(id=f"{self.id}_0", x=start_x, y=start_y, pixel_type="Gastro")
        self.pixels = [first_cell]
        self.max_size = random.randint(20, 60) 

    def update(self, space: ToroidalSpace):
        if self.is_dead:
            return None

        self.age += 1
        
        if self.age > self.max_age:
            self._die()
            return None

        self.energy += 0.5 * len(self.pixels) 
        self.energy -= 0.2 * len(self.pixels) 

        if self.energy <= 0:
            self._die()
            return None

        if self.energy > 150.0 and len(self.pixels) < self.max_size:
            self._grow_new_cell(space)
            self.energy -= 80.0

        if len(self.pixels) >= (self.max_size * 0.8) and self.energy > 300.0:
            self.energy -= 200.0 
            return self._spawn_spore(space)

        return None 

    def _grow_new_cell(self, space: ToroidalSpace):
        parent_cell = random.choice(self.pixels)
        offset_x, offset_y = random.choice([(10, 0), (-10, 0), (0, 10), (0, -10)])
        new_x, new_y = space.wrap(parent_cell.x + offset_x, parent_cell.y + offset_y)
        new_cell = Pixel(id=f"{self.id}_{len(self.pixels)}", x=new_x, y=new_y, pixel_type="Gastro")
        self.pixels.append(new_cell)

    def _spawn_spore(self, space: ToroidalSpace):
        base_x = self.pixels[0].x
        base_y = self.pixels[0].y
        offset_x = random.uniform(-200, 200)
        offset_y = random.uniform(-200, 200)
        new_x, new_y = space.wrap(base_x + offset_x, base_y + offset_y)
        
        child_id = f"p_{random.randint(10000, 99999)}"
        return Plant(id=child_id, start_x=new_x, start_y=new_y)

    def _die(self):
        self.is_dead = True
        for p in self.pixels:
            p.type = "Biomass" 


class SmartCreature:
    """Una creatura governata interamente da una Rete Neurale (NEAT)"""
    def __init__(self, id: str, x: float, y: float, genome, neat_config):
        self.id = id
        self.energy = 800.0
        self.is_dead = False
        self.mating_cooldown = 0 
        # Genetica e Cervello
        self.genome = genome
        self.genome.fitness = 0.0 
        self.brain = neat.nn.FeedForwardNetwork.create(genome, neat_config)
        
        self.pixels = [
            Pixel(id=f"{id}_n", x=x, y=y, pixel_type="Neuro"),
            Pixel(id=f"{id}_g", x=x+10, y=y, pixel_type="Gastro"),
            Pixel(id=f"{id}_p", x=x-10, y=y+10, pixel_type="Power")
        ]
        
        self.max_speed = 12.0 
        self.vision_radius = 600.0 
        self.angle = random.uniform(0, 2 * math.pi) 

    def update(self, space: ToroidalSpace, flora_list: list, biomass_list: list, all_creatures: list):
        if self.is_dead: return

        self.energy -= 1.5
        self.genome.fitness += 0.1 
        
        if self.mating_cooldown > 0:
            self.mating_cooldown -= 1
            
        if self.energy <= 0:
            self.die()
            return

        head_x, head_y = self.pixels[0].x, self.pixels[0].y

        # --- 1. SENSO DEL CIBO (Piante e Biomassa) ---
        closest_food = None
        min_food_dist = self.vision_radius
        target_list = None
        
        for b_pixel in biomass_list:
            dist = space.distance(head_x, head_y, b_pixel.x, b_pixel.y)
            if dist < min_food_dist: min_food_dist, closest_food, target_list = dist, b_pixel, biomass_list

        for plant in flora_list:
            if plant.is_dead or not plant.pixels: continue
            center_x, center_y = plant.pixels[0].x, plant.pixels[0].y
            if space.distance(head_x, head_y, center_x, center_y) < self.vision_radius + 50:
                for p_pixel in plant.pixels:
                    dist = space.distance(head_x, head_y, p_pixel.x, p_pixel.y)
                    if dist < min_food_dist: min_food_dist, closest_food, target_list = dist, p_pixel, plant.pixels

        # --- 2. NUOVO SENSO: IL RADAR PER LE ALTRE CREATURE ---
        closest_creature = None
        min_creat_dist = self.vision_radius
        
        for other in all_creatures:
            if other.id == self.id or other.is_dead: continue # Non guardare te stesso o i morti
            dist = space.distance(head_x, head_y, other.pixels[0].x, other.pixels[0].y)
            if dist < min_creat_dist:
                min_creat_dist = dist
                closest_creature = other

        # --- PREPARAZIONE DEGLI INPUT PER IL CERVELLO (Da -1.0 a 1.0) ---
        input_food_dist = 1.0 
        input_food_angle = 0.0
        
        # Nuovi input
        input_creat_dist = 1.0
        input_creat_angle = 0.0
        
        input_energy = self.energy / 800.0 

        # Calcolo angolo cibo
        if closest_food:
            input_food_dist = min_food_dist / self.vision_radius 
            dx = closest_food.x - head_x
            dy = closest_food.y - head_y
            if dx > space.width / 2: dx -= space.width
            elif dx < -space.width / 2: dx += space.width
            if dy > space.height / 2: dy -= space.height
            elif dy < -space.height / 2: dy += space.height
            
            target_angle = math.atan2(dy, dx)
            diff = (target_angle - self.angle + math.pi) % (2 * math.pi) - math.pi 
            input_food_angle = diff / math.pi 
            
            # Mangia il cibo statico (Piante/Biomassa)
            if min_food_dist < 15.0:
                self.energy += 100.0
                self.genome.fitness += 10.0 
                target_list.remove(closest_food)

        # Calcolo angolo altra creatura (Preda, Predatore o Partner)
        if closest_creature:
            input_creat_dist = min_creat_dist / self.vision_radius
            dx = closest_creature.pixels[0].x - head_x
            dy = closest_creature.pixels[0].y - head_y
            if dx > space.width / 2: dx -= space.width
            elif dx < -space.width / 2: dx += space.width
            if dy > space.height / 2: dy -= space.height
            elif dy < -space.height / 2: dy += space.height
            
            target_angle = math.atan2(dy, dx)
            diff = (target_angle - self.angle + math.pi) % (2 * math.pi) - math.pi 
            input_creat_angle = diff / math.pi 

        # --- 3. IL CERVELLO A 5 INPUT ---
        # Ora passiamo 5 valori alla rete neurale!
        outputs = self.brain.activate((input_food_dist, input_food_angle, input_creat_dist, input_creat_angle, input_energy))
        
        turn_signal = outputs[0]  
        speed_signal = outputs[1] 

        self.angle += turn_signal * 0.2 
        actual_speed = self.max_speed * max(0.0, speed_signal) 
        move_x = math.cos(self.angle) * actual_speed
        move_y = math.sin(self.angle) * actual_speed
        
        for p in self.pixels:
            p.x, p.y = space.wrap(p.x + move_x, p.y + move_y)

    def die(self):
        self.is_dead = True
        for p in self.pixels: p.type = "Biomass"
        
        
# Aggiungi questo in fondo a biology.py

class Egg:
    """Un uovo fisico deposto nel mondo. Contiene un genoma in incubazione."""
    def __init__(self, id: str, x: float, y: float, genome, neat_config):
        self.id = id
        # Un singolo pixel dorato per rappresentare l'uovo
        self.pixels = [Pixel(id=f"{id}_e", x=x, y=y, pixel_type="Egg")] 
        
        self.genome = genome
        self.neat_config = neat_config
        
        # TIMER DI SCHIUSA: 
        # 30 Ticks = 1 Secondo. 
        # Per testare mettiamo 150 (5 secondi). 
        # IN FUTURO: per 10 minuti, scrivi 18000!
        self.hatch_timer = 150 
        self.is_hatched = False

    def update(self):
        """Diminuisce il timer. Se arriva a zero, l'uovo si schiude e restituisce una Creatura."""
        self.hatch_timer -= 1
        
        if self.hatch_timer <= 0 and not self.is_hatched:
            self.is_hatched = True
            
            # Nasce la creatura! Usiamo le stesse coordinate dell'uovo e gli diamo il DNA incubato
            new_creature_id = self.id.replace("egg", "c")
            x = self.pixels[0].x
            y = self.pixels[0].y
            return SmartCreature(new_creature_id, x, y, self.genome, self.neat_config)
            
        return None