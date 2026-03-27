import { Component, OnInit } from '@angular/core';
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
  
  showAuthModal = false;
  isLoginMode = true; 
  errorMessage = '';
  authData = { username: '', email: '', password: '' };
  isLoggedIn = false; // NUOVA VARIABILE

  constructor(private router: Router, private http: HttpClient) {}

  ngOnInit() {
    // Al caricamento, controlla se hai già fatto il login in passato!
    if (localStorage.getItem('user_data')) {
      this.isLoggedIn = true;
    }
  }

  // Funzione intelligente per il bottone gigante in alto
  handleMainAction() {
    if (this.isLoggedIn) {
      this.router.navigate(['/profile']); // Vai diretto al profilo!
    } else {
      this.openAuth('register'); // Apri la registrazione
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
    const url = this.isLoginMode ? 'http://127.0.0.1:8000/api/login' : 'http://127.0.0.1:8000/api/register';
    
    this.http.post<any>(url, this.authData).subscribe({
      next: (response) => {
        if (this.isLoginMode) {
          localStorage.setItem('user_data', JSON.stringify(response));
          this.router.navigate(['/profile']); // Va dritto al profilo isolato!
        } else {
          this.isLoginMode = true;
          this.errorMessage = "Registrazione completata! Ora effettua l'accesso.";
        }
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || "Errore di connessione al server Python";
      }
    });
  }
}