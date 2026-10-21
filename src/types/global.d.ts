import type { MitziNativeApi } from '../../shared/native-api'

declare global {
  /** Versión de Mitzi (la de package.json, puesta por Vite al compilar). */
  const __MITZI_VERSION__: string

  interface Window {
    /** Solo existe dentro de la app de PC (Electron). */
    mitziNative?: MitziNativeApi
  }
}

export {}
