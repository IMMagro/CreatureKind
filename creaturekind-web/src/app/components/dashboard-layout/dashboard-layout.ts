import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive], // FONDAMENTALI PER LA NAVIGAZIONE
  templateUrl: './dashboard-layout.html',
  styleUrls: ['./dashboard-layout.scss']
})
export class DashboardLayoutComponent {
  // Finti dati utente in attesa del Database in Python
  user = {
    name: 'Architetto',
    email: 'admin@creaturekind.com',
    plan: 'Explorer' // Il piano premium che abbiamo creato nella landing!
  };
}