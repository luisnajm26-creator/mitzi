import { AUTHOR, CREDITS, REPO } from '../app/author'
import { useBackHandler } from '../app/back'
import { platform } from '../platform'
import { Icon, type IconName } from '../ui/Icon'

function LinkButton({ icon, label, url, primary }: { icon: IconName; label: string; url: string; primary?: boolean }) {
  return (
    <button className={primary ? 'read-button about-link' : 'ghost-button about-link'} onClick={() => platform.openExternal(url)}>
      <Icon name={icon} size={18} />
      {label}
    </button>
  )
}

/** Quién hizo Mitzi, cómo contactarlo y con qué piezas de código abierto está hecha. */
export function About({ onClose }: { onClose(): void }) {
  useBackHandler(true, onClose)
  // sin correo configurado, el contacto lleva al perfil de GitHub
  const contact = AUTHOR.email ? `mailto:${AUTHOR.email}?subject=${encodeURIComponent('Proyecto (desde Mitzi)')}` : AUTHOR.github

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet about" onClick={e => e.stopPropagation()} role="dialog" aria-label="Acerca de Mitzi">
        <header className="sheet-header">
          <h2>Acerca de Mitzi</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>

        <div className="about-app">
          <img src="./icon.svg" alt="" className="about-icon" draggable={false} />
          <div>
            <div className="about-name">Mitzi</div>
            <div className="about-version">Versión {__MITZI_VERSION__}</div>
          </div>
        </div>
        <p className="sheet-note">Lector de EPUB y PDF, libre y de código abierto. No trae libros: tú agregas los tuyos y Mitzi los encuentra sola.</p>

        <section className="about-card">
          <div className="about-label">Hecho por</div>
          <div className="about-author">{AUTHOR.name}</div>
          {AUTHOR.tagline && <p className="about-tagline">{AUTHOR.tagline}</p>}
          <div className="about-actions">
            <LinkButton primary icon="mail" label="¿Tienes un proyecto? Hablemos" url={contact} />
            <LinkButton icon="code" label="GitHub" url={AUTHOR.github} />
            {AUTHOR.linkedin && <LinkButton icon="user" label="LinkedIn" url={AUTHOR.linkedin} />}
          </div>
        </section>

        <p className="about-ai">
          Mitzi se hizo con ayuda de Claude (IA): la idea, el diseño y las pruebas son del autor; la IA escribió gran parte del código.
        </p>

        <div className="about-actions">
          <LinkButton icon="code" label="Código fuente" url={REPO} />
          <LinkButton icon="bug" label="Reportar un problema" url={`${REPO}/issues/new`} />
          {AUTHOR.support && <LinkButton icon="heart" label="Apoyar el proyecto" url={AUTHOR.support} />}
        </div>

        <details className="about-credits">
          <summary>Créditos y licencias</summary>
          <p className="sheet-note">Mitzi es software libre con licencia MIT y usa estas piezas de código abierto:</p>
          <ul>
            {CREDITS.map(c => (
              <li key={c.name}>
                <button className="about-credit" onClick={() => platform.openExternal(c.url)}>
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.what}</small>
                  </span>
                  <span className="badge">{c.license}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  )
}
