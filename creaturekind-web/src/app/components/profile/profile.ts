import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

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

  constructor(private http: HttpClient) {}

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

  ngOnDestroy(): void {
    if (this.statsInterval) clearInterval(this.statsInterval);
  }

  private fetchServerStats() {
    this.http.get<any>('http://127.0.0.1:8000/api/server-stats').subscribe({
      next: (stats) => {
        this.serverStats.totalGenerations = stats.totalGenerations;
        this.serverStats.maxFitnessReached = stats.maxFitnessReached;
        this.serverStats.extinctionEvents = stats.extinctionEvents;
        this.serverStats.uptime = stats.uptime;
      },
      error: (err) => console.error("Errore Statistiche:", err)
    });
  }
}