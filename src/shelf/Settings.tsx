import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBackHandler } from '../app/back'
import { useAppSettings } from '../app/settings'
import { updatesSupported } from '../app/updates'
import { platform } from '../platform'
import { db } from '../library/db'
import { syncLibrary } from '../library/scanner'
import { useLibrary } from '../library/store'
import { useCollections } from '../library/collections'
import { DEFAULT_SETTINGS, useReaderSettings } from '../reader/comfort/settings'
import { playPaperSound } from '../reader/paperSound'
import { VoiceServerSection } from '../reader/tts/VoiceServer'
import { Section, Toggle } from '../ui/controls'
import { Icon, type IconName } from '../ui/Icon'
import { AboutContent, UpdateCheck } from './About'
import { CollectionsContent } from './Collections'
import { FoldersContent, useFolders } from './Folders'
import { SyncContent } from './SyncPanel'
import { useLinks } from '../sync/links'

export type SettingsPage = 'inicio' | 'carpetas' | 'colecciones' | 'sincronizar' | 'acerca'

const TITLES: Record<SettingsPage, string> = {
  inicio: 'Configuración',
  carpetas: 'Carpetas de libros',
  colecciones: 'Colecciones',
  sincronizar: 'Sincronizar',
  acerca: 'Acerca de Mitzi',
}

function Row({ icon, title, sub, onClick }: { icon: IconName; title: string; sub?: ReactNode; onClick(): void }) {
  return (
    <button className="settings-row" onClick={onClick}>
      <span className="settings-row-icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="settings-row-text">
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <Icon name="chevron-right" size={18} />
    </button>
  )
}

/** Botón para algo que no se puede deshacer: el primer toque pide confirmar. */
function ConfirmButton({ label, confirm, done, onConfirm }: { label: string; confirm: string; done: string; onConfirm(): unknown }) {
  const [state, setState] = useState<'idle' | 'ask' | 'done'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const click = async () => {
    clearTimeout(timer.current)
    if (state === 'ask') {
      await onConfirm()
      setState('done')
      timer.current = setTimeout(() => setState('idle'), 2500)
    } else {
      setState('ask')
      // si no confirma en unos segundos, vuelve a la normalidad
      timer.current = setTimeout(() => setState('idle'), 4000)
    }
  }
  return (
    <button className="ghost-button small settings-danger" data-state={state} onClick={click} disabled={state === 'done'}>
      {state === 'ask' ? confirm : state === 'done' ? done : label}
    </button>
  )
}

function Home({ go }: { go(page: SettingsPage): void }) {
  const app = useAppSettings()
  const reading = useReaderSettings(s => s.global)
  const updateReading = useReaderSettings(s => s.update)
  const collections = useCollections(s => s.list)
  const [folders] = useFolders()
  const scanning = useLibrary(s => s.scanning)
  const count = useLibrary(s => s.books.length)
  const folderCount = folders?.folders.length ?? 0
  const linkedHost = useLinks(s => s.host)
  const guests = useLinks(s => s.guests)
  const syncSub = linkedHost
    ? `Vinculado con ${linkedHost.label}`
    : guests.length
      ? `${guests.length} ${guests.length === 1 ? 'equipo vinculado' : 'equipos vinculados'}`
      : 'Tu avance y tus notas entre el teléfono y la PC, por Wi-Fi'

  return (
    <>
      <nav className="settings-rows">
        <Row
          icon="folder"
          title="Carpetas de libros"
          sub={folders ? `${folderCount} ${folderCount === 1 ? 'carpeta' : 'carpetas'} · ${count} ${count === 1 ? 'libro' : 'libros'}` : null}
          onClick={() => go('carpetas')}
        />
        <Row
          icon="collection"
          title="Colecciones"
          sub={collections.length ? `${collections.length} ${collections.length === 1 ? 'colección' : 'colecciones'}` : 'Favoritos, por leer, lo que quieras'}
          onClick={() => go('colecciones')}
        />
        <Row icon="sync" title="Sincronizar" sub={syncSub} onClick={() => go('sincronizar')} />
        <Row icon="info" title="Acerca de Mitzi" sub={`Versión ${__MITZI_VERSION__} · autor, privacidad y licencias`} onClick={() => go('acerca')} />
      </nav>

      <Section title="Biblioteca">
        <Toggle label="Giro del libro" hint="El libro del centro da vueltas bajo la luz" checked={app.shelfSpin} onChange={v => app.set({ shelfSpin: v })} />
        <Toggle
          label="Polvo en la luz"
          hint={app.batterySaver ? 'Apagado por el ahorro de batería' : 'Partículas que flotan en el haz'}
          checked={app.shelfDust && !app.batterySaver}
          onChange={v => app.set({ shelfDust: v })}
        />
        <Toggle
          label="Ahorro de batería"
          hint="Menos resolución en la biblioteca 3D, sin polvo y se pausa antes"
          checked={app.batterySaver}
          onChange={v => app.set({ batterySaver: v })}
        />
        <div className="settings-actions">
          <button className="ghost-button small" onClick={() => syncLibrary()} disabled={!!scanning}>
            {scanning ? `Revisando… ${scanning.done} / ${scanning.total}` : 'Revisar las carpetas ahora'}
          </button>
        </div>
      </Section>

      <Section title="Lectura">
        <Toggle
          label="Animación al pasar página"
          hint="La hoja gira sobre el lomo, como un libro de papel"
          checked={reading.animatePages}
          onChange={v => updateReading({ animatePages: v })}
        />
        <Toggle
          label="Sonido de papel"
          hint="Una hoja real al pasar página"
          checked={reading.pageSound}
          onChange={v => {
            updateReading({ pageSound: v })
            if (v) void playPaperSound()
          }}
        />
        {platform.kind === 'android' && (
          <Toggle label="Vibración al pasar página" hint="Un toque muy leve" checked={reading.haptics} onChange={v => updateReading({ haptics: v })} />
        )}
        <Toggle label="Mantener la pantalla encendida" hint="Mientras lees" checked={reading.keepAwake} onChange={v => updateReading({ keepAwake: v })} />
        <p className="panel-hint">Aplican a todos tus libros. El fondo, la letra y lo demás se cambian con el botón Aa mientras lees.</p>
        <div className="settings-actions">
          <ConfirmButton
            label="Restablecer los ajustes de lectura"
            confirm="¿Seguro? Toca otra vez"
            done="Listo"
            onConfirm={() => useReaderSettings.setState({ global: { ...DEFAULT_SETTINGS, dailyGoal: reading.dailyGoal }, perBook: {} })}
          />
        </div>
      </Section>

      {/* solo en la PC: el servidor de voz corre ahí, y Android bloquea las conexiones http sin cifrar */}
      {platform.kind !== 'android' && <VoiceServerSection />}

      {updatesSupported() && (
        <Section title="Actualizaciones">
          <Toggle
            label="Buscar actualizaciones"
            hint="Una vez al día, en las versiones publicadas en GitHub"
            checked={app.autoUpdates}
            onChange={v => app.set({ autoUpdates: v })}
          />
          <UpdateCheck />
        </Section>
      )}

      <Section title="Tus datos">
        <p className="panel-hint">Todo se guarda solo en este dispositivo. Borrar algo aquí no toca tus archivos de libros.</p>
        <div className="settings-actions">
          <ConfirmButton
            label="Borrar las estadísticas de lectura"
            confirm="¿Borrar minutos, páginas y rachas?"
            done="Borradas"
            onConfirm={() => db.readingDays.clear()}
          />
        </div>
      </Section>
    </>
  )
}

/** Configuración de la app: carpetas, colecciones, sincronizar, biblioteca, lectura y «Acerca de». */
export function Settings({ initialPage = 'inicio', onClose }: { initialPage?: SettingsPage; onClose(): void }) {
  const [page, setPage] = useState<SettingsPage>(initialPage)
  const body = useRef<HTMLDivElement>(null)
  // atrás: de una sección vuelve al inicio de Configuración; desde el inicio, cierra
  useBackHandler(true, () => (page === 'inicio' || initialPage !== 'inicio' ? onClose() : setPage('inicio')))
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [page])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={body} className="sheet settings" onClick={e => e.stopPropagation()} role="dialog" aria-label={TITLES[page]}>
        <header className="sheet-header settings-header">
          {page !== 'inicio' && initialPage === 'inicio' && (
            <button className="icon-button" onClick={() => setPage('inicio')} aria-label="Volver a Configuración">
              <Icon name="back" />
            </button>
          )}
          <h2>{TITLES[page]}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>
        {page === 'inicio' && <Home go={setPage} />}
        {page === 'carpetas' && <FoldersContent />}
        {page === 'colecciones' && <CollectionsContent />}
        {page === 'sincronizar' && <SyncContent />}
        {page === 'acerca' && <AboutContent />}
      </div>
    </div>
  )
}
