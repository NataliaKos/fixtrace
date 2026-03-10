import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { ParticleBackgroundComponent } from './components/particle-background/particle-background.component';
import { AppStateService } from './state/app-state.service';
import { DemoTourService } from './services/demo-tour.service';
import { filter, take } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ParticleBackgroundComponent,
  ],
  template: `
    <app-particle-background />
    <router-outlet />
  `,
})
export class App implements OnInit {
  readonly appState = inject(AppStateService);
  private readonly router = inject(Router);
  readonly tourService = inject(DemoTourService);

  /** Drive the CSS pulse animation on the help button for first-time visitors. */
  readonly helpPulse = signal(!this.tourService.hasSeenTour);

  ngOnInit(): void {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.appState.activeTab.set((e as NavigationEnd).urlAfterRedirects);
      });
  }

  restartTour(): void {
    this.helpPulse.set(false);
    this.tourService.restart();
  }
}
