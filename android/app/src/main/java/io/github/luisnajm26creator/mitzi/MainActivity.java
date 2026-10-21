package io.github.luisnajm26creator.mitzi;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
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
        handleOpenIntent(getIntent());
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
