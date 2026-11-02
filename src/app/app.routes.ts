import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'diezmo-historial',
    loadComponent: () =>
      import('./diezmo-historial/diezmo-historial.page').then(
        (m) => m.DiezmoHistorialPage
      ),
  },
];
