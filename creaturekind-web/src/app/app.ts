import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router'; // IMPORTIAMO IL ROUTER

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet], // USIAMO IL ROUTEROUTLET
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent {
  title = 'creaturekind-web';
}