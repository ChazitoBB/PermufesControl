import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'configuracion',
    loadComponent: () =>
      import('./configuracion/configuracion.page').then((m) => m.ConfiguracionPage),
  },
  {
    path: 'diezmo-historial',
    loadComponent: () =>
      import('./diezmo-historial/diezmo-historial.page').then(
        (m) => m.DiezmoHistorialPage
      ),
  },
  {
    path: 'catalogo',
    loadComponent: () =>
      import('./catalogo/catalogo.page').then((m) => m.CatalogoPage),
  },
  {
    path: 'encargos',
    loadComponent: () =>
      import('./encargos/encargos.page').then((m) => m.EncargosPage),
  },
  {
    path: 'ruleta',
    loadComponent: () =>
      import('./ruleta/ruleta.page').then((m) => m.RuletaPage),
  },
];
