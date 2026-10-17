import type { MitziNativeApi } from '../../shared/native-api'

declare global {
  interface Window {
    /** Solo existe dentro de la app de PC (Electron). */
    mitziNative?: MitziNativeApi
  }
}

export {}
