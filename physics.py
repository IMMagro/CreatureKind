import math

class ToroidalSpace:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height

    def wrap(self, x: float, y: float):
        return x % self.width, y % self.height

    def distance(self, x1: float, y1: float, x2: float, y2: float) -> float:
        dx = abs(x1 - x2)
        dy = abs(y1 - y2)
        dx = min(dx, self.width - dx)
        dy = min(dy, self.height - dy)
        return math.sqrt(dx**2 + dy**2)

class Pixel:
    def __init__(self, id: str, x: float, y: float, pixel_type: str):
        self.id = id
        self.x = x
        self.y = y
        self.type = pixel_type 
        self.energy = 100.0

    def move(self, dx: float, dy: float, space: ToroidalSpace):
        self.x, self.y = space.wrap(self.x + dx, self.y + dy)
        
class SpatialGrid:
    def __init__(self, world_width: float, world_height: float, cell_size: float):
        self.cell_size = cell_size
        self.cols = int(world_width / cell_size) + 1
        self.rows = int(world_height / cell_size) + 1
        self.grid = {}

    def clear(self):
        self.grid = {}

    def insert(self, pixel):
        col = int(pixel.x / self.cell_size) % self.cols
        row = int(pixel.y / self.cell_size) % self.rows
        key = (col, row)
        if key not in self.grid:
            self.grid[key] = []
        self.grid[key].append(pixel)

    def get_nearby(self, x: float, y: float, search_radius: float):
        nearby = []
        center_col = int(x / self.cell_size)
        center_row = int(y / self.cell_size)
        cells_to_check = int(search_radius / self.cell_size) + 1

        for dc in range(-cells_to_check, cells_to_check + 1):
            for dr in range(-cells_to_check, cells_to_check + 1):
                col = (center_col + dc) % self.cols
                row = (center_row + dr) % self.rows
                key = (col, row)
                if key in self.grid:
                    nearby.extend(self.grid[key])
        return nearby

def line_intersects_circle(p1_x, p1_y, p2_x, p2_y, c_x, c_y, r, space):
    """Calcolo ultra-veloce (Approssimato) per il Raycasting."""
    # Wrap-around rapido per il centro del bersaglio
    dx = c_x - p1_x
    dy = c_y - p1_y
    if dx > space.width / 2: dx -= space.width
    elif dx < -space.width / 2: dx += space.width
    if dy > space.height / 2: dy -= space.height
    elif dy < -space.height / 2: dy += space.height

    # Distanza dal bersaglio (Quadrato, niente radici lente!)
    dist_sq = dx**2 + dy**2
    r_sq = r**2

    # Se è già dentro, colpito all'istante (Distanza 0)
    if dist_sq <= r_sq: return True, 0.0

    line_dx = p2_x - p1_x
    line_dy = p2_y - p1_y
    
    # Trucco 1: Se il raggio è cortissimo (es. offset visivo), ignoriamo i calcoli pesanti
    line_len_sq = line_dx**2 + line_dy**2
    if line_len_sq < 0.01: return False, 0.0

    # Trucco 2: Proiezione veloce (Dot product)
    # Calcoliamo quanto il bersaglio è "in linea" col raggio
    t = (dx * line_dx + dy * line_dy) / line_len_sq

    # Se t < 0 il bersaglio è dietro. Se t > 1 è oltre il raggio visivo.
    if t < 0.0 or t > 1.0: return False, 0.0

    # Punto più vicino sul raggio al centro del bersaglio
    closest_dx = dx - (t * line_dx)
    closest_dy = dy - (t * line_dy)
    
    # La distanza minima (al quadrato) tra il raggio e il centro del cerchio
    if (closest_dx**2 + closest_dy**2) <= r_sq:
        # Colpito! Ritorniamo una distanza approssimata (il centro proiettato)
        return True, max(0.0, math.sqrt(dist_sq) - r)

    return False, 0.0