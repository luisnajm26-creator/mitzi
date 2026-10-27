import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.luisnajm26creator.mitzi',
  appName: 'Mitzi',
  webDir: 'dist',
  backgroundColor: '#0d0b12',
  android: {
    // sin servicios de Google: Mitzi funciona igual en Huawei y otros Android
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    // los márgenes de la pantalla los maneja Mitzi (MainActivity y platform/android.ts)
    SystemBars: { insetsHandling: 'disable' },
  },
}

export default config
