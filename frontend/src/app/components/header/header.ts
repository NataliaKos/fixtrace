import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { AppStateService } from '../../state/app-state.service';
import { DemoTourService } from '../../services/demo-tour.service';
import { filter, take } from 'rxjs/operators';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
  ],
  template: `
    <header class="h-14 flex items-center px-6 bg-base-100/90 backdrop-blur-sm border-b border-base-300/60 sticky top-0 z-50">

      <!-- Logo -->
      <a
        routerLink="/"
        aria-label="FixTrace home"
        class="flex items-center gap-2 mr-8 group"
        data-tour="logo"
      >
        <div class="w-6 h-6 rounded-md bg-base-content flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-110">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-base-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </div>
        <span class="font-semibold text-sm text-base-content tracking-tight">FixTrace</span>
      </a>

      <!-- Main navigation -->
      <nav class="flex items-center gap-1 flex-1" aria-label="Main navigation">
        <a
          routerLink="/analyzer"
          routerLinkActive="bg-base-200 text-base-content"
          class="px-3 py-1.5 rounded-md text-sm text-base-content/70 hover:text-base-content hover:bg-base-200 transition-all duration-150 font-medium"
          data-tour="nav-analyzer"
        >Analyzer</a>
      </nav>

      <!-- Theme toggle -->
      <button
        class="btn btn-ghost btn-sm btn-circle"
        (click)="appState.toggleTheme()"
        [title]="appState.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        aria-label="Toggle theme"
        data-tour="theme-toggle"
      >
        @if (appState.theme() === 'dark') {
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        } @else {
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
        }
      </button>

      <!-- Help / restart tour "?" button -->
      <button
        class="demo-tour-help-btn ml-1"
        [class.demo-tour-help-btn--pulse]="helpPulse()"
        (click)="restartTour()"
        type="button"
        title="Replay the feature tour"
        aria-label="Replay the feature tour"
        data-tour="help-btn"
      >?</button>

    </header>
  `,
})
export class HeaderComponent implements OnInit {
  readonly appState = inject(AppStateService);
  private readonly router = inject(Router);
  readonly tourService = inject(DemoTourService);

  /** Drive the CSS pulse animation on the help button for first-time visitors. */
  readonly helpPulse = signal(!this.tourService.hasSeenTour);

  ngOnInit(): void {
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
