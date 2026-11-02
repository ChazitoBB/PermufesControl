import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** Identificador de la APK principal (uso real / prueba general). */
export const APP_ID_PRODUCCION = 'com.perfumescontrol.app';

/**
 * Variante Android de pruebas de restauración.
 * Puede instalarse en paralelo sin compartir datos con la principal.
 */
export const APP_ID_RESTORE_TEST = 'com.perfumescontrol.app.restoretest';

@Injectable({ providedIn: 'root' })
export class AppIdentityService {
  private listo = false;
  private applicationId = 'web';

  async inicializar(): Promise<void> {
    if (this.listo) {
      return;
    }
    if (Capacitor.isNativePlatform()) {
      try {
        const info = await App.getInfo();
        this.applicationId = info.id || APP_ID_PRODUCCION;
      } catch {
        this.applicationId = APP_ID_PRODUCCION;
      }
    } else {
      this.applicationId = 'web';
    }
    this.listo = true;
  }

  get id(): string {
    return this.applicationId;
  }

  get esRestoreTest(): boolean {
    return this.applicationId === APP_ID_RESTORE_TEST;
  }

  get esProduccionAndroid(): boolean {
    return this.applicationId === APP_ID_PRODUCCION;
  }
}
