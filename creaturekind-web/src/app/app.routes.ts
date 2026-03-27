import { Routes } from '@angular/router';
import { LandingPageComponent } from './components/landing-page/landing-page';
import { ProfileComponent } from './components/profile/profile';
import { SimulationViewerComponent } from './components/simulation-viewer/simulation-viewer';

export const routes: Routes = [
  { path: '', component: LandingPageComponent }, // Vetrina Pubblica
  { path: 'profile', component: ProfileComponent }, // Area Personale
  { path: 'world', component: SimulationViewerComponent }, // Il Gioco a tutto schermo!
  { path: '**', redirectTo: '' } // Se scrivi un URL sbagliato, torna alla home
];