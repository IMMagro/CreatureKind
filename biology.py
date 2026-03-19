# biology.py
import random
from physics import Pixel, ToroidalSpace

class Plant:
    def __init__(self, id: str, start_x: float, start_y: float):
        self.id = id
        self.energy = 50.0
        self.age = 0
        self.max_age = random.randint(800, 1500) # Ogni pianta ha un'aspettativa di vita diversa
        self.is_dead = False
        
        first_cell = Pixel(id=f"{self.id}_0", x=start_x, y=start_y, pixel_type="Gastro")
        self.pixels = [first_cell]
        self.max_size = random.randint(20, 60) 

    def update(self, space: ToroidalSpace):
        """Gestisce l'intero ciclo vitale della pianta ad ogni Tick del server."""
        if self.is_dead:
            return None

        self.age += 1
        
        # 1. Morte per vecchiaia
        if self.age > self.max_age:
            self._die()
            return None

        # 2. Fotosintesi (guadagno) e Metabolismo (perdita)
        self.energy += 0.5 * len(self.pixels) # Più è grande, più sole prende
        self.energy -= 0.2 * len(self.pixels) # Più è grande, più costa mantenerla in vita

        # 3. Morte per fame (es. troppe cellule e poco sole, se in futuro mettiamo l'ombra)
        if self.energy <= 0:
            self._die()
            return None

        # 4. Crescita (aggiunge pixel locali)
        if self.energy > 150.0 and len(self.pixels) < self.max_size:
            self._grow_new_cell(space)
            self.energy -= 80.0

        # 5. Riproduzione (Lancia una spora lontana se è matura e piena di energia)
        if len(self.pixels) >= (self.max_size * 0.8) and self.energy > 300.0:
            self.energy -= 200.0 # Riprodursi costa tantissimo
            return self._spawn_spore(space)

        return None # Ritorna None se non ha generato spore in questo tick

    def _grow_new_cell(self, space: ToroidalSpace):
        parent_cell = random.choice(self.pixels)
        offset_x, offset_y = random.choice([(10, 0), (-10, 0), (0, 10), (0, -10)])
        new_x, new_y = space.wrap(parent_cell.x + offset_x, parent_cell.y + offset_y)
        new_cell = Pixel(id=f"{self.id}_{len(self.pixels)}", x=new_x, y=new_y, pixel_type="Gastro")
        self.pixels.append(new_cell)

    def _spawn_spore(self, space: ToroidalSpace):
        """Genera una nuova pianta (seme) a una certa distanza."""
        base_x = self.pixels[0].x
        base_y = self.pixels[0].y
        # Il vento trasporta la spora a max 200 unità di distanza
        offset_x = random.uniform(-200, 200)
        offset_y = random.uniform(-200, 200)
        new_x, new_y = space.wrap(base_x + offset_x, base_y + offset_y)
        
        # Generiamo un ID univoco casuale per il figlio
        child_id = f"p_{random.randint(10000, 99999)}"
        return Plant(id=child_id, start_x=new_x, start_y=new_y)

    def _die(self):
        """La pianta muore. I suoi pixel diventano Biomassa (materia organica morta)."""
        self.is_dead = True
        for p in self.pixels:
            p.type = "Biomass" # Cambiamo il tipo di pixel!
            
# Aggiungi questo in fondo a biology.py, sotto la classe Plant
import math

class PrimitiveCreature:
    """Il primo erbivoro/spazzino del mondo."""
    def __init__(self, id: str, x: float, y: float):
        self.id = id
        self.energy = 800.0 # Energia molto alta per iniziare
        self.is_dead = False
        
        # Morfologia fissa per questa creatura primordiale (Forma a "L" o triangolo)
        self.pixels = [
            Pixel(id=f"{id}_n", x=x, y=y, pixel_type="Neuro"),          # Occhio/Cervello (al centro)
            Pixel(id=f"{id}_g", x=x+10, y=y, pixel_type="Gastro"),      # Bocca (davanti)
            Pixel(id=f"{id}_p", x=x-10, y=y+10, pixel_type="Power")     # Muscolo (dietro)
        ]
        
        self.speed = 8.0 # Velocità di movimento
        self.vision_radius = 500.0 # Quanto lontano può "fiutare" il cibo

    def update(self, space: ToroidalSpace, biomass_list: list):
        """Logica di sopravvivenza della creatura."""
        if self.is_dead:
            return

        self.energy -= 1.5 # Muoversi e pensare costa energia ad ogni tick
        
        if self.energy <= 0:
            self.die()
            return

        # 1. ISTINTO: Trova il cibo più vicino (usiamo la biomassa per ora)
        closest_food = None
        min_dist = self.vision_radius
        
        # Il NeuroPixel è il centro dei sensi
        head_x = self.pixels[0].x 
        head_y = self.pixels[0].y

        for food_pixel in biomass_list:
            dist = space.distance(head_x, head_y, food_pixel.x, food_pixel.y)
            if dist < min_dist:
                min_dist = dist
                closest_food = food_pixel

        # 2. MOVIMENTO E ALIMENTAZIONE
        if closest_food:
            # Calcola l'angolo verso il cibo
            dx = closest_food.x - head_x
            dy = closest_food.y - head_y
            
            # (Risoluzione base del wrap-around per calcolare l'angolo corretto)
            if dx > space.width / 2: dx -= space.width
            elif dx < -space.width / 2: dx += space.width
            if dy > space.height / 2: dy -= space.height
            elif dy < -space.height / 2: dy += space.height

            angle = math.atan2(dy, dx)
            
            # Muove l'intera creatura verso il cibo
            move_x = math.cos(angle) * self.speed
            move_y = math.sin(angle) * self.speed
            
            for p in self.pixels:
                p.x, p.y = space.wrap(p.x + move_x, p.y + move_y)

            # MANGIARE: Se è vicinissimo al cibo, lo mangia!
            if min_dist < 15.0:
                self.energy += 150.0 # Recupera molta energia
                biomass_list.remove(closest_food) # Rimuove il pixel morto dal mondo!

    def die(self):
        self.is_dead = True
        for p in self.pixels:
            p.type = "Biomass" # Anche la creatura diventa concime quando muore