// primero: funciones que faltan en navegadores internos viejos (Android sin Google)
import './lib/polyfills'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/nunito'
import '@fontsource-variable/literata'
import './styles/global.css'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(<App />)
