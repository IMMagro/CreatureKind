import { Routes } from '@angular/router';
import { LandingPageComponent } from './components/landing-page/landing-page';
import { SimulationViewerComponent } from './components/simulation-viewer/simulation-viewer';

export const routes: Routes = [
  { path: '', component: LandingPageComponent },        // La root (localhost:4200) carica la Landing
  { path: 'world', component: SimulationViewerComponent } // localhost:4200/world carica il Gioco
];