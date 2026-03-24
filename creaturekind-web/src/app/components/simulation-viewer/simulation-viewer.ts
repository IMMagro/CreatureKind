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
  
  @ViewChild('worldCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('previewCanvas', { static: false }) previewCanvasRef?: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private ws!: WebSocket;
  private loopInterval: any;

  private readonly WORLD_WIDTH = 6400;
  private readonly WORLD_HEIGHT = 3600;

  public hudData: any = null;
  public trackedInfo: any = null;
  private trackedCreatureId: string | null = null;

  // INIETTIAMO IL ROUTER E IL CHANGE DETECTOR
  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  public goHome() {
    this.router.navigate(['/']); 
  }
  public closeInspection() {
    this.trackedCreatureId = null;
    this.trackedInfo = null;
  }

  ngAfterViewInit(): void {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.resizeCanvas();
    this.connectWebSocket();
  }

  ngOnDestroy(): void {
    if (this.ws) this.ws.close();
    if (this.loopInterval) clearInterval(this.loopInterval);
  }

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
  }

  private resizeCanvas() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = canvas.parentElement!.clientWidth; 
    canvas.height = canvas.parentElement!.clientHeight;
  }

  private connectWebSocket() {
    this.ws = new WebSocket('ws://127.0.0.1:8000/ws');

    this.ws.onopen = () => {
      this.loopInterval = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            action: "req",
            track_id: this.trackedCreatureId
          }));
        }
      }, 1000 / 30);
    };

    this.ws.onmessage = (event) => {
      if (!event.data.startsWith('{')) return;
      const data = JSON.parse(event.data);

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
        
        this.cdr.detectChanges(); 
        if (this.trackedInfo && this.trackedInfo.morphology) {
          this.drawCreaturePreview(this.trackedInfo.morphology);
        }
        // DISEGNA IL MONDO PASSANDO ANCHE I LAGHI
        this.drawWorld(data.pixels, data.water_zones);
      }
    };
  }

  // --- MOTORE GRAFICO ---
  // --- MOTORE GRAFICO ---
  // --- MOTORE GRAFICO ULTRA-OTTIMIZZATO ---
  private drawWorld(pixels: any[], waterZones: any[]) {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const scaleX = canvas.width / this.WORLD_WIDTH;
    const scaleY = canvas.height / this.WORLD_HEIGHT;

    // Dimensione base per piante e creature (10 unità del server)
    const renderWidth = Math.max(2, 10 * scaleX); 
    const renderHeight = Math.max(2, 10 * scaleY);

   // --- 1. DISEGNA L'ACQUA SOLIDA (PIXEL BLOCKS PURI) ---
    if (waterZones && waterZones.length > 0) {
      // Grandezza del "blocco 8-bit"
      const waterPixelSize = 15 * scaleX; 
      
      // Azzurro fresco e pulito, perfetto sullo sfondo chiaro!
      this.ctx.fillStyle = "rgba(56, 189, 248, 0.35)"; 

      waterZones.forEach(w => {
        const startX = (w.x - w.radius) * scaleX;
        const endX = (w.x + w.radius) * scaleX;
        const startY = (w.y - w.radius) * scaleY;
        const endY = (w.y + w.radius) * scaleY;

        for (let x = startX; x < endX; x += waterPixelSize) {
          for (let y = startY; y < endY; y += waterPixelSize) {
            
            const centerX = w.x * scaleX;
            const centerY = w.y * scaleY;
            const dx = x - centerX;
            const dy = y - centerY;
            
            // Teorema di Pitagora: è dentro il lago?
            if (dx * dx + dy * dy <= (w.radius * scaleX) * (w.radius * scaleX)) {
              // Disegna un cubo solido. Niente frattali, niente bordini neri!
              // I bordi "a scalinata" si formeranno naturalmente grazie ai quadrati.
              this.ctx.fillRect(x, y, waterPixelSize, waterPixelSize);
            }
          }
        }
      });
    }

    // --- 2. IL VERO DISEGNO DEI PIXEL ---
    if (pixels) {
      pixels.forEach(p => {
        let p_type = p[0], p_x = p[1], p_y = p[2]; 

        // I Colori Scuri perfetti per questo tema
        if (p_type === "Power") this.ctx.fillStyle = "#ef4444"; // Rosso intenso
        else if (p_type === "Gastro") this.ctx.fillStyle = "#10b981"; // Verde smeraldo neon
        else if (p_type === "Neuro") this.ctx.fillStyle = "#3b82f6"; // Blu acceso
        else if (p_type === "Biomass") this.ctx.fillStyle = "#64748b"; // Grigio polvere (meglio del marrone)
        else if (p_type === "Egg") this.ctx.fillStyle = "#fbbf24"; // Giallo
        else this.ctx.fillStyle = "#ffffff";

        this.ctx.globalAlpha = (p_type === "Biomass") ? 0.5 : 1.0;
        
        this.ctx.fillRect(p_x * scaleX, p_y * scaleY, renderWidth, renderHeight);
      });
    }
    this.ctx.globalAlpha = 1.0;
  }

  public onCanvasClick(event: MouseEvent) {
    if (this.ws.readyState !== WebSocket.OPEN) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const clickX = (event.clientX - rect.left) * (this.WORLD_WIDTH / canvas.width);
    const clickY = (event.clientY - rect.top) * (this.WORLD_HEIGHT / canvas.height);

    if (event.button === 0) { 
      this.trackedCreatureId = null;
      this.trackedInfo = null;
      this.ws.send(JSON.stringify({ action: "inspect", x: clickX, y: clickY }));
    } 
    else if (event.button === 2) { 
      this.ws.send(JSON.stringify({ action: "spawn_food", x: clickX, y: clickY }));
    }
  }
  private drawCreaturePreview(morphology: any[]) {
    if (!this.previewCanvasRef || !morphology) return;
    const ctx = this.previewCanvasRef.nativeElement.getContext('2d')!;
    const width = 200; const height = 200;
    
    ctx.clearRect(0, 0, width, height);
    
    // Disegniamo la creatura ingrandita al centro del riquadro
    const pixelSize = 25; // Pixel giganti!
    const centerX = width / 2;
    const centerY = height / 2;

    morphology.forEach(p => {
      let p_type = p[0], p_dx = p[1], p_dy = p[2];
      
      if (p_type === "Power") ctx.fillStyle = "#ef4444"; 
      else if (p_type === "Gastro") ctx.fillStyle = "#10b981"; 
      else if (p_type === "Neuro") ctx.fillStyle = "#3b82f6"; 
      
      // Calcoliamo la posizione in base all'offset (dx, dy) rispetto al centro
      // Diviso 10 perché in Python l'offset è 10,20... lo riduciamo in "griglia"
      const drawX = centerX + (p_dx / 10) * pixelSize - (pixelSize/2);
      const drawY = centerY + (p_dy / 10) * pixelSize - (pixelSize/2);
      
      ctx.fillRect(drawX, drawY, pixelSize, pixelSize);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(drawX, drawY, pixelSize, pixelSize);
    });
  }
}