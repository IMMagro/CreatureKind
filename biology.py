import neat
import math
import random
from physics import Pixel, ToroidalSpace

class Plant:
    # L'ERRORE ERA QUI: Era sparita questa riga!
    def __init__(self, id: str, start_x: float, start_y: float):
        self.id = id
        self.energy = 50.0
        self.age = 0
        self.max_age = random.randint(100, 250) 
        self.is_dead = False
        self.pixels = [Pixel(id=f"{self.id}_0", x=start_x, y=start_y, pixel_type="Gastro")]
        self.max_size = random.randint(20, 60) 

    def update(self, space: ToroidalSpace, water_zones: list):
        if self.is_dead: return None
        
        # IL CEROTTO DI SICUREZZA 1
        if not self.pixels:
            self._die()
            return None
            
        self.age += 1
        if self.age > self.max_age:
            self._die()
            return None

        # Controlla se la pianta è dentro l'acqua
        in_water = False
        for w in water_zones:
            if space.distance(self.pixels[0].x, self.pixels[0].y, w["x"], w["y"]) <= w["radius"]:
                in_water = True
                break

        # L'acqua fa crescere la pianta molto più velocemente!
        growth_multiplier = 3.0 if in_water else 0.5
        self.energy += growth_multiplier * len(self.pixels) 
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
        self.pixels.append(Pixel(id=f"{self.id}_{len(self.pixels)}", x=new_x, y=new_y, pixel_type="Gastro"))

    def _spawn_spore(self, space: ToroidalSpace):
        base_x, base_y = self.pixels[0].x, self.pixels[0].y
        offset_x, offset_y = random.uniform(-300, 300), random.uniform(-300, 300)
        new_x, new_y = space.wrap(base_x + offset_x, base_y + offset_y)
        return Plant(id=f"p_{random.randint(10000, 99999)}", start_x=new_x, start_y=new_y)

    def _die(self):
        self.is_dead = True
        for p in self.pixels: p.type = "Biomass" 

class Egg:
    def __init__(self, id: str, x: float, y: float, genome, neat_config, morphology):
        self.id = id
        self.pixels = [Pixel(id=f"{id}_e", x=x, y=y, pixel_type="Egg")] 
        self.genome, self.neat_config, self.morphology = genome, neat_config, morphology
        self.hatch_timer = 150 
        self.is_hatched = False

    def update(self):
        self.hatch_timer -= 1
        if self.hatch_timer <= 0 and not self.is_hatched:
            self.is_hatched = True
            return SmartCreature(self.id.replace("egg", "c"), self.pixels[0].x, self.pixels[0].y, self.genome, self.neat_config, self.morphology)
        return None

class SmartCreature:
    def __init__(self, id: str, x: float, y: float, genome, neat_config, morphology):
        self.id = id
        self.energy = 800.0
        self.hydration = 1000.0 # LA SETE!
        
        self.is_dead = False
        self.mating_cooldown = 0 
        self.genome = genome
        self.genome.fitness = 0.0 
        self.brain = neat.nn.FeedForwardNetwork.create(genome, neat_config)
        self.morphology = morphology 
        
        self.pixels = []
        num_power, num_gastro = 0, 0
        for i, (p_type, dx, dy) in enumerate(self.morphology):
            self.pixels.append(Pixel(id=f"{id}_{i}", x=x+dx, y=y+dy, pixel_type=p_type))
            if p_type == "Power": num_power += 1
            if p_type == "Gastro": num_gastro += 1
            
        self.max_speed = 8.0 + (num_power * 4.0) 
        self.digestion_power = 50.0 + (num_gastro * 50.0) 
        self.metabolism_drain = 1.5 + (max(0, len(self.pixels) - 3) * 0.5)
        self.vision_radius = 600.0 
        self.angle = random.uniform(0, 2 * math.pi) 

    def update(self, space: ToroidalSpace, flora_list: list, biomass_list: list, all_creatures: list, water_zones: list):
        if self.is_dead: return
        
        # IL CEROTTO DI SICUREZZA 2
        if not self.pixels:
            self.die()
            return

        self.energy -= self.metabolism_drain
        self.hydration -= 2.0 # Si ha sete velocemente!
        self.genome.fitness += 0.1 
        
        if self.mating_cooldown > 0: self.mating_cooldown -= 1
        
        # Si muore di fame o di sete!
        if self.energy <= 0 or self.hydration <= 0:
            self.die()
            return

        head_x, head_y = self.pixels[0].x, self.pixels[0].y

        # --- 1. SENSO DELL'ACQUA ---
        in_water = False
        closest_water, min_water_dist = None, self.vision_radius
        
        for w in water_zones:
            dist_to_center = space.distance(head_x, head_y, w["x"], w["y"])
            dist_to_edge = dist_to_center - w["radius"]
            
            if dist_to_edge <= 0:
                in_water = True
                closest_water = w
                min_water_dist = 0
            elif dist_to_edge < min_water_dist:
                min_water_dist = dist_to_edge
                closest_water = w

        if in_water:
            self.hydration = min(1000.0, self.hydration + 50.0) # Beve!
            self.genome.fitness += 1.0 # Bere è positivo per l'evoluzione

        # --- 2. SENSO DEL CIBO E DELLE CREATURE ---
        closest_food, min_food_dist, target_list = None, self.vision_radius, None
        for b_pixel in biomass_list:
            dist = space.distance(head_x, head_y, b_pixel.x, b_pixel.y)
            if dist < min_food_dist: min_food_dist, closest_food, target_list = dist, b_pixel, biomass_list

        for plant in flora_list:
            if plant.is_dead or not plant.pixels: continue
            if space.distance(head_x, head_y, plant.pixels[0].x, plant.pixels[0].y) < self.vision_radius + 50:
                for p_pixel in plant.pixels:
                    dist = space.distance(head_x, head_y, p_pixel.x, p_pixel.y)
                    if dist < min_food_dist: min_food_dist, closest_food, target_list = dist, p_pixel, plant.pixels

        closest_creature, min_creat_dist = None, self.vision_radius
        for other in all_creatures:
            if other.id == self.id or other.is_dead: continue 
            dist = space.distance(head_x, head_y, other.pixels[0].x, other.pixels[0].y)
            if dist < min_creat_dist: min_creat_dist, closest_creature = dist, other

        # --- PREPARAZIONE INPUT CERVELLO ---
        input_food_dist, input_food_angle = 1.0, 0.0
        input_creat_dist, input_creat_angle = 1.0, 0.0
        input_water_dist, input_water_angle = 1.0, 0.0
        
        input_energy = self.energy / 800.0 
        input_hydration = self.hydration / 1000.0

        if closest_food:
            input_food_dist = min_food_dist / self.vision_radius 
            dx, dy = closest_food.x - head_x, closest_food.y - head_y
            if dx > space.width / 2: dx -= space.width
            elif dx < -space.width / 2: dx += space.width
            if dy > space.height / 2: dy -= space.height
            elif dy < -space.height / 2: dy += space.height
            target_angle = math.atan2(dy, dx)
            input_food_angle = ((target_angle - self.angle + math.pi) % (2 * math.pi) - math.pi) / math.pi 
            
            if min_food_dist < 15.0:
                self.energy = min(800.0, self.energy + self.digestion_power)
                self.genome.fitness += 10.0 
                target_list.remove(closest_food)

        if closest_creature:
            input_creat_dist = min_creat_dist / self.vision_radius
            dx, dy = closest_creature.pixels[0].x - head_x, closest_creature.pixels[0].y - head_y
            if dx > space.width / 2: dx -= space.width
            elif dx < -space.width / 2: dx += space.width
            if dy > space.height / 2: dy -= space.height
            elif dy < -space.height / 2: dy += space.height
            target_angle = math.atan2(dy, dx)
            input_creat_angle = ((target_angle - self.angle + math.pi) % (2 * math.pi) - math.pi) / math.pi 

        if closest_water and not in_water:
            input_water_dist = min_water_dist / self.vision_radius
            dx, dy = closest_water["x"] - head_x, closest_water["y"] - head_y
            if dx > space.width / 2: dx -= space.width
            elif dx < -space.width / 2: dx += space.width
            if dy > space.height / 2: dy -= space.height
            elif dy < -space.height / 2: dy += space.height
            target_angle = math.atan2(dy, dx)
            input_water_angle = ((target_angle - self.angle + math.pi) % (2 * math.pi) - math.pi) / math.pi 

        # --- 3. IL CERVELLO A 8 SENSI! ---
        outputs = self.brain.activate((
            input_food_dist, input_food_angle, 
            input_creat_dist, input_creat_angle, 
            input_water_dist, input_water_angle, 
            input_energy, input_hydration
        ))
        
        turn_signal, speed_signal = outputs[0], outputs[1] 

        turn_speed = 0.2 * (3.0 / len(self.pixels))
        self.angle += turn_signal * turn_speed 
        
        actual_speed = self.max_speed * max(0.0, speed_signal) 
        if in_water: actual_speed *= 0.5 
        
        move_x = math.cos(self.angle) * actual_speed
        move_y = math.sin(self.angle) * actual_speed
        
        for p in self.pixels:
            p.x, p.y = space.wrap(p.x + move_x, p.y + move_y)

    def die(self):
        self.is_dead = True
        for p in self.pixels: p.type = "Biomass"