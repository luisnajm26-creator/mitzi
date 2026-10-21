// Tipos mínimos de la librería `hyphen` (separación silábica): un módulo por idioma.
declare module 'hyphen/*' {
  export function hyphenateSync(text: string, options?: { minWordLength?: number; hyphenChar?: string }): string
}
