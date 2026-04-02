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
        self.age = 0 
        self.is_dead = False
        
        # --- OMEOSTASI PRIMARIA ---
        self.vitality = 100.0   # Salute fisica (0 = Morte)
        self.energy = 800.0     # Riserve di cibo
        self.hydration = 1000.0 # Riserve d'acqua
        
        # --- SISTEMA ENDOCRINO E FISIOLOGICO (Novità!) ---
        self.lactic_acid = 0.0  # Fatica muscolare a breve termine
        self.exhaustion = 0.0   # Sonno/Fatica neurale
        self.is_sleeping = False
        self.heat = 36.0        # Temperatura corporea (Se > 40° suda e perde acqua)
        self.pain = 0.0         # Sensore di danno istantaneo
        
        self.mating_cooldown = 0 
        self.genome = genome
        self.genome.fitness = 0.0 
        self.brain = neat.nn.RecurrentNetwork.create(genome, neat_config)
        
        # --- ONTOGENESI E MORFOLOGIA ---
        # Il DNA contiene la forma "Adulta". La creatura nasce piccola (scale = 0.5)
        self.dna_morphology = morphology 
        self.growth_scale = 0.5  # Parte al 50% della grandezza
        self.pixels = []
        
        self.num_power = 0
        self.num_gastro = 0
        for (p_type, dx, dy) in self.dna_morphology:
            if p_type == "Power": self.num_power += 1
            if p_type == "Gastro": self.num_gastro += 1
            # I pixel nascono "vicini" al centro
            self.pixels.append(Pixel(id=f"{id}_{len(self.pixels)}", x=x+(dx*self.growth_scale), y=y+(dy*self.growth_scale), pixel_type=p_type))
            
        self.angle = random.uniform(0, 2 * math.pi) 
        self.eye_food = [0.0] * 5
        self.eye_creat = [0.0] * 5
        self.eye_water = [0.0] * 5

    def update(self, space: ToroidalSpace, flora_list: list, biomass_list: list, all_creatures: list, water_zones: list, spatial_grid: SpatialGrid):
        if self.is_dead: return
        if not self.pixels:
            self.die()
            return

        self.age += 1
        self.genome.fitness += 0.1 
        if self.mating_cooldown > 0: self.mating_cooldown -= 1
        
        # Il dolore svanisce velocemente se non viene ri-attivato
        self.pain = max(0.0, self.pain - 0.2)
        
        head_x, head_y = self.pixels[0].x, self.pixels[0].y

        # ========================================================
        # FASE 1: I SENSI ESTERNI E L'AMBIENTE
        # ========================================================
        closest_food, min_food_dist, target_list = None, 20.0 * self.growth_scale, None
        nearby_biomass = spatial_grid.get_nearby(head_x, head_y, 25.0)
        
        for b_pixel in nearby_biomass:
            dist = space.distance(head_x, head_y, b_pixel.x, b_pixel.y)
            if dist < min_food_dist: min_food_dist, closest_food, target_list = dist, b_pixel, biomass_list

        for plant in flora_list:
            if plant.is_dead or not plant.pixels: continue
            if space.distance(head_x, head_y, plant.pixels[0].x, plant.pixels[0].y) < 150.0:
                for p_pixel in plant.pixels:
                    if p_pixel.type == "Wood": continue
                    dist = space.distance(head_x, head_y, p_pixel.x, p_pixel.y)
                    if dist < min_food_dist: min_food_dist, closest_food, target_list = dist, p_pixel, plant.pixels

        # Fisiologia della Digestione (Cresce con la stazza!)
        digestion_power = (50.0 + (self.num_gastro * 50.0)) * self.growth_scale
        
        if closest_food and min_food_dist < 15.0:
            self.energy = min(2000.0, self.energy + digestion_power)
            self.genome.fitness += 15.0 
            target_list.remove(closest_food)

        in_water = False
        for w in water_zones:
            if space.distance(head_x, head_y, w["x"], w["y"]) <= w["radius"]:
                in_water = True
                self.hydration = min(1000.0, self.hydration + 50.0)
                self.heat = max(36.0, self.heat - 1.0) # L'acqua raffredda il corpo!
                self.genome.fitness += 1.0 
                break

        # SGUARDO VETTORIALE (Scalato in base alla crescita: creature grandi vedono più lontano!)
        vision_radius = 400.0 + (200.0 * self.growth_scale)
        
        if not self.is_sleeping and self.age % 3 == 0:
            self.eye_food = [0.0] * 5
            self.eye_creat = [0.0] * 5
            self.eye_water = [0.0] * 5
            eye_angles = [-math.pi/4, -math.pi/9, 0, math.pi/9, math.pi/4]
            rays = []
            for offset_angle in eye_angles:
                ray_angle = self.angle + offset_angle
                ray_end_x = head_x + math.cos(ray_angle) * vision_radius
                ray_end_y = head_y + math.sin(ray_angle) * vision_radius
                rays.append((ray_end_x, ray_end_y))

            for w in water_zones:
                for i, (end_x, end_y) in enumerate(rays):
                    hit, dist = line_intersects_circle(head_x, head_y, end_x, end_y, w["x"], w["y"], w["radius"], space)
                    if hit:
                        signal = max(0.0, 1.0 - (dist / vision_radius))
                        if signal > self.eye_water[i]: self.eye_water[i] = signal

            nearby_vision_biomass = spatial_grid.get_nearby(head_x, head_y, vision_radius)
            for b_pixel in nearby_vision_biomass:
                for i, (end_x, end_y) in enumerate(rays):
                    hit, hit_dist = line_intersects_circle(head_x, head_y, end_x, end_y, b_pixel.x, b_pixel.y, 15.0, space)
                    if hit:
                        signal = max(0.0, 1.0 - (hit_dist / vision_radius))
                        if signal > self.eye_food[i]: self.eye_food[i] = signal

            for plant in flora_list:
                if plant.is_dead or not plant.pixels: continue
                if space.distance(head_x, head_y, plant.pixels[0].x, plant.pixels[0].y) < vision_radius + 50:
                    for i, (end_x, end_y) in enumerate(rays):
                        hit, hit_dist = line_intersects_circle(head_x, head_y, end_x, end_y, plant.pixels[0].x, plant.pixels[0].y, 30.0, space)
                        if hit:
                            signal = max(0.0, 1.0 - (hit_dist / vision_radius))
                            if signal > self.eye_food[i]: self.eye_food[i] = signal

            for other in all_creatures:
                if other.id == self.id or other.is_dead: continue
                if space.distance(head_x, head_y, other.pixels[0].x, other.pixels[0].y) < vision_radius:
                    for i, (end_x, end_y) in enumerate(rays):
                        # L'ingombro visivo dipende dalla grandezza dell'altra creatura
                        hit, hit_dist = line_intersects_circle(head_x, head_y, end_x, end_y, other.pixels[0].x, other.pixels[0].y, 25.0 * other.growth_scale, space)
                        if hit:
                            signal = max(0.0, 1.0 - (hit_dist / vision_radius))
                            if signal > self.eye_creat[i]: self.eye_creat[i] = signal

        # ========================================================
        # FASE 2: IL SISTEMA ENDOCRINO E IL CERVELLO
        # ========================================================
        
        if self.is_sleeping:
            turn_signal, speed_signal = 0.0, 0.0
            self.exhaustion = max(0.0, self.exhaustion - 10.0)
            self.lactic_acid = max(0.0, self.lactic_acid - 5.0)
            self.heat = max(36.0, self.heat - 0.5)
            if self.exhaustion <= 0.0: self.is_sleeping = False
        else:
            # GLI ORMONI (DRIVES): Non sono lineari, ma Esponenziali!
            # Più ha fame, più il segnale "Urla" nel cervello, sovrastando la logica.
            drive_hunger = 0.0 if self.energy > 600 else ((600 - self.energy) / 600.0) ** 2
            drive_thirst = 0.0 if self.hydration > 400 else ((400 - self.hydration) / 400.0) ** 2
            
            # Stanchezza e Dolore (Propriocezione)
            input_lactic = self.lactic_acid / 100.0   
            input_exhaustion = self.exhaustion / 1000.0 
            input_pain = self.pain
            
            # IL CERVELLO RICEVE 19 INPUT (Gli Occhi + I 5 Sensi Omeostatici/Ormonali)
            brain_inputs = self.eye_food + self.eye_creat + self.eye_water + [drive_hunger, drive_thirst, input_lactic, input_exhaustion]
            # Assicuriamoci che la rete neurale sia configurata per 22 input (15 occhi + 7 sensi)
            # SE LA RETE NE HA 19 nel file txt, usiamo solo:
            brain_inputs = self.eye_food + self.eye_creat + self.eye_water + [drive_hunger, drive_thirst, input_lactic, input_pain]
            
            outputs = self.brain.activate(brain_inputs)
            turn_signal, speed_signal = outputs[0], outputs[1] 

        # ========================================================
        # FASE 3: IL CORPO E LA SENESCENZA
        # ========================================================
        
        # LA VECCHIAIA: Col passare del tempo, i muscoli perdono forza e il metabolismo costa di più
        senescence_factor = max(0.0, (self.age - 6000) / 4000.0) # Inizia a invecchiare a 6000 tick
        
        # Il peso rallenta la sterzata e la velocità massima
        weight_penalty = 1.0 / max(1.0, (len(self.pixels) * self.growth_scale * 0.5))
        turn_speed = 0.3 * weight_penalty
        self.angle += turn_signal * turn_speed 
        
        # I muscoli invecchiati rendono meno!
        base_max_speed = 6.0 + (self.num_power * 4.0) 
        muscle_efficiency = max(0.2, 1.0 - senescence_factor)
        intended_speed = base_max_speed * muscle_efficiency * max(0.0, speed_signal) 
        
        fatigue_penalty = 1.0 - (self.lactic_acid / 200.0) 
        actual_speed = intended_speed * fatigue_penalty
        
        if in_water: actual_speed *= 0.5 

        # FISIOLOGIA DELL'AZIONE E TERMOREGOLAZIONE
        action_intensity = actual_speed / base_max_speed
        
        if action_intensity > 0.5:
            self.lactic_acid = min(100.0, self.lactic_acid + (action_intensity * (self.num_power+1)))
            self.heat += action_intensity * 0.1 # Correre scalda!
        else:
            self.lactic_acid = max(0.0, self.lactic_acid - 2.0)
            self.heat = max(36.0, self.heat - 0.05)
            
        if not self.is_sleeping:
            self.exhaustion += 1.0 + (action_intensity * 2.0)
            if self.exhaustion >= 1000.0:
                self.is_sleeping = True

        # METABOLISMO BASALE E SENESCENZA (Crescere costa!)
        basal_metabolism = (0.5 + (len(self.pixels) * self.growth_scale * 0.3)) * (1.0 + senescence_factor)
        total_energy_drain = basal_metabolism + (action_intensity * 2.5)
        
        # ADRENALINA E SUDORE
        if self.energy < 200.0 and not self.is_sleeping: 
            actual_speed *= 1.3 # Ultimo scatto per sopravvivere
            total_energy_drain *= 1.5 
            
        if self.is_sleeping: total_energy_drain *= 0.5 
            
        self.energy -= total_energy_drain
        
        # LA SETE: Aumenta drasticamente se la creatura ha caldo!
        sweat_factor = 1.0 + max(0.0, (self.heat - 38.0) * 0.5)
        self.hydration -= (2.0 * sweat_factor) if not self.is_sleeping else 1.0

        # DANNO E CURA
        if self.energy <= 0 or self.hydration <= 0:
            self.vitality -= 2.0 
            self.pain = 1.0 # Prova un dolore atroce per la fame/sete!
        else:
            self.vitality = min(100.0, self.vitality + 0.5)

        if self.vitality <= 0:
            self.die()
            return

        # ========================================================
        # FASE 4: L'ONTOGENESI (CRESCITA FISICA) E MOVIMENTO
        # ========================================================
        
        # Se ha molta energia (Surplus), la converte in Crescita Strutturale (fino al 100% del DNA)
        if self.energy > 1200 and self.growth_scale < 1.0:
            self.growth_scale += 0.005 # Cresce lentamente
            self.energy -= 5.0 # Crescere costa energia
            
            # Riapplica la scala ai pixel fisici (Si "Gonfia" visivamente a schermo!)
            head_x, head_y = self.pixels[0].x, self.pixels[0].y
            for i, p in enumerate(self.pixels):
                dna_dx, dna_dy = self.dna_morphology[i][1], self.dna_morphology[i][2]
                p.x = space.wrap(head_x + (dna_dx * self.growth_scale), p.y)[0]
                p.y = space.wrap(p.x, head_y + (dna_dy * self.growth_scale))[1]

        move_x = math.cos(self.angle) * actual_speed
        move_y = math.sin(self.angle) * actual_speed
        
        for p in self.pixels:
            p.x, p.y = space.wrap(p.x + move_x, p.y + move_y)

    def die(self):
        self.is_dead = True
        for p in self.pixels: p.type = "Biomass"