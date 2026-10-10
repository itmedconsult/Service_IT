import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideRouter(appRoutes)],
}).then((app) => {
  // The static host serves the app at / but does not rewrite deep links.
  // Keep the shareable query URL while showing the dedicated route in-app.
  if (new URLSearchParams(window.location.search).get('view') === 'website-prices') {
    void app.injector.get(Router).navigateByUrl('/website-prices', { skipLocationChange: true });
  }
}).catch(console.error);
