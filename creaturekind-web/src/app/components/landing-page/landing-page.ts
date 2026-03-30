import { Component, OnInit, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule], 
  templateUrl: './landing-page.html',
  styleUrls: ['./landing-page.scss']
})
export class LandingPageComponent implements OnInit {
  
  // I due Canvas dell'Olo-Simulatore (Uno per il movimento, uno per il cervello)
  @ViewChild('holoCanvas', { static: false }) holoCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('holoBrainCanvas', { static: false }) holoBrainCanvasRef?: ElementRef<HTMLCanvasElement>;

  showAuthModal = false;
  isLoginMode = true; 
  errorMessage = '';
  authData = { username: '', email: '', password: '' };
  isLoggedIn = false; 

  // --- IL CODEX BIOLOGICO DINAMICO ---
  selectedSpecies: any = null;
  private miniSimAnimationId: any;
  public codexDatabase: any[] = [];

  constructor(private router: Router, private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    if (localStorage.getItem('user_data')) this.isLoggedIn = true;

    // SCARICA IL VERO CODEX DAL SERVER PYTHON!
    this.http.get<any[]>('http://192.168.10.139:8000/api/codex').subscribe({
      next: (data) => {
        // Se il database Python è vuoto, mostriamo 2 creature "finte" per abbellire il sito
        if (data && data.length === 0) {
          this.codexDatabase = [
            {
              id: "HRB-01", name: "Herbivore-01", type: "Prede", discoverer: "System", generation: 0, fitness: 0, desc: "L'organismo base. Pacifico, timido, si muove lentamente. Sopravvive brucando alghe.",
              stats: { speed: "Bassa", diet: "Erbivoro" },
              morphology: [ ["Neuro", 0, 0], ["Gastro", 10, 0], ["Power", -10, 10] ],
              brain: null
            },
            {
              id: "RPR-X", name: "Reaper-X", type: "Predatore", discoverer: "Classified", generation: -1, fitness: 999, desc: "Prototipo predatore. Triplo apparato motore per scatti ad alta velocità. Non fa fotosintesi: deve uccidere.",
              stats: { speed: "Estrema", diet: "Carnivoro" },
              morphology: [ ["Neuro", 0, 0], ["Gastro", 10, 0], ["Gastro", 10, -10], ["Gastro", 10, 10], ["Power", -10, 0], ["Power", -10, 10], ["Power", -10, -10] ],
              brain: null
            }
          ];
        } else {
          // SE CI SONO DATI NEL DB, LI MOSTRA TUTTI E IGNORA I FINTI!
          this.codexDatabase = data;
        }
      this.cdr.detectChanges(); 
      },
      error: (err) => console.error("Errore caricamento Codex", err)
    });
  }

  // --- NAVIGAZIONE E LOGIN ---
  handleMainAction() {
    if (this.isLoggedIn) {
      this.router.navigate(['/profile']); 
    } else {
      this.openAuth('register');
    }
  }

  openAuth(mode: 'login' | 'register') {
    this.isLoginMode = (mode === 'login');
    this.showAuthModal = true;
    this.errorMessage = '';
  }
  closeAuth() { this.showAuthModal = false; }

  submitAuth() {
    this.errorMessage = '';
    const url = this.isLoginMode ? 'http://192.168.10.139:8000/api/login' : 'http://192.168.10.139:8000/api/register';
    this.http.post<any>(url, this.authData).subscribe({
      next: (response) => {
        if (this.isLoginMode) {
          localStorage.setItem('user_data', JSON.stringify(response));
          this.router.navigate(['/profile']); 
        } else {
          this.isLoginMode = true;
          this.errorMessage = "Registrazione completata! Ora effettua l'accesso.";
        }
      },
      error: (err) => { this.errorMessage = err.error?.detail || "Errore di connessione al server Python"; }
    });
  }

  // --- LOGICA DEL CODEX E OLO-SIMULATORE ---
  openSpeciesInfo(species: any) {
    this.selectedSpecies = species;
    this.cdr.detectChanges(); // Forza Angular a mostrare i Canvas nell'HTML
    
    // AUMENTATO A 150ms: Diamo il tempo al browser di materializzare i due <canvas>!
    setTimeout(() => {
      this.startHoloSim(species.morphology);
      if (species.brain) {
        this.drawBrain(species.brain);
      }
    }, 150); 
  }

  closeSpeciesInfo() {
    this.selectedSpecies = null;
    cancelAnimationFrame(this.miniSimAnimationId); // Ferma il motore fisico per non consumare CPU
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
          if (p_type === "Power") ctx.fillStyle = "#f43f5e"; 
          else if (p_type === "Gastro") ctx.fillStyle = "#10b981"; 
          else if (p_type === "Neuro") ctx.fillStyle = "#38bdf8"; 
          else ctx.fillStyle = "#ffffff"; // Colore di fallback
          
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

  // --- DISEGNO DELLA RETE NEURALE CENSITA ---
  private drawBrain(brainData: any) {
    if (!this.holoBrainCanvasRef || !brainData) return;
    const canvas = this.holoBrainCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    
    const width = 280;
    const height = 250;
    ctx.clearRect(0, 0, width, height);

    const nodes = brainData.nodes || [];
    const conns = brainData.connections || [];
    const nodePositions = new Map<number, {x: number, y: number}>();
    
    let inputCount = 0, outputCount = 0, hiddenCount = 0;

    // FASE 1: SMISTIAMO E POSIZIONIAMO I NEURONI SULLO SCHERMO
    nodes.forEach((n: any) => {
      let x = 0, y = 0;
      
      if (n.id < 0) {
        // È UN SENSO (INPUT) -> X = 20 (A sinistra)
        x = 20;
        // La tela è alta 200px. 17 nodi fitti fitti. 11px di distanza.
        y = 10 + (inputCount * 11); 
        inputCount++;
      } else if (n.id === 0 || n.id === 1) {
        // È UN MUSCOLO (OUTPUT) -> X = 260 (A destra)
        x = 260;
        y = 70 + (outputCount * 50); 
        outputCount++;
      } else {
        // È UN NODO NASCOSTO (MEMORIA) -> X = 140 (Al centro)
        x = 140;
        y = 50 + (hiddenCount * 25);
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
        
        if (posIn.x >= posOut.x) ctx.quadraticCurveTo(posIn.x + 30, posIn.y - 50, posOut.x, posOut.y);
        else ctx.lineTo(posOut.x, posOut.y);
        
        const absWeight = Math.abs(c.weight);
        ctx.lineWidth = Math.max(0.5, Math.min(absWeight, 2.5)); 
        
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
}