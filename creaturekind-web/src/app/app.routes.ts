import { Routes } from '@angular/router';
import { LandingPageComponent } from './components/landing-page/landing-page';
import { DashboardLayoutComponent } from './components/dashboard-layout/dashboard-layout';
import { ProfileComponent } from './components/profile/profile';
import { SimulationViewerComponent } from './components/simulation-viewer/simulation-viewer';

export const routes: Routes = [
  // Rotta Pubblica
  { path: '', component: LandingPageComponent }, 
  
  // Rotta Privata (La Dashboard con la Sidebar)
  { 
    path: 'dashboard', 
    component: DashboardLayoutComponent,
    children: [
      { path: '', redirectTo: 'profile', pathMatch: 'full' }, // Se vai su /dashboard, ti porta al profilo
      { path: 'profile', component: ProfileComponent },       // La pagina del profilo utente
      { path: 'world', component: SimulationViewerComponent } // Il simulatore ora è DENTRO la dashboard!
    ]
  }
];