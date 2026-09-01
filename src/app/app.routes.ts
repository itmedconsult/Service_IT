import type { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/price-control/price-control-page.component').then((module) => module.PriceControlPageComponent),
  },
  { path: '**', redirectTo: '' },
];
