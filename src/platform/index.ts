import { createElectronPlatform } from './electron'
import type { Platform } from './types'
import { createWebPlatform } from './web'

export type { Platform } from './types'

export const platform: Platform = window.mitziNative
  ? createElectronPlatform(window.mitziNative)
  : createWebPlatform()

/** Pantallas táctiles (teléfono/tablet) reciben gestos en vez de flechas. */
export const isTouchDevice = matchMedia('(pointer: coarse)').matches
