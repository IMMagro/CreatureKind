import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class ProfileComponent implements OnInit {
  
  // Dati Utente
  user = {
    name: 'Architetto Supreme',
    email: 'admin@creaturekind.com',
    joinDate: '20 Febbraio 2026',
    plan: 'Explorer Pro',
    credits: 1500
  };

  // Statistiche del Server di Gioco
  serverStats = {
    totalGenerations: 142,
    maxFitnessReached: 8450.2,
    extinctionEvents: 14,
    uptime: '14h 22m'
  };

  ngOnInit(): void {
    // In futuro qui faremo una chiamata API a Python per prendere i dati veri!
  }
}