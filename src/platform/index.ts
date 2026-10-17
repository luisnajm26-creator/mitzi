import { Capacitor } from '@capacitor/core'
import { createAndroidPlatform } from './android'
import { createElectronPlatform } from './electron'
import type { Platform } from './types'
import { createWebPlatform } from './web'

export type { Platform } from './types'

export const platform: Platform = window.mitziNative
  ? createElectronPlatform(window.mitziNative)
  : Capacitor.getPlatform() === 'android'
    ? createAndroidPlatform()
    : createWebPlatform()

/** Pantallas táctiles (teléfono/tablet) reciben gestos en vez de flechas. */
export const isTouchDevice = matchMedia('(pointer: coarse)').matches
