package io.github.luisnajm26creator.mitzi;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;

/**
 * Biblioteca de Mitzi en Android: carpetas elegidas con el selector del sistema (sin
 * pedir acceso a todo el almacenamiento), lectura de los libros y ajustes de pantalla.
 */
@CapacitorPlugin(name = "MitziLibrary")
public class MitziLibraryPlugin extends Plugin {

    private static final String PREFS = "mitzi";
    private static final String KEY_FOLDERS = "folders";
    private static final int MAX_DEPTH = 8;
    /** Copias temporales de libros que se conservan en caché. */
    private static final int CACHE_KEEP = 3;
    private static MitziLibraryPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** Avisa a la app que la biblioteca cambió (p. ej. tras "Abrir con Mitzi"). */
    static void libraryChanged() {
        if (instance != null) instance.notifyListeners("libraryChanged", new JSObject());
    }

    /** Carpeta propia de la app donde se guardan los libros abiertos desde otras apps. */
    static File importedDir(Context context) {
        File dir = new File(context.getFilesDir(), "Libros");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    static boolean isBook(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".epub") || lower.endsWith(".pdf");
    }

    // ---------- carpetas ----------

    private List<String> loadFolders() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        List<String> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_FOLDERS, "[]"));
            for (int i = 0; i < arr.length(); i++) list.add(arr.getString(i));
        } catch (Exception ignored) {}
        return list;
    }

    private void saveFolders(List<String> folders) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_FOLDERS, new JSONArray(folders).toString()).apply();
    }

    @PluginMethod
    public void getFolders(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("folders", new JSArray(loadFolders()));
        call.resolve(ret);
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            ret.put("added", false);
            call.resolve(ret);
            return;
        }
        Uri uri = data.getData();
        try {
            // el permiso se conserva aunque se reinicie el teléfono
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("No se pudo conservar el acceso a la carpeta");
            return;
        }
        List<String> folders = loadFolders();
        if (!folders.contains(uri.toString())) {
            folders.add(uri.toString());
            saveFolders(folders);
        }
        ret.put("added", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void removeFolder(PluginCall call) {
        String uri = call.getString("uri", "");
        List<String> folders = loadFolders();
        folders.remove(uri);
        saveFolders(folders);
        try {
            getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {}
        call.resolve();
    }

    // ---------- libros ----------

    @PluginMethod
    public void scan(PluginCall call) {
        new Thread(() -> {
            JSArray out = new JSArray();
            JSArray failed = new JSArray();
            ContentResolver resolver = getContext().getContentResolver();
            for (String folder : loadFolders()) {
                try {
                    Uri tree = Uri.parse(folder);
                    walk(resolver, tree, DocumentsContract.getTreeDocumentId(tree), 0, out);
                } catch (Exception e) {
                    // carpeta borrada o sin permiso: se avisa para no dar sus libros por perdidos
                    failed.put(folder);
                }
            }
            File[] imported = importedDir(getContext()).listFiles();
            if (imported != null) {
                for (File file : imported) {
                    if (!file.isFile() || !isBook(file.getName())) continue;
                    JSObject f = new JSObject();
                    f.put("path", Uri.fromFile(file).toString());
                    f.put("name", file.getName());
                    f.put("size", file.length());
                    f.put("mtime", file.lastModified());
                    out.put(f);
                }
            }
            JSObject ret = new JSObject();
            ret.put("files", out);
            ret.put("failed", failed);
            call.resolve(ret);
        })
            .start();
    }

    private void walk(ContentResolver resolver, Uri tree, String docId, int depth, JSArray out) {
        if (depth > MAX_DEPTH) return;
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        String[] columns = {
            Document.COLUMN_DOCUMENT_ID,
            Document.COLUMN_DISPLAY_NAME,
            Document.COLUMN_MIME_TYPE,
            Document.COLUMN_SIZE,
            Document.COLUMN_LAST_MODIFIED
        };
        try (Cursor c = resolver.query(children, columns, null, null, null)) {
            if (c == null) throw new IllegalStateException("Sin acceso a la carpeta");
            while (c.moveToNext()) {
                String id = c.getString(0);
                String name = c.getString(1);
                String mime = c.getString(2);
                if (name == null || name.startsWith(".")) continue;
                if (Document.MIME_TYPE_DIR.equals(mime)) {
                    walk(resolver, tree, id, depth + 1, out);
                } else if (isBook(name) && c.getLong(3) > 0) {
                    JSObject f = new JSObject();
                    f.put("path", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                    f.put("name", name);
                    f.put("size", c.getLong(3));
                    f.put("mtime", c.getLong(4));
                    out.put(f);
                }
            }
        }
    }

    /**
     * Copia el libro a la caché de la app y devuelve su ruta; la app lo lee desde ahí
     * (más rápido que pasar el archivo entero por el puente de JavaScript).
     */
    @PluginMethod
    public void readFile(PluginCall call) {
        String path = call.getString("path", "");
        new Thread(() -> {
            try {
                Uri uri = Uri.parse(path);
                if ("file".equals(uri.getScheme())) {
                    File file = new File(uri.getPath());
                    if (!file.getCanonicalPath().startsWith(importedDir(getContext()).getCanonicalPath())) {
                        call.reject("Ruta fuera de la biblioteca");
                        return;
                    }
                    JSObject ret = new JSObject();
                    ret.put("path", file.getAbsolutePath());
                    call.resolve(ret);
                    return;
                }
                File cache = new File(getContext().getCacheDir(), "libros");
                if (!cache.exists()) cache.mkdirs();
                String ext = path.toLowerCase(Locale.ROOT).endsWith(".pdf") || path.toLowerCase(Locale.ROOT).contains(".pdf") ? ".pdf" : ".epub";
                File out = new File(cache, Integer.toHexString(path.hashCode()) + ext);
                try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
                    if (in == null) throw new Exception("No se pudo abrir el archivo");
                    byte[] buffer = new byte[256 * 1024];
                    int n;
                    while ((n = in.read(buffer)) > 0) os.write(buffer, 0, n);
                }
                out.setLastModified(System.currentTimeMillis());
                pruneCache(cache);
                JSObject ret = new JSObject();
                ret.put("path", out.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("No se pudo leer el libro: " + e.getMessage());
            }
        })
            .start();
    }

    private void pruneCache(File cache) {
        File[] files = cache.listFiles();
        if (files == null || files.length <= CACHE_KEEP) return;
        Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        for (int i = CACHE_KEEP; i < files.length; i++) files[i].delete();
    }

    // ---------- pantalla ----------

    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity()
            .runOnUiThread(() -> {
                Window window = getActivity().getWindow();
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                call.resolve();
            });
    }

    /**
     * Pide la frecuencia de pantalla más alta (120 Hz en el Pura 70 Ultra) mientras hay
     * animación, y la devuelve al sistema en reposo para no gastar batería.
     */
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void setHighRefresh(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity()
            .runOnUiThread(() -> {
                Window window = getActivity().getWindow();
                WindowManager.LayoutParams params = window.getAttributes();
                int modeId = 0;
                float rate = 0;
                if (on) {
                    Display display = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        ? getActivity().getDisplay()
                        : getActivity().getWindowManager().getDefaultDisplay();
                    if (display != null) {
                        Display.Mode current = display.getMode();
                        Display.Mode best = current;
                        for (Display.Mode m : display.getSupportedModes()) {
                            boolean sameSize = m.getPhysicalWidth() == current.getPhysicalWidth() && m.getPhysicalHeight() == current.getPhysicalHeight();
                            if (sameSize && m.getRefreshRate() > best.getRefreshRate()) best = m;
                        }
                        modeId = best.getModeId();
                        rate = best.getRefreshRate();
                    }
                }
                // el modo y la frecuencia: algunos teléfonos (p. ej. Huawei con LTPO) solo respetan uno de los dos
                if (params.preferredDisplayModeId != modeId || params.preferredRefreshRate != rate) {
                    params.preferredDisplayModeId = modeId;
                    params.preferredRefreshRate = rate;
                    window.setAttributes(params);
                }
                call.resolve();
            });
    }
}
