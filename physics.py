# physics.py
import math

class ToroidalSpace:
    """Rappresenta il mondo senza bordi di CreatureKind."""
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height

    def wrap(self, x: float, y: float):
        """
        La magia del mondo toroidale: se superi il bordo destro, 
        ricompari a sinistra. Se superi il basso, ricompari in alto.
        """
        return x % self.width, y % self.height

    def distance(self, x1: float, y1: float, x2: float, y2: float) -> float:
        """
        Calcola la distanza reale tra due punti.
        In un mondo toroidale, a volte la strada più breve è attraversare il bordo!
        """
        dx = abs(x1 - x2)
        dy = abs(y1 - y2)
        
        # Sceglie il percorso più breve (diretto vs attraverso il bordo)
        dx = min(dx, self.width - dx)
        dy = min(dy, self.height - dy)
        
        return math.sqrt(dx**2 + dy**2)

class Pixel:
    """La particella elementare di base del gioco."""
    def __init__(self, id: str, x: float, y: float, pixel_type: str):
        self.id = id
        self.x = x
        self.y = y
        self.type = pixel_type # Può essere "Neuro", "Gastro", o "Power"
        self.energy = 100.0

    def move(self, dx: float, dy: float, space: ToroidalSpace):
        """Muove il pixel tenendo conto dell'avvolgimento spaziale."""
        # Sommiamo lo spostamento e passiamo le nuove coordinate alla funzione wrap
        self.x, self.y = space.wrap(self.x + dx, self.y + dy)