package io.github.luisnajm26creator.mitzi;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.ActionMode;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MitziLibraryPlugin.class);
        super.onCreate(savedInstanceState);
        // pantalla completa de verdad: el contenido llega hasta arriba, también junto a la
        // cámara (si no, queda una franja negra), y la app deja libre solo el hueco de la
        // cámara con los márgenes que le pasa MitziLibraryPlugin.safeArea
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attrs = getWindow().getAttributes();
            attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attrs);
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideStatusBar();
        handleOpenIntent(getIntent());
    }

    /** Sin barra de notificaciones en toda la app; deslizando desde arriba aparece un momento. */
    void hideStatusBar() {
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.statusBars());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // al volver de otra app o de un diálogo del sistema, Android la vuelve a mostrar
        if (hasFocus) hideStatusBar();
    }

    /**
     * Al seleccionar texto, solo el menú de Mitzi (colores, nota, copiar, definir, traducir,
     * compartir): el del sistema (Copiar, Compartir, Traducir…) se vacía para que no aparezca
     * encima. Las manijas para agrandar o achicar la selección siguen funcionando.
     */
    @Override
    public void onActionModeStarted(ActionMode mode) {
        super.onActionModeStarted(mode);
        if (mode.getType() == ActionMode.TYPE_FLOATING) {
            mode.getMenu().clear();
            mode.invalidateContentRect();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleOpenIntent(intent);
    }

    /** "Abrir con Mitzi" desde un gestor de archivos: el libro se copia a la biblioteca de la app. */
    private void handleOpenIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) return;
        Uri uri = intent.getData();
        new Thread(() -> {
            try {
                String name = displayName(uri);
                if (name == null || !MitziLibraryPlugin.isBook(name)) {
                    String type = getContentResolver().getType(uri);
                    name = "libro-" + System.currentTimeMillis() + MitziLibraryPlugin.extensionForType(type);
                }
                File target = new File(MitziLibraryPlugin.importedDir(this), name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                try (InputStream in = getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(target)) {
                    if (in == null) return;
                    byte[] buffer = new byte[256 * 1024];
                    int n;
                    while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                }
                MitziLibraryPlugin.libraryChanged();
            } catch (Exception ignored) {
                // archivo ilegible: no se agrega
            }
        })
            .start();
    }

    private String displayName(Uri uri) {
        if ("file".equals(uri.getScheme())) return new File(uri.getPath()).getName();
        try (Cursor c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return null;
    }
}
