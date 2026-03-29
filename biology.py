import neat
import math
import random
from physics import Pixel, ToroidalSpace, SpatialGrid, line_intersects_circle

class Plant:
    def __init__(self, id: str, start_x: float, start_y: float, is_near_water: bool = False, is_in_water: bool = False):
        self.id = id
        self.energy = 100.0
        self.is_dead = False
        self.pixels = [Pixel(id=f"{self.id}_0", x=start_x, y=start_y, pixel_type="Gastro")]
        self.max_size = random.randint(10, 30) 
        self.is_near_water = is_near_water
        self.is_in_water = is_in_water

    def update(self, space: ToroidalSpace):
        if self.is_dead: return None
        if not self.pixels:
            self._die()
            return None

        if self.is_in_water:
            self.energy -= 0.5 * len(self.pixels)
        else:
            green_pixels = sum(1 for p in self.pixels if p.type == "Gastro")
            efficiency = 3.0 if self.is_near_water else 0.5 
            self.energy += efficiency * green_pixels
            
            metabolism_cost = sum(0.3 if p.type == "Gastro" else 0.05 for p in self.pixels)
            self.energy -= metabolism_cost

        if self.energy <= 0:
            self._die()
            return None

        if self.energy > 300.0 and len(self.pixels) < self.max_size:
            self._grow_new_cell(space)
            self.energy -= 150.0 
            if len(self.pixels) > 10 and random.random() < 0.3:
                old_pixel = self.pixels[random.randint(0, min(5, len(self.pixels)-1))]
                old_pixel.type = "Wood"

        if len(self.pixels) >= (self.max_size * 0.9) and self.energy > 800.0:
            self.energy -= 500.0 
            return self._spawn_spore(space)

        return None 

    def _grow_new_cell(self, space: ToroidalSpace):
        green_cells = [p for p in self.pixels if p.type == "Gastro"]
        parent = random.choice(green_cells) if green_cells else random.choice(self.pixels)
        offset_x, offset_y = random.choice([(10, 0), (-10, 0), (0, 10), (0, -10)])
        new_x, new_y = space.wrap(parent.x + offset_x, parent.y + offset_y)
        self.pixels.append(Pixel(id=f"{self.id}_{len(self.pixels)}", x=new_x, y=new_y, pixel_type="Gastro"))

    def _spawn_spore(self, space: ToroidalSpace):
        base_x, base_y = self.pixels[0].x, self.pixels[0].y
        offset_x, offset_y = random.uniform(-400, 400), random.uniform(-400, 400)
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
        self.hydration = 1000.0 
        self.age = 0 
        self.is_dead = False
        self.mating_cooldown = 0 
        self.genome = genome
        self.genome.fitness = 0.0 
        
        self.brain = neat.nn.RecurrentNetwork.create(genome, neat_config)
        self.morphology = morphology 
        
        self.pixels = []
        num_power, num_gastro = 0, 0
        for i, (p_type, dx, dy) in enumerate(self.morphology):
            self.pixels.append(Pixel(id=f"{id}_{i}", x=x+dx, y=y+dy, pixel_type=p_type))
            if p_type == "Power": num_power += 1
            if p_type == "Gastro": num_gastro += 1
            
        self.max_speed = 8.0 + (num_power * 4.0) 
        self.digestion_power = 50.0 + (num_gastro * 50.0) 
        self.base_metabolism = 1.5 + (max(0, len(self.pixels) - 3) * 0.5)
        
        self.vision_radius = 600.0 
        self.angle = random.uniform(0, 2 * math.pi) 

        # Memoria visiva per la "Vista Pigra"
        self.eye_food = [0.0] * 5
        self.eye_creat = [0.0] * 5
        self.eye_water = [0.0] * 5

    def update(self, space: ToroidalSpace, flora_list: list, biomass_list: list, all_creatures: list, water_zones: list, spatial_grid: SpatialGrid):
        if self.is_dead: return
        if not self.pixels:
            self.die()
            return

        self.age += 1
        age_penalty = max(0.0, (self.age - 5000) / 1000.0)
        self.energy -= (self.base_metabolism + age_penalty)
        self.hydration -= 2.0 
        self.genome.fitness += 0.1 
        
        if self.mating_cooldown > 0: self.mating_cooldown -= 1
        if self.energy <= 0 or self.hydration <= 0:
            self.die()
            return

        head_x, head_y = self.pixels[0].x, self.pixels[0].y

        # ========================================================
        # FASE 1: IL MORSO (CALCOLATO SEMPRE, MA SOLO A CORTA DISTANZA)
        # ========================================================
        closest_food, min_food_dist, target_list = None, 20.0, None
        
        # Cerca Biomassa vicinissima (Raggio 20)
        nearby_biomass = spatial_grid.get_nearby(head_x, head_y, 20.0)
        for b_pixel in nearby_biomass:
            dist = space.distance(head_x, head_y, b_pixel.x, b_pixel.y)
            if dist < min_food_dist: min_food_dist, closest_food, target_list = dist, b_pixel, biomass_list

        # Cerca Foglie di Pianta vicinissime (Solo se il tronco dell'albero è a max 150px)
        for plant in flora_list:
            if plant.is_dead or not plant.pixels: continue
            if space.distance(head_x, head_y, plant.pixels[0].x, plant.pixels[0].y) < 150.0:
                for p_pixel in plant.pixels:
                    if p_pixel.type == "Wood": continue
                    dist = space.distance(head_x, head_y, p_pixel.x, p_pixel.y)
                    if dist < min_food_dist: min_food_dist, closest_food, target_list = dist, p_pixel, plant.pixels

        if closest_food and min_food_dist < 15.0:
            self.energy = min(1500.0, self.energy + self.digestion_power)
            self.genome.fitness += 15.0 
            target_list.remove(closest_food)

        # Controlla se sta fisicamente dentro l'acqua per bere
        in_water = False
        for w in water_zones:
            if space.distance(head_x, head_y, w["x"], w["y"]) <= w["radius"]:
                in_water = True
                self.hydration = min(1000.0, self.hydration + 50.0)
                self.genome.fitness += 1.0 
                break

        # ========================================================
        # FASE 2: LA VISTA (CALCOLATA SOLO OGNI 3 TICK PER RISPARMIARE CPU!)
        # ========================================================
        if self.age % 3 == 0:
            self.eye_food = [0.0] * 5
            self.eye_creat = [0.0] * 5
            self.eye_water = [0.0] * 5

            eye_angles = [-math.pi/4, -math.pi/9, 0, math.pi/9, math.pi/4]
            rays = []
            for offset_angle in eye_angles:
                ray_angle = self.angle + offset_angle
                ray_end_x = head_x + math.cos(ray_angle) * self.vision_radius
                ray_end_y = head_y + math.sin(ray_angle) * self.vision_radius
                rays.append((ray_end_x, ray_end_y))

            # Guarda l'acqua
            for w in water_zones:
                for i, (end_x, end_y) in enumerate(rays):
                    hit, dist = line_intersects_circle(head_x, head_y, end_x, end_y, w["x"], w["y"], w["radius"], space)
                    if hit:
                        signal = max(0.0, 1.0 - (dist / self.vision_radius))
                        if signal > self.eye_water[i]: self.eye_water[i] = signal

            # Guarda la Biomassa (usando la Grid)
            nearby_vision_biomass = spatial_grid.get_nearby(head_x, head_y, self.vision_radius)
            for b_pixel in nearby_vision_biomass:
                for i, (end_x, end_y) in enumerate(rays):
                    hit, hit_dist = line_intersects_circle(head_x, head_y, end_x, end_y, b_pixel.x, b_pixel.y, 15.0, space)
                    if hit:
                        signal = max(0.0, 1.0 - (hit_dist / self.vision_radius))
                        if signal > self.eye_food[i]: self.eye_food[i] = signal

            # Guarda il TRONCO delle piante (Ignora le foglie per non laggare!)
            for plant in flora_list:
                if plant.is_dead or not plant.pixels: continue
                if space.distance(head_x, head_y, plant.pixels[0].x, plant.pixels[0].y) < self.vision_radius + 50:
                    for i, (end_x, end_y) in enumerate(rays):
                        hit, hit_dist = line_intersects_circle(head_x, head_y, end_x, end_y, plant.pixels[0].x, plant.pixels[0].y, 30.0, space)
                        if hit:
                            signal = max(0.0, 1.0 - (hit_dist / self.vision_radius))
                            if signal > self.eye_food[i]: self.eye_food[i] = signal

            # Guarda le altre creature
            for other in all_creatures:
                if other.id == self.id or other.is_dead: continue
                if space.distance(head_x, head_y, other.pixels[0].x, other.pixels[0].y) < self.vision_radius:
                    for i, (end_x, end_y) in enumerate(rays):
                        hit, hit_dist = line_intersects_circle(head_x, head_y, end_x, end_y, other.pixels[0].x, other.pixels[0].y, 25.0, space)
                        if hit:
                            signal = max(0.0, 1.0 - (hit_dist / self.vision_radius))
                            if signal > self.eye_creat[i]: self.eye_creat[i] = signal

        # ========================================================
        # FASE 3: IL CERVELLO
        # ========================================================
        input_energy = self.energy / 800.0 
        input_hydration = self.hydration / 1000.0
        
        brain_inputs = self.eye_food + self.eye_creat + self.eye_water + [input_energy, input_hydration]
        outputs = self.brain.activate(brain_inputs)
        
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