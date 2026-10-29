import { Icon } from '../ui/Icon'
import { platform } from '../platform'
import { deriveTheme } from './comfort/contrast'
import { FONT_IDS, FONTS } from './comfort/fonts'
import { effectiveSettings, useReaderSettings, type ComfortSettings } from './comfort/settings'
import { CUSTOM_THEME_ID, THEMES, type ThemePreset } from './comfort/themes'
import { Section, Segment, Slider, Stepper, Toggle } from './controls'
import { VoiceServerSection } from './tts/VoiceServer'
import { playPaperSound } from './paperSound'

const GROUPS: { id: ThemePreset['group']; label: string }[] = [
  { id: 'claros', label: 'Claros' },
  { id: 'pasteles', label: 'Pasteles' },
  { id: 'oscuros', label: 'Oscuros' },
]

function Swatch({ bg, name, selected, onClick }: { bg: string; name: string; selected: boolean; onClick(): void }) {
  const t = deriveTheme(bg)
  return (
    <button className="swatch" data-on={selected} onClick={onClick} title={name} aria-label={name} aria-pressed={selected}>
      <span className="swatch-face" style={{ background: bg, color: t.fg }}>
        Aa
      </span>
      <span className="swatch-name">{name}</span>
    </button>
  )
}

interface Props {
  bookId: string
  format: 'epub' | 'pdf'
  onClose(): void
}

export function ComfortPanel({ bookId, format, onClose }: Props) {
  const state = useReaderSettings()
  const s = effectiveSettings(state, bookId)
  const onlyThisBook = !!state.perBook[bookId]
  const set = (patch: Partial<ComfortSettings>) => state.update(patch, bookId)
  const epub = format === 'epub'

  return (
    <aside className="reader-panel comfort-panel" role="dialog" aria-label="Ajustes de lectura">
      <header className="panel-header">
        <h2>Lectura cómoda</h2>
        <button className="panel-close" onClick={onClose} aria-label="Cerrar">
          <Icon name="close" />
        </button>
      </header>

      <Section title="Fondo">
        {GROUPS.map(g => (
          <div key={g.id} className="swatch-group">
            <span className="swatch-group-label">{g.label}</span>
            <div className="swatches">
              {THEMES.filter(t => t.group === g.id).map(t => (
                <Swatch key={t.id} bg={t.bg} name={t.name} selected={s.themeId === t.id} onClick={() => set({ themeId: t.id })} />
              ))}
              {g.id === 'pasteles' && (
                <label className="swatch custom" data-on={s.themeId === CUSTOM_THEME_ID} title="Color a tu gusto">
                  <span className="swatch-face" style={{ background: s.customBg, color: deriveTheme(s.customBg).fg }}>
                    Aa
                  </span>
                  <span className="swatch-name">Tu color</span>
                  <input
                    type="color"
                    value={s.customBg}
                    onChange={e => set({ customBg: e.target.value, themeId: CUSTOM_THEME_ID })}
                  />
                </label>
              )}
            </div>
          </div>
        ))}
        <p className="panel-hint">El color del texto se ajusta solo para que siempre se lea cómodo.</p>
      </Section>

      {epub && (
        <Section title="Letra">
          <div className="font-chips">
            {FONT_IDS.map(id => (
              <button key={id} data-on={s.fontId === id} onClick={() => set({ fontId: id })}>
                {FONTS[id].label}
              </button>
            ))}
          </div>
          <Stepper label="Tamaño" value={s.fontSize} min={12} max={36} step={1} onChange={v => set({ fontSize: v })} />
          <Slider label="Interlineado" value={s.lineHeight} min={1.1} max={2.4} step={0.05} format={v => v.toFixed(2)} onChange={v => set({ lineHeight: v })} />
          <Segment
            label="Espacio entre párrafos"
            value={s.paragraphSpacing}
            options={[
              { value: null, label: 'Original' },
              { value: 0.4, label: 'Poco' },
              { value: 0.8, label: 'Medio' },
              { value: 1.3, label: 'Mucho' },
            ]}
            onChange={v => set({ paragraphSpacing: v })}
          />
          <Slider label="Márgenes" value={s.margin} min={0} max={4} step={1} onChange={v => set({ margin: v })} />
          <Slider label="Ancho de línea" value={s.maxWidth} min={480} max={1000} step={20} format={v => `${v}px`} onChange={v => set({ maxWidth: v })} />
          <Toggle label="Justificar texto" checked={s.justify} onChange={v => set({ justify: v })} />
          <Toggle label="Separar palabras con guiones" checked={s.hyphenate} onChange={v => set({ hyphenate: v })} />
        </Section>
      )}

      <Section title="Página">
        {epub && (
          <Segment
            label="Lectura"
            value={s.flow}
            options={[
              { value: 'paginated', label: 'Por páginas' },
              { value: 'scrolled', label: 'Deslizando' },
            ]}
            onChange={v => set({ flow: v })}
          />
        )}
        {!epub && (
          <Segment
            label="Ajuste"
            value={s.pdfFit}
            options={[
              { value: 'page', label: 'Página completa' },
              { value: 'width', label: 'Al ancho' },
            ]}
            onChange={v => set({ pdfFit: v })}
          />
        )}
        <Segment
          label="Pantallas anchas"
          value={s.spread}
          options={[
            { value: 'auto', label: 'Libro abierto' },
            { value: 'single', label: 'Una página' },
          ]}
          onChange={v => set({ spread: v })}
        />
        <Toggle
          label="Animación al pasar página"
          hint="La hoja gira sobre el lomo, como un libro de papel"
          checked={s.animatePages}
          onChange={v => set({ animatePages: v })}
        />
        <Toggle
          label="Sonido de papel"
          hint="Una hoja real al pasar página"
          checked={s.pageSound}
          onChange={v => {
            set({ pageSound: v })
            // al encenderlo suena una vez, para saber cómo se oye
            if (v) void playPaperSound()
          }}
        />
        {platform.kind === 'android' && (
          <Toggle label="Vibración al pasar página" hint="Un toque muy leve" checked={s.haptics} onChange={v => set({ haptics: v })} />
        )}
        {epub && (
          <>
            <Toggle label="Textura de papel" hint="Un grano sutil sobre las páginas" checked={s.paperTexture} onChange={v => set({ paperTexture: v })} />
            <Toggle label="Adorno al final de cada capítulo" checked={s.chapterOrnament} onChange={v => set({ chapterOrnament: v })} />
          </>
        )}
      </Section>

      <Section title="Comodidad">
        <Slider label="Brillo" value={s.brightness} min={0.3} max={1} step={0.01} format={v => `${Math.round(v * 100)}%`} onChange={v => set({ brightness: v })} />
        <Slider label="Filtro cálido" value={s.warmth} min={0} max={1} step={0.01} format={v => `${Math.round(v * 100)}%`} onChange={v => set({ warmth: v })} />
        <Toggle label="Modo noche automático" hint="Cambia al fondo de noche en este horario" checked={s.autoNight} onChange={v => set({ autoNight: v })} />
        {s.autoNight && (
          <div className="night-config">
            <label>
              Desde <input type="time" value={s.nightStart} onChange={e => set({ nightStart: e.target.value })} />
            </label>
            <label>
              Hasta <input type="time" value={s.nightEnd} onChange={e => set({ nightEnd: e.target.value })} />
            </label>
            <div className="swatches small">
              {THEMES.filter(t => t.group === 'oscuros').map(t => (
                <Swatch key={t.id} bg={t.bg} name={t.name} selected={s.nightThemeId === t.id} onClick={() => set({ nightThemeId: t.id })} />
              ))}
            </div>
          </div>
        )}
        <Toggle label="Mantener la pantalla encendida" checked={s.keepAwake} onChange={v => set({ keepAwake: v })} />
      </Section>

      {/* solo en la PC: el servidor de voz corre ahí, y Android bloquea las conexiones http sin cifrar */}
      {platform.kind !== 'android' && <VoiceServerSection />}

      <Section title="Aplicar a">
        <Toggle
          label="Solo a este libro"
          hint={onlyThisBook ? 'Este libro guarda sus propios ajustes' : 'Los cambios aplican a todos tus libros'}
          checked={onlyThisBook}
          onChange={v => state.setBookScope(bookId, v)}
        />
      </Section>
    </aside>
  )
}
