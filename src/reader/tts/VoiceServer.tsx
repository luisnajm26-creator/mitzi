import { useState } from 'react'
import { Section } from '../../ui/controls'
import { loadVoiceServer, saveVoiceServer, serverVoices } from './backends'

const DEFAULT_URL = 'http://localhost:8880/v1'

/**
 * Voces naturales en la PC: Mitzi se conecta a un servidor de voz que tú abres
 * (Kokoro-FastAPI u otro con la API de OpenAI). Sin servidor, todo sigue con las voces del sistema.
 */
export function VoiceServerSection() {
  const saved = loadVoiceServer()
  const [url, setUrl] = useState(saved?.url ?? DEFAULT_URL)
  const [model, setModel] = useState(saved?.model ?? 'kokoro')
  const [status, setStatus] = useState<string>(saved ? 'Conectado la última vez' : '')
  const [busy, setBusy] = useState(false)

  const test = async () => {
    const config = { url: url.trim(), model: model.trim() || 'kokoro' }
    setBusy(true)
    setStatus('Probando…')
    try {
      const voices = await serverVoices(config)
      if (!voices.length) throw new Error('no ofrece voces')
      saveVoiceServer(config)
      setStatus(`Conectado: ${voices.length} voces. Elígelas en la barra de lectura en voz alta.`)
    } catch (e) {
      setStatus(`No se pudo conectar (${e instanceof Error ? e.message : 'sin respuesta'}). ¿Está abierto el servidor?`)
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    saveVoiceServer(null)
    setStatus('Quitado: solo se usan las voces del sistema')
  }

  return (
    <Section title="Voces naturales">
      <p className="voice-server-note">
        Si tienes un servidor de voz en esta PC (por ejemplo Kokoro-FastAPI), sus voces aparecen junto a las del sistema.
      </p>
      <label className="voice-server-field">
        Dirección
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder={DEFAULT_URL} spellCheck={false} />
      </label>
      <label className="voice-server-field">
        Modelo
        <input value={model} onChange={e => setModel(e.target.value)} placeholder="kokoro" spellCheck={false} />
      </label>
      <div className="voice-server-actions">
        <button onClick={test} disabled={busy || !url.trim()}>
          Probar conexión
        </button>
        {saved && <button onClick={remove}>Quitar</button>}
      </div>
      {status && <p className="voice-server-status">{status}</p>}
    </Section>
  )
}
