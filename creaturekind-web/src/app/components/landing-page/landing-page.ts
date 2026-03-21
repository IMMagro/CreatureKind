import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Serve per i Form
import { HttpClient, HttpClientModule } from '@angular/common/http'; // Serve per le API


@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule], // IMPORTATI QUI!
  templateUrl: './landing-page.html',
  styleUrls: ['./landing-page.scss']
})
export class LandingPageComponent {
  
  // Variabili per il Popup
  showAuthModal = false;
  isLoginMode = true; // true = Login, false = Registrazione
  errorMessage = '';

  // Dati inseriti dall'utente
  authData = { username: '', email: '', password: '' };

  constructor(private router: Router, private http: HttpClient) {}

  // Apre il popup e decide se mostrare Login o Registrazione
  openAuth(mode: 'login' | 'register') {
    this.isLoginMode = (mode === 'login');
    this.showAuthModal = true;
    this.errorMessage = '';
  }

  closeAuth() {
    this.showAuthModal = false;
  }

  // Invia i dati a Python!
  submitAuth() {
    this.errorMessage = '';
    const url = this.isLoginMode ? 'http://127.0.0.1:8000/api/login' : 'http://127.0.0.1:8000/api/register';
    
    this.http.post<any>(url, this.authData).subscribe({
      next: (response) => {
        if (this.isLoginMode) {
          // LOGIN SUCCESSO! Salviamo i dati nel browser e andiamo nella Dashboard
          localStorage.setItem('user_data', JSON.stringify(response));
          this.router.navigate(['/dashboard/profile']);
        } else {
          // REGISTRAZIONE SUCCESSO! Passiamo in modalità Login
          this.isLoginMode = true;
          this.errorMessage = "Registrazione completata! Ora effettua l'accesso.";
        }
      },
      error: (err) => {
        this.errorMessage = err.error.detail || "Errore di connessione al server";
      }
    });
  }
}