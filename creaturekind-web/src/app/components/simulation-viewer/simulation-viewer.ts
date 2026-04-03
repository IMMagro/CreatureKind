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
  public dnaCredits: number = 0;
  @ViewChild('worldCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('previewCanvas', { static: false }) previewCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('brainCanvas', { static: false }) brainCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('fullBrainCanvas', { static: false }) fullBrainCanvasRef?: ElementRef<HTMLCanvasElement>; // IL CANVAS GIGANTE!
  
  public isBrainExpanded = false; 
  
  private ctx!: CanvasRenderingContext2D;
  private ws!: WebSocket;
  private loopInterval: any;

  private readonly WORLD_WIDTH = 6400;
  private readonly WORLD_HEIGHT = 3600;

  private camera = { x: this.WORLD_WIDTH / 2, y: this.WORLD_HEIGHT / 2, zoom: 1.0 };
  
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  public currentTool: 'inspect' | 'food' | 'smite' = 'inspect'; 

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

  public setTool(tool: 'inspect' | 'food' | 'smite') { this.currentTool = tool; }
  public goHome() { this.router.navigate(['/profile']); } 
  public closeInspection() { 
    this.trackedCreatureId = null; 
    this.trackedInfo = null; 
    this.isBrainExpanded = false; // Chiude anche il cervello gigante!
  }
  public toggleBrainExpansion() {
    this.isBrainExpanded = !this.isBrainExpanded;
    this.cdr.detectChanges(); // Forza Angular a mostrare o nascondere il canvas gigante
  }
  
  public censusCreature() {
    if (this.ws.readyState === WebSocket.OPEN && this.trackedInfo) {
      this.ws.send(JSON.stringify({ 
        action: "census", 
        target_id: this.trackedInfo.id, 
        user_email: this.loggedUserEmail 
      }));
    }
  }

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

  private connectWebSocket() {
    this.ws = new WebSocket('ws://192.168.10.139:8000/ws'); 

    this.ws.onopen = () => {
      this.loopInterval = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: "req", track_id: this.trackedCreatureId }));
        }
      }, 1000 / 30);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'string' || !event.data.startsWith('{')) return;
      const data = JSON.parse(event.data);

      // Aggiornamento crediti DNA
      if (data.type === "credit_update" || data.dna_credits !== undefined) {
        this.dnaCredits = data.dna_credits ?? data.credits;
        const savedUser = localStorage.getItem('user_data');
        if (savedUser) {
          let parsed = JSON.parse(savedUser);
          parsed.dna_credits = this.dnaCredits;
          localStorage.setItem('user_data', JSON.stringify(parsed));
        }
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

      if (data.type === "world_state" || data.pixels) {
        if (this.trackedCreatureId && !data.tracked_info) {
          this.trackedCreatureId = null;
          this.trackedInfo = null;
        }

        this.hudData = data;

        if (data.tracked_info) {
          this.trackedInfo = {
            ...data.tracked_info,
            lactic_acid: data.tracked_info.lactic_acid || 0,
            heat: data.tracked_info.heat || 36,
            is_sleeping: data.tracked_info.is_sleeping || false,
            growth_scale: data.tracked_info.growth_scale || 1.0
          };
        }
        
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
          this.drawBrain(this.trackedInfo.brain, this.brainCanvasRef); // Disegna nel pannello piccolo
          if (this.isBrainExpanded) {
            this.drawBrain(this.trackedInfo.brain, this.fullBrainCanvasRef, true); // Disegna in quello gigante!
          }
        }

        this.drawWorld(data.pixels, data.water_zones);
      }
    };
  }

  private drawWorld(pixels: any[], waterZones: any[]) {
    const canvas = this.canvasRef.nativeElement;
    if (canvas.width === 0 || canvas.height === 0) return;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    const renderSize = Math.max(2, 10 * this.camera.zoom); 

    if (waterZones && waterZones.length > 0) {
      const waterWorldSize = 15; 
      const waterMap = new Map<string, { worldX: number, worldY: number, influence: number }>();
      waterZones.forEach(w => {
        if (!w.radius) return; 
        const startX = Math.floor((w.x - w.radius) / waterWorldSize) * waterWorldSize;
        const endX = Math.ceil((w.x + w.radius) / waterWorldSize) * waterWorldSize;
        const startY = Math.floor((w.y - w.radius) / waterWorldSize) * waterWorldSize;
        const endY = Math.ceil((w.y + w.radius) / waterWorldSize) * waterWorldSize;
        for (let x = startX; x <= endX; x += waterWorldSize) {
          for (let y = startY; y <= endY; y += waterWorldSize) {
            const dx = x - w.x; const dy = y - w.y;
            const distSquared = dx * dx + dy * dy;
            const radiusSquared = w.radius * w.radius;
            if (distSquared <= radiusSquared) {
              const influence = 1.0 - (distSquared / radiusSquared);
              const key = `${x}_${y}`;
              if (waterMap.has(key)) waterMap.get(key)!.influence += influence; 
              else waterMap.set(key, { worldX: x, worldY: y, influence: influence });
            }
          }
        }
      });
      const renderWaterSize = Math.ceil(waterWorldSize * this.camera.zoom);
      waterMap.forEach(block => {
        const screenPos = this.worldToScreen(block.worldX, block.worldY);
        if (renderWaterSize > 0) {
           if (block.influence > 0.8) this.ctx.fillStyle = "#38bdf8"; 
           else if (block.influence > 0.3) this.ctx.fillStyle = "#7dd3fc"; 
           else this.ctx.fillStyle = "#bae6fd"; 
           this.ctx.fillRect(screenPos.x, screenPos.y, renderWaterSize, renderWaterSize);
        }
      });
    }

    this.renderedPixelsCount = 0; 
    if (pixels && pixels.length > 0) {
      pixels.forEach(p => {
        let p_type = p[0], p_x = p[1], p_y = p[2]; 
        const screenPos = this.worldToScreen(p_x, p_y);
        if (screenPos.x < -200 || screenPos.x > canvas.width + 200 || screenPos.y < -200 || screenPos.y > canvas.height + 200) return; 
        this.renderedPixelsCount++;
        if (p_type === "Power") this.ctx.fillStyle = "#ef4444"; 
        else if (p_type === "Gastro") this.ctx.fillStyle = "#10b981"; 
        else if (p_type === "Wood") this.ctx.fillStyle = "#78350f";
        else if (p_type === "Neuro") this.ctx.fillStyle = "#3b82f6"; 
        else if (p_type === "Biomass") this.ctx.fillStyle = "#64748b"; 
        else if (p_type === "Egg") this.ctx.fillStyle = "#fbbf24"; 
        else this.ctx.fillStyle = "#ffffff";
        this.ctx.globalAlpha = (p_type === "Biomass") ? 0.6 : 1.0;
        if (renderSize > 0) this.ctx.fillRect(screenPos.x, screenPos.y, renderSize, renderSize);
      });
    }
    this.ctx.globalAlpha = 1.0;
  }

  private drawCreaturePreview(morphology: any[]) {
    if (!this.previewCanvasRef || !morphology) return;
    const ctx = this.previewCanvasRef.nativeElement.getContext('2d')!;
    ctx.clearRect(0, 0, 200, 200);
    const pixelSize = 25; const centerX = 100; const centerY = 100;
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

  // --- VISUALIZZATORE RETE NEURALE (SCALABILE) ---
  private drawBrain(brainData: any, canvasRef: ElementRef<HTMLCanvasElement> | undefined, isFullscreen: boolean = false) {
    if (!canvasRef || !brainData) return;
    const canvas = canvasRef.nativeElement;
    
    // Se siamo in fullscreen, la tela occupa tutto lo schermo del PC!
    if (isFullscreen) {
      canvas.width = window.innerWidth * 0.8;
      canvas.height = window.innerHeight * 0.8;
    }
    
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const nodes = brainData.nodes || [];
    const conns = brainData.connections || [];
    const nodePositions = new Map<number, {x: number, y: number}>();
    
    let inputCount = 0;
    let outputCount = 0;
    let hiddenCount = 0;

    // SCALA DINAMICA: Più lo schermo è grande, più distanziamo i neuroni
    const paddingX = isFullscreen ? canvas.width * 0.1 : 20;
    const spacingX = isFullscreen ? (canvas.width * 0.8) / 2 : 120;
    const inputSpacingY = isFullscreen ? (canvas.height * 0.9) / 22 : 14; // 22 input totali
    const hiddenSpacingY = isFullscreen ? 50 : 30;
    const outputSpacingY = isFullscreen ? 150 : 50;

    nodes.forEach((n: any) => {
      let x = 0, y = 0;
      if (n.id < 0) {
        x = paddingX; 
        y = (isFullscreen ? canvas.height * 0.05 : 12) + (inputCount * inputSpacingY); 
        inputCount++;
      } else if (n.id === 0 || n.id === 1) {
        x = paddingX + (spacingX * 2); 
        y = (canvas.height / 2) - (outputSpacingY / 2) + (outputCount * outputSpacingY); 
        outputCount++;
      } else {
        x = paddingX + spacingX; 
        y = (canvas.height / 2) - (hiddenSpacingY * 2) + (hiddenCount * hiddenSpacingY); 
        hiddenCount++;
      }
      nodePositions.set(n.id, {x, y});
    });

    conns.forEach((c: any) => {
      const posIn = nodePositions.get(c.in);
      const posOut = nodePositions.get(c.out);
      
      if (posIn && posOut) {
        ctx.beginPath();
        ctx.moveTo(posIn.x, posIn.y);
        
        // La curva della memoria deve essere più ampia in fullscreen
        if (posIn.x >= posOut.x) {
            const curveOffset = isFullscreen ? 100 : 30;
            ctx.quadraticCurveTo(posIn.x + curveOffset, posIn.y - (curveOffset*1.5), posOut.x, posOut.y);
        } else {
            ctx.lineTo(posOut.x, posOut.y);
        }
        
        const absWeight = Math.abs(c.weight);
        // Fili più spessi in fullscreen!
        const baseThickness = isFullscreen ? 2.0 : 0.5;
        ctx.lineWidth = Math.max(baseThickness, Math.min(absWeight * (isFullscreen ? 2 : 1), isFullscreen ? 6.0 : 2.5)); 
        
        if (c.weight > 0) ctx.strokeStyle = `rgba(52, 211, 153, ${Math.min(0.2 + absWeight * 0.3, 0.9)})`; 
        else ctx.strokeStyle = `rgba(244, 63, 94, ${Math.min(0.2 + absWeight * 0.3, 0.9)})`; 
        
        ctx.stroke();
      }
    });

    nodes.forEach((n: any) => {
      const pos = nodePositions.get(n.id);
      if (!pos) return;

      ctx.beginPath();
      // Pallini più grandi in fullscreen!
      const radius = isFullscreen ? 12 : 4;
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); 
      
      if (n.id < 0) ctx.fillStyle = "#94a3b8"; 
      else if (n.id === 0 || n.id === 1) { ctx.fillStyle = "#f59e0b"; ctx.shadowColor = "#f59e0b"; ctx.shadowBlur = isFullscreen ? 20 : 8; }
      else { ctx.fillStyle = "#c084fc"; ctx.shadowColor = "#c084fc"; ctx.shadowBlur = isFullscreen ? 15 : 5; }
      
      ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#0f172a"; ctx.lineWidth = isFullscreen ? 3 : 1; ctx.stroke();

      // IN FULLSCREEN, SCRIVIAMO ANCHE LE ETICHETTE SUI NEURONI!
      if (isFullscreen) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px monospace";
        if (n.id < 0) {
            // Sensi
            let label = `In ${n.id}`;
            if (n.id >= -5) label = `Occhio Cibo ${n.id}`;
            else if (n.id >= -10) label = `Occhio Nemico ${n.id+5}`;
            else if (n.id >= -15) label = `Occhio Acqua ${n.id+10}`;
            else if (n.id == -16) label = "Fame";
            else if (n.id == -17) label = "Sete";
            else if (n.id == -18) label = "Acido Lattico";
            else if (n.id == -19) label = "Sonno";
            else if (n.id == -20) label = "Dolore";
            else if (n.id == -21) label = "Paura";
            else if (n.id == -22) label = "Velocità";
            ctx.fillText(label, pos.x - 100, pos.y + 4);
        } else if (n.id === 0) {
            ctx.fillText("Sterzo", pos.x + 20, pos.y + 4);
        } else if (n.id === 1) {
            ctx.fillText("Acceleratore", pos.x + 20, pos.y + 4);
        }
      }
    });
  }

  public onCanvasClick(event: MouseEvent) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const wPos = this.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    if (event.button === 0 && !this.isDragging) { 
      if (this.currentTool === 'inspect') {
        this.trackedCreatureId = null; this.trackedInfo = null;
        this.ws.send(JSON.stringify({ action: "inspect", x: wPos.x, y: wPos.y }));
      } else if (this.currentTool === 'food') {
        this.ws.send(JSON.stringify({ action: "spawn_food", x: wPos.x, y: wPos.y, user_email: this.loggedUserEmail }));
      } else if (this.currentTool === 'smite') {
        this.ws.send(JSON.stringify({ action: "smite_plant", x: wPos.x, y: wPos.y, user_email: this.loggedUserEmail }));
      }
    } 
  }
}