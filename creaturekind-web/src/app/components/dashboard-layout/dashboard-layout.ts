import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './dashboard-layout.html',
  styleUrls: ['./dashboard-layout.scss']
})
export class DashboardLayoutComponent implements OnInit {
  
  user = { name: '', email: '', plan: '' };
  
  // LA VARIABILE MAGICA PER IL MENU
  isSidebarOpen = true; 

  constructor(private router: Router) {}

  ngOnInit() {
    const savedUser = localStorage.getItem('user_data');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      this.user.name = parsedUser.username;
      this.user.email = parsedUser.email;
      this.user.plan = parsedUser.plan;
    } else {
      this.router.navigate(['/']);
    }
  }

  // Funzione per aprire/chiudere
  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    
    // Un piccolo trucco per far ricalcolare le dimensioni al Canvas quando la sidebar si muove!
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 350); // Aspettiamo che finisca l'animazione CSS (0.3s)
  }

  logout() {
    localStorage.removeItem('user_data');
    this.router.navigate(['/']);
  }
}