/**
 * Datos del autor para la pantalla «Acerca de Mitzi». Lo que quede vacío no se muestra.
 *
 * PENDIENTE (Luis): escribir tu frase de presentación y confirmar el correo
 * (lo escribiste «luisnajm26@gmai.com»: ¿es @gmail.com?). Ojo: lo que pongas aquí
 * queda público en GitHub.
 */
export const AUTHOR = {
  name: 'Luis Angel Lopez',
  /** Una frase corta, con tus palabras. Ej.: «Desarrollador en formación · apps para PC y Android». */
  tagline:
    'Hola, soy Luis A. Hice Mitzi por puro gusto personal, a raíz de mi afición reciente por la lectura. Si te interesa hacer un proyecto juntos, me encantará que me contactes. «The Universe is, and we are.»',
  github: 'https://github.com/luisnajm26-creator',
  /** Correo para proyectos. Vacío: el botón de contacto lleva a tu GitHub. */
  email: 'luisnajm26@gmail.com',
  linkedin: '',
  /** Enlace de apoyo voluntario (Ko-fi, GitHub Sponsors…). Opcional. */
  support: '',
}

export const REPO = 'https://github.com/luisnajm26-creator/mitzi'

/** Lo que usa Mitzi y sus licencias (algunas, como Apache y OFL, piden mencionarlo). */
export const CREDITS: { name: string; what: string; license: string; url: string }[] = [
  { name: 'foliate-js', what: 'Motor para leer EPUB', license: 'MIT', url: 'https://github.com/johnfactotum/foliate-js' },
  { name: 'pdf.js', what: 'Lectura de PDF (Mozilla)', license: 'Apache-2.0', url: 'https://github.com/mozilla/pdf.js' },
  { name: 'three.js', what: 'La biblioteca en 3D', license: 'MIT', url: 'https://threejs.org' },
  { name: 'React Three Fiber', what: 'three.js con React', license: 'MIT', url: 'https://github.com/pmndrs/react-three-fiber' },
  { name: 'React', what: 'Interfaz', license: 'MIT', url: 'https://react.dev' },
  { name: 'Dexie', what: 'Base de datos local', license: 'Apache-2.0', url: 'https://dexie.org' },
  { name: 'zustand', what: 'Estado de la app', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
  { name: 'Electron', what: 'App de escritorio', license: 'MIT', url: 'https://www.electronjs.org' },
  { name: 'Capacitor', what: 'App de Android', license: 'MIT', url: 'https://capacitorjs.com' },
  { name: 'Capacitor Text to Speech', what: 'Voz en Android', license: 'MIT', url: 'https://github.com/capacitor-community/text-to-speech' },
  { name: '@noble/hashes', what: 'Huella de cada libro', license: 'MIT', url: 'https://github.com/paulmillr/noble-hashes' },
  { name: 'Kenney · RPG Audio', what: 'Sonido de hoja al pasar página', license: 'CC0', url: 'https://kenney.nl/assets/rpg-audio' },
  { name: 'hyphen', what: 'Separación silábica (patrones de hyph-utf8)', license: 'ISC', url: 'https://github.com/ytiurin/hyphen' },
  { name: 'Literata, Merriweather, Nunito, Atkinson Hyperlegible, OpenDyslexic', what: 'Fuentes', license: 'OFL-1.1', url: 'https://fontsource.org' },
]
