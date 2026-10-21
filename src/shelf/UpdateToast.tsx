import { installUpdate, useUpdates } from '../app/updates'
import { platform } from '../platform'

/** Aviso de versión nueva: se instala desde la misma app (sin tiendas ni terceros). */
export function UpdateToast() {
  const { info, progress, error, dismissed } = useUpdates()
  if (!info || dismissed) return null
  const downloading = progress !== null
  return (
    <div className="update-toast" role="status">
      <div className="update-text">
        <strong>Mitzi {info.version} está disponible</strong>
        {downloading ? (
          <span className="update-bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        ) : (
          <span className="update-sub">{error ?? (platform.kind === 'android' ? 'Se descarga aquí mismo y Android te pedirá instalarla.' : 'Se descarga, se instala y Mitzi se vuelve a abrir.')}</span>
        )}
      </div>
      {!downloading && (
        <div className="update-actions">
          {info.pageUrl && (
            <button className="ghost-button small" onClick={() => platform.openExternal(info.pageUrl)}>
              Novedades
            </button>
          )}
          <button className="ghost-button small" onClick={() => useUpdates.setState({ dismissed: true })}>
            Después
          </button>
          <button className="read-button small" onClick={installUpdate}>
            Actualizar
          </button>
        </div>
      )}
    </div>
  )
}
