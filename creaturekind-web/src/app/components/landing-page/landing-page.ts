import { Component } from '@angular/core';
import { Router } from '@angular/router'; // Serve per cambiare pagina

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [],
  templateUrl: './landing-page.html',
  styleUrls: ['./landing-page.scss']
})
export class LandingPageComponent {

  // "Iniettiamo" il navigatore di Angular nel componente
  constructor(private router: Router) {}

  // Funzione chiamata dal pulsante HTML
  enterWorld() {
    this.router.navigate(['/dashboard/profile']); 
  }

}