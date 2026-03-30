import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { Router } from '@angular/router'; 

@Component({
  selector: 'app-simulation-viewer',
  standalone: true, 
  imports: [CommonModule], 
  templateUrl: './simulation-viewer.html', 
  styleUrls: ['./simulation-viewer.scss']  
})
export class SimulationViewerComponent implements AfterViewInit, OnDestroy {
  
  @ViewChild('worldCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('previewCanvas', { static: false }) previewCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('brainCanvas', { static: false }) brainCanvasRef?: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private ws!: WebSocket;
  private loopInterval: any;

  private readonly WORLD_WIDTH = 6400;
  private readonly WORLD_HEIGHT = 3600;

  // --- LA TELECAMERA ---
  private camera = { x: this.WORLD_WIDTH / 2, y: this.WORLD_HEIGHT / 2, zoom: 1.0 };
  
  // Variabili Mouse e Strumenti
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  public currentTool: 'inspect' | 'food' | 'smite' = 'inspect'; 

  // Dati di gioco e UI
  public hudData: any = null;
  public renderedPixelsCount = 0;
  public trackedInfo: any = null;
  private trackedCreatureId: string | null = null;
  public loggedUserEmail: string = '';
  public divineError: string | null = null;

  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.resizeCanvas();
    this.setupCameraControls(); 
    
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

  // --- AZIONI UI ---
  public setTool(tool: 'inspect' | 'food' | 'smite') { this.currentTool = tool; }
  public goHome() { this.router.navigate(['/profile']); } // Modificato per tornare al profilo!
  public closeInspection() { this.trackedCreatureId = null; this.trackedInfo = null; }

  public censusCreature() {
    if (this.ws.readyState === WebSocket.OPEN && this.trackedInfo) {
      this.ws.send(JSON.stringify({ 
        action: "census", 
        target_id: this.trackedInfo.id, 
        user_email: this.loggedUserEmail 
      }));
    }
  }

  // --- I CONTROLLI DELLA TELECAMERA ---
  private setupCameraControls() {
    const canvas = this.canvasRef.nativeElement;

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const zoomSensitivity = 0.1;
      const zoomChange = event.deltaY < 0 ? (1 + zoomSensitivity) : (1 - zoomSensitivity);
      this.camera.zoom *= zoomChange;
      this.camera.zoom = Math.max(0.1, Math.min(this.camera.zoom, 10.0));
    });

    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0 || event.button === 1) {
        this.isDragging = true;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
      }
    });

    canvas.addEventListener('mousemove', (event) => {
      if (!this.isDragging) return;
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this.camera.x = (this.camera.x + this.WORLD_WIDTH) % this.WORLD_WIDTH;
      this.camera.y = (this.camera.y + this.WORLD_HEIGHT) % this.WORLD_HEIGHT;

      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
    });

    canvas.addEventListener('mouseup', () => this.isDragging = false);
    canvas.addEventListener('mouseleave', () => this.isDragging = false);
  }

  private worldToScreen(worldX: number, worldY: number) {
    const canvas = this.canvasRef.nativeElement;
    let dx = worldX - this.camera.x;
    let dy = worldY - this.camera.y;

    if (dx > this.WORLD_WIDTH / 2) dx -= this.WORLD_WIDTH;
    if (dx < -this.WORLD_WIDTH / 2) dx += this.WORLD_WIDTH;
    if (dy > this.WORLD_HEIGHT / 2) dy -= this.WORLD_HEIGHT;
    if (dy < -this.WORLD_HEIGHT / 2) dy += this.WORLD_HEIGHT;

    const screenX = (canvas.width / 2) + (dx * this.camera.zoom);
    const screenY = (canvas.height / 2) + (dy * this.camera.zoom);
    return { x: screenX, y: screenY };
  }

  private screenToWorld(screenX: number, screenY: number) {
    const canvas = this.canvasRef.nativeElement;
    const dx = (screenX - canvas.width / 2) / this.camera.zoom;
    const dy = (screenY - canvas.height / 2) / this.camera.zoom;

    let worldX = (this.camera.x + dx) % this.WORLD_WIDTH;
    let worldY = (this.camera.y + dy) % this.WORLD_HEIGHT;

    if (worldX < 0) worldX += this.WORLD_WIDTH;
    if (worldY < 0) worldY += this.WORLD_HEIGHT;

    return { x: worldX, y: worldY };
  }

  // --- WEBSOCKET ---
  private connectWebSocket() {
    this.ws = new WebSocket('ws://192.168.10.139:8000/ws'); // Assicurati che l'IP sia corretto!

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

      // GESTIONE EVENTI SPECIALI DAL SERVER
      if (data.type === "credit_update") {
        const savedUser = localStorage.getItem('user_data');
        if (savedUser) {
          let parsed = JSON.parse(savedUser);
          parsed.dna_credits = data.credits;
          localStorage.setItem('user_data', JSON.stringify(parsed));
        }
        return;
      }

      if (data.type === "error") {
        this.divineError = data.message;
        setTimeout(() => this.divineError = null, 3000); 
        this.cdr.detectChanges();
        return;
      }

      if (data.type === "success") {
        alert("✅ MIRACOLO SCIENTIFICO: " + data.message);
        return;
      }

      if (data.type === "tracking_id") {
        this.trackedCreatureId = data.id;
        return;
      }

      // GESTIONE FOTOGRAMMA DEL MONDO
      if (data.type === "world_state" || data.pixels) {
        if (this.trackedCreatureId && !data.tracked_info) {
          this.trackedCreatureId = null;
          this.trackedInfo = null;
        }

        this.hudData = data;
        this.trackedInfo = data.tracked_info;
        
        if (this.trackedInfo && data.pixels) {
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
        
        if (this.trackedInfo && this.trackedInfo.brain) {
          this.drawBrain(this.trackedInfo.brain);
        }

        this.drawWorld(data.pixels, data.water_zones);
      }
    };
  }

  // --- MOTORE GRAFICO ---
  // --- MOTORE GRAFICO BLINDATO ---
  private drawWorld(pixels: any[], waterZones: any[]) {
    const canvas = this.canvasRef.nativeElement;
    
    // 1. Sicurezza: Se il canvas non ha dimensioni, fermati!
    if (canvas.width === 0 || canvas.height === 0) return;
    
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const renderSize = Math.max(2, 10 * this.camera.zoom); 

    // --- L'ACQUA FLUIDA METABALL (Con controlli di sicurezza) ---
    if (waterZones && waterZones.length > 0) {
      const waterWorldSize = 15; 
      const waterMap = new Map<string, { worldX: number, worldY: number, influence: number }>();

      waterZones.forEach(w => {
        // Se manca il raggio, salta questo lago
        if (!w.radius) return; 

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
              const influence = 1.0 - (distSquared / radiusSquared);
              const key = `${x}_${y}`;
              if (waterMap.has(key)) {
                waterMap.get(key)!.influence += influence; 
              } else {
                waterMap.set(key, { worldX: x, worldY: y, influence: influence });
              }
            }
          }
        }
      });

      const renderWaterSize = Math.ceil(waterWorldSize * this.camera.zoom);

      waterMap.forEach(block => {
        const screenPos = this.worldToScreen(block.worldX, block.worldY);

        // Disegna SOLO se la dimensione è positiva (evita crash di canvas)
        if (renderWaterSize > 0) {
           if (block.influence > 0.8) {
             this.ctx.fillStyle = "#38bdf8"; 
           } else if (block.influence > 0.3) {
             this.ctx.fillStyle = "#7dd3fc"; 
           } else {
             this.ctx.fillStyle = "#bae6fd"; 
           }
           this.ctx.fillRect(screenPos.x, screenPos.y, renderWaterSize, renderWaterSize);
        }
      });
    }

    // --- I PIXEL (Creature, Piante, Biomassa) ---
    this.renderedPixelsCount = 0; 

    if (pixels && pixels.length > 0) {
      pixels.forEach(p => {
        let p_type = p[0], p_x = p[1], p_y = p[2]; 

        const screenPos = this.worldToScreen(p_x, p_y);

        // VIEWPORT CULLING AMMORBIDITO: Aggiunto margine di sicurezza (+200 pixel)
        if (screenPos.x < -200 || screenPos.x > canvas.width + 200 || 
            screenPos.y < -200 || screenPos.y > canvas.height + 200) {
            return; 
        }

        this.renderedPixelsCount++;

        if (p_type === "Power") this.ctx.fillStyle = "#ef4444"; 
        else if (p_type === "Gastro") this.ctx.fillStyle = "#10b981"; 
        else if (p_type === "Wood") this.ctx.fillStyle = "#78350f";
        else if (p_type === "Neuro") this.ctx.fillStyle = "#3b82f6"; 
        else if (p_type === "Biomass") this.ctx.fillStyle = "#64748b"; 
        else if (p_type === "Egg") this.ctx.fillStyle = "#fbbf24"; 
        else this.ctx.fillStyle = "#ffffff";

        this.ctx.globalAlpha = (p_type === "Biomass") ? 0.6 : 1.0;
        
        // Sicurezza finale per non crashare il canvas
        if (renderSize > 0) {
           this.ctx.fillRect(screenPos.x, screenPos.y, renderSize, renderSize);
        }
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
      let p_type = p[0], p_dx = p[1], p_dy = p[2];
      
      if (p_type === "Power") ctx.fillStyle = "#ef4444"; 
      else if (p_type === "Gastro") ctx.fillStyle = "#10b981"; 
      else if (p_type === "Neuro") ctx.fillStyle = "#3b82f6"; 
      else ctx.fillStyle = "#ffffff"; 
      
      const drawX = centerX + (p_dx / 10) * pixelSize - (pixelSize/2);
      const drawY = centerY + (p_dy / 10) * pixelSize - (pixelSize/2);
      
      ctx.fillRect(drawX, drawY, pixelSize, pixelSize);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(drawX, drawY, pixelSize, pixelSize);
    });
  }

  private drawBrain(brainData: any) {
    if (!this.brainCanvasRef || !brainData) return;
    const canvas = this.brainCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    
    const width = 280;
    const height = 250;
    ctx.clearRect(0, 0, width, height);

    const nodes = brainData.nodes || [];
    const conns = brainData.connections || [];
    const nodePositions = new Map<number, {x: number, y: number}>();
    
    let inputCount = 0;
    let outputCount = 0;
    let hiddenCount = 0;

    nodes.forEach((n: any) => {
      let x = 0, y = 0;
      if (n.id < 0) {
        x = 20; y = 12 + (inputCount * 14); inputCount++;
      } else if (n.id === 0 || n.id === 1) {
        x = 260; y = 100 + (outputCount * 50); outputCount++;
      } else {
        x = 140; y = 80 + (hiddenCount * 30); hiddenCount++;
      }
      nodePositions.set(n.id, {x, y});
    });

    conns.forEach((c: any) => {
      const posIn = nodePositions.get(c.in);
      const posOut = nodePositions.get(c.out);
      
      if (posIn && posOut) {
        ctx.beginPath();
        ctx.moveTo(posIn.x, posIn.y);
        
        if (posIn.x >= posOut.x) ctx.quadraticCurveTo(posIn.x + 30, posIn.y - 50, posOut.x, posOut.y);
        else ctx.lineTo(posOut.x, posOut.y);
        
        const absWeight = Math.abs(c.weight);
        const thickness = Math.max(0.5, Math.min(absWeight, 2.5)); 
        ctx.lineWidth = thickness;
        
        if (c.weight > 0) ctx.strokeStyle = `rgba(52, 211, 153, ${Math.min(0.2 + absWeight * 0.3, 0.9)})`; 
        else ctx.strokeStyle = `rgba(244, 63, 94, ${Math.min(0.2 + absWeight * 0.3, 0.9)})`; 
        
        ctx.stroke();
      }
    });

    nodePositions.forEach((pos, id) => {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2); 
      
      if (id < 0) ctx.fillStyle = "#94a3b8"; 
      else if (id === 0 || id === 1) { ctx.fillStyle = "#f59e0b"; ctx.shadowColor = "#f59e0b"; ctx.shadowBlur = 8; }
      else { ctx.fillStyle = "#c084fc"; ctx.shadowColor = "#c084fc"; ctx.shadowBlur = 5; }
      
      ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 1; ctx.stroke();
    });
  }

  public onCanvasClick(event: MouseEvent) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const worldPos = this.screenToWorld(clickX, clickY);

    if (event.button === 0 && !this.isDragging) { 
      if (this.currentTool === 'inspect') {
        this.trackedCreatureId = null;
        this.trackedInfo = null;
        this.ws.send(JSON.stringify({ action: "inspect", x: worldPos.x, y: worldPos.y }));
      } 
      else if (this.currentTool === 'food') {
        this.ws.send(JSON.stringify({ action: "spawn_food", x: worldPos.x, y: worldPos.y, user_email: this.loggedUserEmail }));
      }
      else if (this.currentTool === 'smite') {
        this.ws.send(JSON.stringify({ action: "smite_plant", x: worldPos.x, y: worldPos.y, user_email: this.loggedUserEmail }));
      }
    } 
  }
}