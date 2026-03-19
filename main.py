import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

# ==========================================
# ⚙️ ENGINE: Il Loop del Motore di Gioco
# ==========================================
class GameEngine:
    def __init__(self):
        self.tick = 0
        self.running = False
        self.tps = 30 # Ticks Per Second (30 aggiornamenti al secondo)

    async def loop(self):
        """Il cuore pulsante dell'universo di CreatureKind"""
        self.running = True
        print(f"🌍 Motore di CreatureKind avviato a {self.tps} TPS...")
        
        while self.running:
            self.tick += 1
            
            # Qui in futuro chiameremo:
            # - physics.update()
            # - biology.process_neat()
            # - eggs.check_timers()
            
            # Stampa un log ogni 30 tick (1 secondo reale) per non intasare il terminale
            if self.tick % self.tps == 0:
                print(f"⏳ Server Tick: {self.tick}")
                
            # Mette in pausa la funzione per mantenere i 30 TPS stabili
            await asyncio.sleep(1 / self.tps)

# Istanziamo il nostro motore globale
engine = GameEngine()

# ==========================================
# 🌐 NETWORK: Inizializzazione Server
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Eseguito all'avvio del server: facciamo partire il Loop in background
    task = asyncio.create_task(engine.loop())
    yield
    # Eseguito allo spegnimento del server: fermiamo il Loop
    engine.running = False
    task.cancel()
    print("🛑 Motore di CreatureKind fermato.")

app = FastAPI(lifespan=lifespan, title="CreatureKind Server")

# Endpoint WebSocket per la comunicazione con Angular
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("🟢 Un client si è connesso (Observer/Giocatore)!")
    try:
        while True:
            # Per ora, quando il client ci manda qualsiasi cosa,
            # noi rispondiamo con il Tick corrente del server.
            data = await websocket.receive_text()
            await websocket.send_json({
                "message": "Stato Server",
                "current_tick": engine.tick
            })
    except WebSocketDisconnect:
        print("🔴 Il client si è disconnesso.")