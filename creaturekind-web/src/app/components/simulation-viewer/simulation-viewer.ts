import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { Router } from '@angular/router'; 
import { ChangeDetectorRef } from '@angular/core'; 

@Component({
  selector: 'app-simulation-viewer',
  standalone: true, 
  imports: [CommonModule], 
  templateUrl: './simulation-viewer.html', 
  styleUrls: ['./simulation-viewer.scss']  
})

export class SimulationViewerComponent implements AfterViewInit, OnDestroy {
  public currentTool: 'inspect' | 'food' | 'smite' = 'inspect'; // Di base si ispeziona
  @ViewChild('worldCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('previewCanvas', { static: false }) previewCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('brainCanvas', { static: false }) brainCanvasRef?: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private ws!: WebSocket;
  private loopInterval: any;

  private readonly WORLD_WIDTH = 6400;
  private readonly WORLD_HEIGHT = 3600;

  // --- LA TELECAMERA ---
  private camera = {
    x: 0,
    y: 0,
    zoom: 1.0 // 1.0 = Vista intera schiacciata. 4.0 = Ingrandito 4 volte.
  };
  
  // Variabili per il trascinamento (Drag & Pan)
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  public hudData: any = null;
  // IL NUOVO SENSOSRE DI PERFORMANCE
  public renderedPixelsCount = 0;
  public trackedInfo: any = null;
  private trackedCreatureId: string | null = null;
  public loggedUserEmail: string = '';
  public divineError: string | null = null;

  constructor(private router: Router, private cdr: ChangeDetectorRef) {
    // Inizializziamo la telecamera al centro del mondo, con uno zoom che ci fa vedere un bel pezzo
    this.camera.x = this.WORLD_WIDTH / 2;
    this.camera.y = this.WORLD_HEIGHT / 2;
    this.camera.zoom = 1.0; 
  }
  public setTool(tool: 'inspect' | 'food' | 'smite') {
    this.currentTool = tool;
  }
  public goHome() { this.router.navigate(['/']); }

  public closeInspection() {
    this.trackedCreatureId = null;
    this.trackedInfo = null;
  }

  ngAfterViewInit(): void {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.resizeCanvas();
    this.setupCameraControls(); // Inizializza i comandi del mouse
    // Leggiamo chi siamo dal localStorage
    const savedUser = localStorage.getItem('user_data');
    if (savedUser) {
      this.loggedUserEmail = JSON.parse(savedUser).email;
    }
    this.connectWebSocket();
  }

  ngOnDestroy(): void {
    if (this.ws) this.ws.close();
    if (this.loopInterval) clearInterval(this.loopInterval);
  }

  @HostListener('window:resize')
  onResize() { this.resizeCanvas(); }

  private resizeCanvas() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = canvas.parentElement!.clientWidth; 
    canvas.height = canvas.parentElement!.clientHeight;
  }

  // --- I CONTROLLI DELLA TELECAMERA (ZOOM E DRAG) ---
  private setupCameraControls() {
    const canvas = this.canvasRef.nativeElement;

    // SCROLL DEL MOUSE (ZOOM)
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      
      const zoomSensitivity = 0.1;
      // Se scorri su (negativo), ingrandisci. Giù, rimpicciolisci.
      const zoomChange = event.deltaY < 0 ? (1 + zoomSensitivity) : (1 - zoomSensitivity);
      
      this.camera.zoom *= zoomChange;
      
      // Limiti dello zoom (Non andiamo né nello spazio profondo né nei quark)
      this.camera.zoom = Math.max(0.1, Math.min(this.camera.zoom, 10.0));
      
      // Se c'è un bersaglio, lo zoomamo senza perdere il tracciamento
    });

    // TRASCINAMENTO (PAN)
    canvas.addEventListener('mousedown', (event) => {
      // Usiamo il tasto centrale (rotellina) o il sinistro per spostare la mappa
      if (event.button === 0 || event.button === 1) {
        this.isDragging = true;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
      }
    });

    canvas.addEventListener('mousemove', (event) => {
      if (!this.isDragging) return;
      
      // Calcoliamo di quanto si è mosso il mouse
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      
      // Spostiamo la telecamera al contrario (effetto trascinamento naturale)
      // Diviso per lo zoom, così se siamo molto ingranditi la mappa si muove più lentamente
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      
      // Manteniamo la telecamera dentro il mondo (Wrap-Around Visivo Base)
      this.camera.x = (this.camera.x + this.WORLD_WIDTH) % this.WORLD_WIDTH;
      this.camera.y = (this.camera.y + this.WORLD_HEIGHT) % this.WORLD_HEIGHT;

      this.dragStartX = event.clientX;

      this.dragStartY = event.clientY;
      
      // Se stiamo trascinando la visuale, sganciamo l'ispezione della creatura
      
    });

    canvas.addEventListener('mouseup', () => this.isDragging = false);
    canvas.addEventListener('mouseleave', () => this.isDragging = false);
  }

  // --- MATEMATICA DELLO SCERMO (WORLD TO SCREEN) ---
  private worldToScreen(worldX: number, worldY: number) {
    const canvas = this.canvasRef.nativeElement;
    
    // Calcoliamo la distanza del pixel dal centro della telecamera
    let dx = worldX - this.camera.x;
    let dy = worldY - this.camera.y;

    // Gestione del mondo Toroidale (Se un pixel è sull'altro lato del mondo, ce lo fa vedere "vicino" se la telecamera è sul bordo)
    if (dx > this.WORLD_WIDTH / 2) dx -= this.WORLD_WIDTH;
    if (dx < -this.WORLD_WIDTH / 2) dx += this.WORLD_WIDTH;
    if (dy > this.WORLD_HEIGHT / 2) dy -= this.WORLD_HEIGHT;
    if (dy < -this.WORLD_HEIGHT / 2) dy += this.WORLD_HEIGHT;

    // Applichiamo lo Zoom e lo centriamo sullo schermo del computer
    const screenX = (canvas.width / 2) + (dx * this.camera.zoom);
    const screenY = (canvas.height / 2) + (dy * this.camera.zoom);

    return { x: screenX, y: screenY };
  }

  private screenToWorld(screenX: number, screenY: number) {
    const canvas = this.canvasRef.nativeElement;
    
    // Distanza dal centro dello schermo divisa per lo zoom
    const dx = (screenX - canvas.width / 2) / this.camera.zoom;
    const dy = (screenY - canvas.height / 2) / this.camera.zoom;

    // Aggiungiamo la posizione della telecamera e gestiamo l'universo circolare (Wrap-around)
    let worldX = (this.camera.x + dx) % this.WORLD_WIDTH;
    let worldY = (this.camera.y + dy) % this.WORLD_HEIGHT;

    // Se le coordinate sono negative, riportale nel range positivo (0-6400)
    if (worldX < 0) worldX += this.WORLD_WIDTH;
    if (worldY < 0) worldY += this.WORLD_HEIGHT;

    return { x: worldX, y: worldY };
  }

  // --- WEBSOCKET E RENDERING ---
  private connectWebSocket() {
    this.ws = new WebSocket('ws://127.0.0.1:8000/ws');

    this.ws.onopen = () => {
      this.loopInterval = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: "req", track_id: this.trackedCreatureId }));
        }
      }, 1000 / 30);
    };

    this.ws.onmessage = (event) => {
      if (!event.data.startsWith('{')) return;
      const data = JSON.parse(event.data);
      // Aggiornamento Crediti istantaneo
      if (data.type === "credit_update") {
        // Se Python ci dice che abbiamo speso soldi, aggiorniamo il localStorage segretamente
        const savedUser = localStorage.getItem('user_data');
        if (savedUser) {
          let parsed = JSON.parse(savedUser);
          parsed.dna_credits = data.credits;
          localStorage.setItem('user_data', JSON.stringify(parsed));
        }
        return;
      }

      // Errore Divino (Es: Crediti finiti)
      if (data.type === "error") {
        this.divineError = data.message;
        setTimeout(() => this.divineError = null, 3000); // Il messaggio sparisce dopo 3 secondi
        this.cdr.detectChanges();
        return;
      }

      if (data.type === "tracking_id") {
        this.trackedCreatureId = data.id;
        return;
      }

      if (data.type === "world_state" || data.pixels) {
        if (this.trackedCreatureId && !data.tracked_info) {
          this.trackedCreatureId = null;
          this.trackedInfo = null;
        }

        this.hudData = data;
        this.trackedInfo = data.tracked_info;
        
        // AUTO-FOLLOW: Se ispezioniamo una creatura, la telecamera la segue!
        if (this.trackedInfo && data.pixels) {
            // Troviamo il cervello della creatura ispezionata per centrare la telecamera
            // (È un po' un hack visivo, ma funziona benissimo)
            const trackedPixel = data.pixels.find((p: any) => p[0] === "Neuro" && p[3] === this.trackedCreatureId);
            if (trackedPixel) {
                this.camera.x = trackedPixel[1];
                this.camera.y = trackedPixel[2];
            }
        }

        this.cdr.detectChanges(); 
        
        if (this.trackedInfo && this.trackedInfo.morphology) {
          this.drawCreaturePreview(this.trackedInfo.morphology);
        }
        
        // NUOVO: SE HA UN CERVELLO, DISEGNALO!
        if (this.trackedInfo && this.trackedInfo.brain) {
          this.drawBrain(this.trackedInfo.brain);
        }

        // Disegna il mondo
        this.drawWorld(data.pixels, data.water_zones);

        this.drawWorld(data.pixels, data.water_zones);
      }
    };
  }

  // --- DISEGNO DEL MONDO OTTIMIZZATO (VIEWPORT CULLING) ---
  private drawWorld(pixels: any[], waterZones: any[]) {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Le cose appaiono più grandi quando si fa Zoom
    const renderSize = Math.max(2, 10 * this.camera.zoom); 

    // --- 1. L'ACQUA (Mappa Fissa, Profondità 8-bit, Segue la Telecamera!) ---
    // --- 1. L'ACQUA (FUSIONE FLUIDA TRAMITE "METABALLS") ---
    if (waterZones && waterZones.length > 0) {
      const waterWorldSize = 15; // Dimensione del pixel d'acqua nel mondo
      
      // La Mappa che accumulerà la "Pressione" dell'acqua
      const waterMap = new Map<string, { worldX: number, worldY: number, influence: number }>();

      // FASE A: Calcoliamo l'influenza di tutti i laghi fusi insieme
      waterZones.forEach(w => {
        const startX = Math.floor((w.x - w.radius) / waterWorldSize) * waterWorldSize;
        const endX = Math.ceil((w.x + w.radius) / waterWorldSize) * waterWorldSize;
        const startY = Math.floor((w.y - w.radius) / waterWorldSize) * waterWorldSize;
        const endY = Math.ceil((w.y + w.radius) / waterWorldSize) * waterWorldSize;

        for (let x = startX; x <= endX; x += waterWorldSize) {
          for (let y = startY; y <= endY; y += waterWorldSize) {
            
            const dx = x - w.x;
            const dy = y - w.y;
            const distSquared = dx * dx + dy * dy;
            const radiusSquared = w.radius * w.radius;

            if (distSquared <= radiusSquared) {
              // Formula Metaball: l'influenza è 1.0 al centro e 0.0 al bordo
              // Usiamo la curva quadratica per rendere i bordi più morbidi
              const influence = 1.0 - (distSquared / radiusSquared);
              
              const key = `${x}_${y}`;
              if (waterMap.has(key)) {
                // LA MAGIA: Se i laghi si sovrappongono, l'acqua SI SOMMA!
                waterMap.get(key)!.influence += influence; 
              } else {
                waterMap.set(key, { worldX: x, worldY: y, influence: influence });
              }
            }
          }
        }
        
      });

      // FASE B: Disegniamo la mappa fusa
      const renderWaterSize = Math.ceil(waterWorldSize * this.camera.zoom);

      waterMap.forEach(block => {
        const screenPos = this.worldToScreen(block.worldX, block.worldY);

        // VIEWPORT CULLING (Disegna solo se è nello schermo)
        if (screenPos.x + renderWaterSize > 0 && screenPos.x < canvas.width &&
            screenPos.y + renderWaterSize > 0 && screenPos.y < canvas.height) {

          // Colori SOLIDI e puliti in base alla somma delle influenze
          if (block.influence > 0.8) {
            this.ctx.fillStyle = "#38bdf8"; // Profondo (Blu acceso)
          } else if (block.influence > 0.3) {
            this.ctx.fillStyle = "#7dd3fc"; // Medio (Celeste)
          } else {
            this.ctx.fillStyle = "#bae6fd"; // Riva (Azzurro chiarissimo)
          }

          this.ctx.fillRect(screenPos.x, screenPos.y, renderWaterSize, renderWaterSize);
        }
      });
    
    }

    // 2. I PIXEL (VIEWPORT CULLING STRETTO)
    this.renderedPixelsCount = 0; // AZZERA IL CONTATORE A OGNI FRAME!

    if (pixels) {
      pixels.forEach(p => {
        let p_type = p[0], p_x = p[1], p_y = p[2]; 

        const screenPos = this.worldToScreen(p_x, p_y);

        // VIEWPORT CULLING: 
        if (screenPos.x < -renderSize || screenPos.x > canvas.width || 
            screenPos.y < -renderSize || screenPos.y > canvas.height) {
            return; // IL PIXEL È FUORI SCHERMO: NON LO DISEGNA E NON LO CONTA!
        }

        // SE ARRIVA QUI, SIGNIFICA CHE È VISIBILE SULLO SCHERMO! LO CONTIAMO!
        this.renderedPixelsCount++;

        if (p_type === "Power") this.ctx.fillStyle = "#ef4444"; 
        else if (p_type === "Gastro") this.ctx.fillStyle = "#10b981"; 
        else if (p_type === "Wood") this.ctx.fillStyle = "#78350f";
        else if (p_type === "Neuro") this.ctx.fillStyle = "#3b82f6"; 
        else if (p_type === "Biomass") this.ctx.fillStyle = "#64748b"; 
        else if (p_type === "Egg") this.ctx.fillStyle = "#fbbf24"; 
        else this.ctx.fillStyle = "#ffffff";

        this.ctx.globalAlpha = (p_type === "Biomass") ? 0.6 : 1.0;
        this.ctx.fillRect(screenPos.x, screenPos.y, renderSize, renderSize);
      });
    }
    this.ctx.globalAlpha = 1.0;
  }

  private drawCreaturePreview(morphology: any[]) {
    if (!this.previewCanvasRef || !morphology) return;
    const ctx = this.previewCanvasRef.nativeElement.getContext('2d')!;
    const width = 200; const height = 200;
    
    ctx.clearRect(0, 0, width, height);
    
    const pixelSize = 25; 
    const centerX = width / 2;
    const centerY = height / 2;

    morphology.forEach(p => {
      // p[0] = Tipo (Stringa), p[1] = OffsetX, p[2] = OffsetY
      let p_type = p[0], p_dx = p[1], p_dy = p[2];
      
      // I COLORI DEVONO ESSERE ESATTI!
      if (p_type === "Power") ctx.fillStyle = "#ef4444"; 
      else if (p_type === "Gastro") ctx.fillStyle = "#10b981"; 
      else if (p_type === "Neuro") ctx.fillStyle = "#3b82f6"; 
      else ctx.fillStyle = "#ffffff"; // Colore di backup se Python manda roba strana
      
      const drawX = centerX + (p_dx / 10) * pixelSize - (pixelSize/2);
      const drawY = centerY + (p_dy / 10) * pixelSize - (pixelSize/2);
      
      ctx.fillRect(drawX, drawY, pixelSize, pixelSize);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(drawX, drawY, pixelSize, pixelSize);
    });
  }

  // --- L'OCCHIO DI DIO AGGIORNATO ---
  public onCanvasClick(event: MouseEvent) {
    if (this.ws.readyState !== WebSocket.OPEN) return;

    // Il click ora deve usare la Telecamera per capire dove hai puntato nel mondo reale!
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const worldPos = this.screenToWorld(clickX, clickY);

    // Click Sinistro per Ispezionare (Solo se NON stavamo trascinando la mappa)
    if (event.button === 0 && !this.isDragging) { 
      this.ws.send(JSON.stringify({ action: "inspect", x: worldPos.x, y: worldPos.y }));
    } 
    // Click Destro per il Cibo Divino
    else if (event.button === 2) { 
      // Click Destro: Manda anche l'email per pagare!
      this.ws.send(JSON.stringify({ 
        action: "spawn_food", 
        x: worldPos.x, 
        y: worldPos.y,
        user_email: this.loggedUserEmail 
      }));
    }
  }
  // --- VISUALIZZATORE RETE NEURALE (NEAT) ---
  // --- VISUALIZZATORE RETE NEURALE (NEAT) ---
  private drawBrain(brainData: any) {
    if (!this.brainCanvasRef || !brainData) return;
    const canvas = this.brainCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    
    // Per avere una grafica nitida anche sui monitor Retina
    const width = 280;
    const height = 250;
    ctx.clearRect(0, 0, width, height);

    const nodes = brainData.nodes || [];
    const conns = brainData.connections || [];
    const nodePositions = new Map<number, {x: number, y: number}>();
    
    // Contatori per impilare i nodi in verticale
    let inputCount = 0;
    let outputCount = 0;
    let hiddenCount = 0;

    // FASE 1: SMISTIAMO E POSIZIONIAMO I NEURONI SULLO SCHERMO
    nodes.forEach((n: any) => {
      let x = 0, y = 0;
      
      if (n.id < 0) {
        // È UN SENSO (INPUT) -> X = 20 (Tutto a sinistra)
        x = 20;
        // Li distribuiamo perfettamente nei 250px di altezza (17 Nodi = circa 14px di distanza)
        y = 12 + (inputCount * 14); 
        inputCount++;
      } else if (n.id === 0 || n.id === 1) {
        // È UN MUSCOLO (OUTPUT) -> X = 260 (Tutto a destra)
        x = 260;
        // Sono solo 2, li mettiamo belli larghi al centro
        y = 100 + (outputCount * 50); 
        outputCount++;
      } else {
        // È UN NODO NASCOSTO (MEMORIA) -> X = 140 (Al centro)
        x = 140;
        y = 80 + (hiddenCount * 30);
        hiddenCount++;
      }
      
      nodePositions.set(n.id, {x, y});
    });

    // FASE 2: DISEGNIAMO LE SINAPSI (LE LINEE)
    conns.forEach((c: any) => {
      const posIn = nodePositions.get(c.in);
      const posOut = nodePositions.get(c.out);
      
      if (posIn && posOut) {
        ctx.beginPath();
        ctx.moveTo(posIn.x, posIn.y);
        
        // Curva verso l'alto se è un loop di memoria (Rete Ricorrente CTRNN)
        if (posIn.x >= posOut.x) {
            ctx.quadraticCurveTo(posIn.x + 30, posIn.y - 50, posOut.x, posOut.y);
        } else {
            ctx.lineTo(posOut.x, posOut.y);
        }
        
        // Spessore e Colore in base alla forza della sinapsi
        const absWeight = Math.abs(c.weight);
        const thickness = Math.max(0.5, Math.min(absWeight, 2.5)); // Da 0.5px a 2.5px
        ctx.lineWidth = thickness;
        
        if (c.weight > 0) {
            // Verde se è una connessione eccitatoria (es. "Vedi cibo -> Vai avanti")
            ctx.strokeStyle = `rgba(52, 211, 153, ${Math.min(0.2 + absWeight * 0.3, 0.9)})`; 
        } else {
            // Rosso corallo se è inibitoria (es. "Vedi muro -> NON andare avanti")
            ctx.strokeStyle = `rgba(244, 63, 94, ${Math.min(0.2 + absWeight * 0.3, 0.9)})`; 
        }
        
        ctx.stroke();
      }
    });

    // FASE 3: DISEGNIAMO I NEURONI (I PALLINI LUMINOSI)
    nodePositions.forEach((pos, id) => {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2); // Raggio 4px
      
      if (id < 0) {
        ctx.fillStyle = "#94a3b8"; // Sensi (Grigio)
      } else if (id === 0 || id === 1) {
        ctx.fillStyle = "#f59e0b"; // Muscoli (Ambra/Arancione)
        // Aggiungiamo un alone luminoso ai muscoli!
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = "#c084fc"; // Nascosti/Memoria (Viola)
        ctx.shadowColor = "#c084fc";
        ctx.shadowBlur = 5;
      }
      
      ctx.fill();
      
      // Resettiamo le ombre per il bordo nero
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }
}
