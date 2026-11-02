import type { CapacitorConfig } from '@capacitor/cli';

/**
 * appId estable para actualizaciones en Play Store / sideload.
 * No cambiar una vez publicada la primera APK de producción.
 */
const config: CapacitorConfig = {
  appId: 'com.perfumescontrol.app',
  appName: 'PerfumesControl',
  webDir: 'www',
  android: {
    allowMixedContent: false
  },
  server: {
    // App 100% offline para operaciones de negocio; no hay URL remota.
    cleartext: false
  }
};

export default config;
