// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'site.beforepublishing.app',
  appName: 'Before Publishing',
  webDir: 'out',
  server: {
    url: 'https://www.beforepublishing.site', // ← no trailing spaces!
    cleartext: false,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;