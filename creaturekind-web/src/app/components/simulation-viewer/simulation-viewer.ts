import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- FONDAMENTALE PER L'HTML
import { Router } from '@angular/router'; // <-- AGGIUNGI QUESTO PER NAVIGARE
import { ChangeDetectorRef } from '@angular/core'; // <-- AGGIUNGI QUESTO!

@Component({
  selector: 'app-simulation-viewer',
  standalone: true, // <-- FONDAMENTALE NEL NUOVO ANGULAR
  imports: [CommonModule], // <-- ABILITA GLI *ngIf
  templateUrl: './simulation-viewer.html',
  styleUrls: ['./simulation-viewer.scss'] // O .css se hai usato CSS
})
export class SimulationViewerComponent implements AfterViewInit, OnDestroy {
  
  @ViewChild('worldCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private ws!: WebSocket;
  private loopInterval: any;

  private readonly WORLD_WIDTH = 6400;
  private readonly WORLD_HEIGHT = 3600;

  public hudData: any = null;
  public trackedInfo: any = null;
  private trackedCreatureId: string | null = null;
  // INIETTIAMO IL ROUTER
  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  // FUNZIONE PER IL PULSANTE
  public goHome() {
    this.router.navigate(['/']); // Ci riporta alla root (La Landing Page)
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

  // Corretto l'errore del parametro qui!
  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
  }

  private resizeCanvas() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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
        
        // LA SOLUZIONE MAGICA ALL'HUD INVISIBILE! 
        // Forza Angular ad aggiornare l'HTML istantaneamente.
        this.cdr.detectChanges(); 

        this.drawWorld(data.pixels);
    };
  }
  }
  private drawWorld(pixels: any[]) {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const scaleX = canvas.width / this.WORLD_WIDTH;
    const scaleY = canvas.height / this.WORLD_HEIGHT;

    pixels.forEach(p => {
      let p_type = p[0], p_x = p[1], p_y = p[2];

      if (p_type === "Power") this.ctx.fillStyle = "#ff3333";
      else if (p_type === "Gastro") this.ctx.fillStyle = "#00ff00";
      else if (p_type === "Neuro") this.ctx.fillStyle = "#33bbff";
      else if (p_type === "Biomass") this.ctx.fillStyle = "#4a3b2c";
      else if (p_type === "Egg") this.ctx.fillStyle = "#ffd700";
      else this.ctx.fillStyle = "white";

      this.ctx.globalAlpha = (p_type === "Biomass") ? 0.4 : 1.0;
      let renderWidth = Math.max(2, 10 * scaleX); 
      let renderHeight = Math.max(2, 10 * scaleY);
      
      this.ctx.fillRect(p_x * scaleX, p_y * scaleY, renderWidth, renderHeight);
    });
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
}