import { Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class ProfileComponent implements OnInit, OnDestroy {
  
  @ViewChild('holoCanvas', { static: false }) holoCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('holoBrainCanvas', { static: false }) holoBrainCanvasRef?: ElementRef<HTMLCanvasElement>;

  user = { name: '', email: '', joinDate: 'Oggi', plan: '', credits: 0 };
  serverStats = { totalGenerations: 0, maxFitnessReached: 0, extinctionEvents: 0, uptime: 'Calcolando...' };
  private statsInterval: any;

  // --- VARIABILI CODEX ---
  public codexDatabase: any[] = [];
  public selectedSpecies: any = null;
  private miniSimAnimationId: any;

  constructor(private http: HttpClient, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const savedUser = localStorage.getItem('user_data');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      this.user.name = parsed.username;
      this.user.email = parsed.email;
      this.user.plan = parsed.plan;
      this.user.credits = parsed.dna_credits;
    }

    this.fetchServerStats();
    this.statsInterval = setInterval(() => { this.fetchServerStats(); }, 2000);
    
    // CARICHIAMO IL CODEX ALL'AVVIO DEL PROFILO!
    this.loadCodex();
  }

  ngOnDestroy(): void {
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.miniSimAnimationId) cancelAnimationFrame(this.miniSimAnimationId);
  }

  private loadCodex() {
    this.http.get<any[]>('http://192.168.1.19:8000/api/codex').subscribe({
      next: (data) => {
        // Mostriamo SOLO le creature scoperte dall'utente attualmente loggato!
        this.codexDatabase = data.filter(s => s.discoverer === this.user.name);
      },
      error: (err) => console.error("Errore Codex:", err)
    });
  }

  // --- OLO-SIMULATORE ---
  openSpeciesInfo(species: any) {
    this.selectedSpecies = species;
    this.cdr.detectChanges(); 
    
    setTimeout(() => this.startHoloSim(species.morphology), 50); 
    if (species.brain) {
      setTimeout(() => this.drawBrain(species.brain), 50);
    }
  }

  closeSpeciesInfo() {
    this.selectedSpecies = null;
    cancelAnimationFrame(this.miniSimAnimationId); 
  }

  private startHoloSim(morphology: any[]) {
    if (!this.holoCanvasRef) return;
    const canvas = this.holoCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    
    let entities = [
      { x: 50, y: 50, a: 0.5, speed: 1.5, turnDir: 0.05 },
      { x: 250, y: 150, a: 3.14, speed: 1.2, turnDir: -0.03 }
    ];

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(16, 185, 129, 0.05)";
      for(let i=0; i<canvas.width; i+=20) ctx.fillRect(i, 0, 1, canvas.height);
      for(let j=0; j<canvas.height; j+=20) ctx.fillRect(0, j, canvas.width, 1);

      entities.forEach(ent => {
        ent.x += Math.cos(ent.a) * ent.speed;
        ent.y += Math.sin(ent.a) * ent.speed;
        ent.a += ent.turnDir; 
        if(Math.random() < 0.02) ent.turnDir *= -1; 

        if (ent.x < 20 || ent.x > canvas.width - 20) { ent.a = Math.PI - ent.a; ent.x = Math.max(20, Math.min(ent.x, canvas.width-20)); }
        if (ent.y < 20 || ent.y > canvas.height - 20) { ent.a = -ent.a; ent.y = Math.max(20, Math.min(ent.y, canvas.height-20)); }

        ctx.save();
        ctx.translate(ent.x, ent.y);
        ctx.rotate(ent.a);

        morphology.forEach(p => {
          let p_type = p[0], dx = p[1], dy = p[2];
          if (p_type === "Power") ctx.fillStyle = "#ef4444"; 
          else if (p_type === "Gastro") ctx.fillStyle = "#10b981"; 
          else if (p_type === "Neuro") ctx.fillStyle = "#3b82f6"; 
          else ctx.fillStyle = "#ffffff"; 
          
          ctx.fillRect(dx - 5, dy - 5, 10, 10);
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.strokeRect(dx - 5, dy - 5, 10, 10);
        });
        ctx.restore();
      });

      this.miniSimAnimationId = requestAnimationFrame(loop);
    };
    loop(); 
  }

  private drawBrain(brainData: any) {
    if (!this.holoBrainCanvasRef || !brainData) return;
    const canvas = this.holoBrainCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    
    const width = 330;
    const height = 200;
    ctx.clearRect(0, 0, width, height);

    const nodes = brainData.nodes || [];
    const conns = brainData.connections || [];
    const nodePositions = new Map<number, {x: number, y: number}>();
    
    let inputCount = 0, outputCount = 0, hiddenCount = 0;

    nodes.forEach((n: any) => {
      let x = 0, y = 0;
      if (n.id < 0) { x = 20; y = 10 + (inputCount * 9); inputCount++; } 
      else if (n.id === 0 || n.id === 1) { x = 300; y = 80 + (outputCount * 40); outputCount++; } 
      else { x = 160; y = 60 + (hiddenCount * 25); hiddenCount++; }
      nodePositions.set(n.id, {x, y});
    });

    conns.forEach((c: any) => {
      const posIn = nodePositions.get(c.in);
      const posOut = nodePositions.get(c.out);
      if (posIn && posOut) {
        ctx.beginPath(); ctx.moveTo(posIn.x, posIn.y);
        if (posIn.x >= posOut.x) ctx.quadraticCurveTo(posIn.x + 30, posIn.y - 40, posOut.x, posOut.y);
        else ctx.lineTo(posOut.x, posOut.y);
        
        const aW = Math.abs(c.weight);
        ctx.lineWidth = Math.max(0.5, Math.min(aW, 2.0)); 
        if (c.weight > 0) ctx.strokeStyle = `rgba(52, 211, 153, ${Math.min(0.2 + aW * 0.3, 0.9)})`; 
        else ctx.strokeStyle = `rgba(244, 63, 94, ${Math.min(0.2 + aW * 0.3, 0.9)})`; 
        ctx.stroke();
      }
    });

    nodePositions.forEach((pos, id) => {
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      if (id < 0) ctx.fillStyle = "#94a3b8"; 
      else if (id === 0 || id === 1) { ctx.fillStyle = "#f59e0b"; ctx.shadowColor = "#f59e0b"; ctx.shadowBlur = 5; }
      else { ctx.fillStyle = "#c084fc"; ctx.shadowColor = "#c084fc"; ctx.shadowBlur = 4; }
      ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 1; ctx.stroke();
    });
  }

  // --- AZIONI BASE ---
  enterWorld() { this.router.navigate(['/world']); }
  logout() { localStorage.removeItem('user_data'); this.router.navigate(['/']); }
  rechargeCredits() {
    this.http.post<any>('http://192.168.1.19:8000/api/recharge', { email: this.user.email }).subscribe({
      next: (res) => {
        this.user.credits = res.new_credits;
        const saved = JSON.parse(localStorage.getItem('user_data')!);
        saved.dna_credits = res.new_credits;
        localStorage.setItem('user_data', JSON.stringify(saved));
      }
    });
  }
}
