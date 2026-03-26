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
    dx = c_x - p1_x
    dy = c_y - p1_y
    if dx > space.width / 2: c_x -= space.width
    elif dx < -space.width / 2: c_x += space.width
    if dy > space.height / 2: c_y -= space.height
    elif dy < -space.height / 2: c_y += space.height

    line_dx = p2_x - p1_x
    line_dy = p2_y - p1_y
    line_len = math.sqrt(line_dx**2 + line_dy**2)
    if line_len == 0: return False, 0.0

    dir_x = line_dx / line_len
    dir_y = line_dy / line_len
    t_x = c_x - p1_x
    t_y = c_y - p1_y
    projection = t_x * dir_x + t_y * dir_y

    if projection < 0 or projection > line_len:
        dist_to_center = math.sqrt(dx**2 + dy**2)
        if dist_to_center <= r: return True, dist_to_center
        return False, 0.0

    closest_x = p1_x + dir_x * projection
    closest_y = p1_y + dir_y * projection
    dist_to_line = math.sqrt((c_x - closest_x)**2 + (c_y - closest_y)**2)

    if dist_to_line <= r:
        dist_to_hit = projection - math.sqrt(r**2 - dist_to_line**2)
        return True, max(0.0, dist_to_hit)

    return False, 0.0