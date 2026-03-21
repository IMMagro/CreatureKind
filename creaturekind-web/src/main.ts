import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app'; // IL NOME CORRETTO!
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes'; // IMPORTIAMO LE ROTTE CHE ABBIAMO CREATO
import { provideHttpClient } from '@angular/common/http'; // <-- IMPORTA QUESTO!

// Diciamo ad Angular: "Avvia il sito con AppComponent, e dagli la mappa delle Rotte"
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient() 
  ]
}).catch(err => console.error(err));