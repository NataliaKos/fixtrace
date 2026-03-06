import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { ParticleBackgroundComponent } from './components/particle-background/particle-background.component';
import { AppStateService } from './state/app-state.service';
import { ChatPanelComponent } from './components/chat-panel/chat-panel.component';
import { DemoTourComponent } from './components/demo-tour/demo-tour.component';
import { DemoTourService } from './services/demo-tour.service';
import { filter, take } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ParticleBackgroundComponent,
    ChatPanelComponent,
    DemoTourComponent,
  ],
  template: `
    <app-particle-background />
    <div class="min-h-screen bg-base-200/80 flex flex-col relative z-10">

      <main class="flex-1 animate-fade-up">
        <router-outlet />
      </main>

    </div>

    <!-- AI Avatar chat panel — lives outside the animated container so
         position:fixed works correctly (CSS transform splits the stacking context) -->
    <app-chat-panel />

    <!-- Demo tour overlay — must be outside any CSS-transformed containers -->
    <app-demo-tour />
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

    // Start tour after the first navigation completes so the lazy-loaded
    // route component is fully rendered and data-tour elements are in the DOM.
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      take(1),
    ).subscribe(() => {
      this.tourService.startIfFirstVisit();
    });
  }

  restartTour(): void {
    this.helpPulse.set(false);
    this.tourService.restart();
  }
}
