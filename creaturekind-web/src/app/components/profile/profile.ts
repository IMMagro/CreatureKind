import { Component, OnInit, OnDestroy } from '@angular/core';
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
  
  user = { name: '', email: '', joinDate: 'Oggi', plan: '', credits: 0 };
  serverStats = { totalGenerations: 0, maxFitnessReached: 0, extinctionEvents: 0, uptime: 'Calcolando...' };
  private statsInterval: any;

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    // PRENDE I DATI REALI DAL BROWSER (Inviati dal DB Python al login!)
    const savedUser = localStorage.getItem('user_data');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      this.user.name = parsed.username;
      this.user.email = parsed.email;
      this.user.plan = parsed.plan;
      this.user.credits = parsed.dna_credits;
    }

    // Le statistiche server continuano a funzionare in tempo reale!
    this.fetchServerStats();
    this.statsInterval = setInterval(() => { this.fetchServerStats(); }, 2000);
  }
  // --- NAVIGAZIONE ---
  enterWorld() {
    this.router.navigate(['/world']); // Ti lancia dritto a tutto schermo!
  }

  logout() {
    localStorage.removeItem('user_data');
    this.router.navigate(['/']); // Ti riporta alla Landing Page vetrina!
  }

  ngOnDestroy(): void {
    if (this.statsInterval) clearInterval(this.statsInterval);
  }

  private fetchServerStats() {
    this.http.get<any>('http://192.168.1.19:8000/api/server-stats').subscribe({
      next: (stats) => {
        this.serverStats.totalGenerations = stats.totalGenerations;
        this.serverStats.maxFitnessReached = stats.maxFitnessReached;
        this.serverStats.extinctionEvents = stats.extinctionEvents;
        this.serverStats.uptime = stats.uptime;
      },
      error: (err) => console.error("Errore Statistiche:", err)
    });
  }
  rechargeCredits() {
    this.http.post<any>('http://192.168.1.19:8000/api/recharge', { email: this.user.email }).subscribe({
      next: (res) => {
        this.user.credits = res.new_credits;
        // Aggiorna anche il salvataggio locale
        const saved = JSON.parse(localStorage.getItem('user_data')!);
        saved.dna_credits = res.new_credits;
        localStorage.setItem('user_data', JSON.stringify(saved));
      }
    });
  }
}