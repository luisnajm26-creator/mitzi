package io.github.luisnajm26creator.mitzi;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.view.Display;
import android.view.HapticFeedbackConstants;
import android.view.Window;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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

    /** Los formatos que Mitzi abre (ver src/library/formats.ts). */
    private static final String[] BOOK_EXTENSIONS = { ".epub", ".pdf", ".mobi", ".azw", ".azw3", ".fb2", ".fbz", ".cbz" };

    static boolean isBook(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        for (String ext : BOOK_EXTENSIONS) if (lower.endsWith(ext)) return true;
        return false;
    }

    /** Extensión del libro según su nombre o ruta (la más larga que coincida: .azw3 antes que .azw). */
    static String extensionOf(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        String best = ".epub";
        for (String ext : BOOK_EXTENSIONS) if (lower.endsWith(ext) && ext.length() >= best.length()) best = ext;
        return best;
    }

    /** Extensión según el tipo de archivo que informa Android (cuando no hay nombre). */
    static String extensionForType(String type) {
        if (type == null) return ".epub";
        switch (type) {
            case "application/pdf": return ".pdf";
            case "application/x-mobipocket-ebook": return ".mobi";
            case "application/vnd.amazon.ebook": return ".azw3";
            case "application/x-fictionbook+xml":
            case "application/x-fictionbook": return ".fb2";
            case "application/vnd.comicbook+zip":
            case "application/x-cbz": return ".cbz";
            default: return ".epub";
        }
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
                String ext = extensionOf(Uri.decode(path));
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

    /** Abre un enlace en el navegador o la app de correo del teléfono (solo https y mailto). */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!(url.startsWith("https://") || url.startsWith("mailto:"))) {
            call.reject("Dirección no permitida");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No hay una app para abrirlo");
        }
    }

    /**
     * Ofrece el texto seleccionado a las apps que saben procesarlo (traductores,
     * diccionarios). Si no hay ninguna, avisa para que Mitzi abra la web.
     */
    @PluginMethod
    public void processText(PluginCall call) {
        String text = call.getString("text", "");
        Intent intent = new Intent(Intent.ACTION_PROCESS_TEXT);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_PROCESS_TEXT, text);
        intent.putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true);
        JSObject ret = new JSObject();
        if (getContext().getPackageManager().queryIntentActivities(intent, 0).isEmpty()) {
            ret.put("handled", false);
            call.resolve(ret);
            return;
        }
        Intent chooser = Intent.createChooser(intent, "Abrir con");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(chooser);
        ret.put("handled", true);
        call.resolve(ret);
    }

    /**
     * Márgenes que la app debe dejar libres, en píxeles CSS: el hueco de la cámara y las barras
     * del sistema que estén a la vista (las ocultas no cuentan). Ver MainActivity.
     */
    @PluginMethod
    public void safeArea(PluginCall call) {
        getActivity()
            .runOnUiThread(() -> {
                JSObject ret = new JSObject();
                android.view.WindowInsets raw = getActivity().getWindow().getDecorView().getRootWindowInsets();
                float density = getContext().getResources().getDisplayMetrics().density;
                if (raw != null) {
                    androidx.core.graphics.Insets i = androidx.core.view.WindowInsetsCompat.toWindowInsetsCompat(raw)
                        .getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars() | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
                    ret.put("top", i.top / density);
                    ret.put("right", i.right / density);
                    ret.put("bottom", i.bottom / density);
                    ret.put("left", i.left / density);
                }
                call.resolve(ret);
            });
    }

    /** Un toque de vibración muy leve (respeta la configuración del teléfono; no pide permisos). */
    @PluginMethod
    public void haptic(PluginCall call) {
        getActivity()
            .runOnUiThread(() -> {
                getBridge().getWebView().performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
                call.resolve();
            });
    }

    /** Comparte una imagen (la tarjeta de una cita) con el menú de compartir del sistema. */
    @PluginMethod
    public void shareImage(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "mitzi-cita.png").replaceAll("[^A-Za-z0-9._-]", "_");
        if (data == null) {
            call.reject("Falta la imagen");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "compartir");
            dir.mkdirs();
            // solo la última: no se acumulan imágenes en la caché
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();
            File file = new File(dir, name);
            try (OutputStream out = new FileOutputStream(file)) {
                out.write(android.util.Base64.decode(data, android.util.Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("image/png");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(intent, "Compartir cita");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo compartir: " + e.getMessage());
        }
    }

    // ---------- sincronizar por Wi-Fi ----------

    /**
     * Manda la sincronización (ya cifrada por la app) a la PC de la red local y devuelve su
     * respuesta. Va por un socket propio y no por HttpURLConnection: Android bloquea el http sin
     * cifrar en las conexiones normales, y abrirlo para toda la app sería menos seguro. Los datos
     * viajan cifrados con el código de la PC, así que nadie en la red puede leerlos.
     */
    @PluginMethod
    public void syncRequest(PluginCall call) {
        JSArray hosts = call.getArray("hosts");
        int port = call.getInt("port", 47123);
        String body = call.getString("body", "");
        new Thread(() -> {
            String error = "No se encontró la PC en la red";
            try {
                for (int i = 0; i < hosts.length(); i++) {
                    String host = hosts.getString(i);
                    // solo direcciones de la red local: no sirve para mandar datos a internet
                    if (!host.matches("^(192\\.168|10|172\\.(1[6-9]|2[0-9]|3[01]))(\\.[0-9]{1,3}){2,3}$")) continue;
                    try {
                        String reply = postLocal(host, port, body);
                        JSObject result = new JSObject();
                        result.put("body", reply);
                        call.resolve(result);
                        return;
                    } catch (SecurityException e) {
                        call.reject(e.getMessage());
                        return;
                    } catch (Exception e) {
                        error = "No responde (" + host + "): " + e.getMessage();
                    }
                }
            } catch (Exception e) {
                error = e.getMessage();
            }
            call.reject(error);
        }).start();
    }

    /**
     * Pregunta en la red local «¿dónde hay una PC con Mitzi?» (un mensaje UDP a toda la red) y
     * junta las respuestas: así el teléfono encuentra a su PC aunque haya cambiado de dirección.
     */
    @PluginMethod
    public void syncDiscover(PluginCall call) {
        int port = call.getInt("port", 47123);
        new Thread(() -> {
            JSArray found = new JSArray();
            try (DatagramSocket socket = new DatagramSocket()) {
                socket.setBroadcast(true);
                socket.setSoTimeout(300);
                byte[] ask = "MITZI?".getBytes(StandardCharsets.UTF_8);
                socket.send(new DatagramPacket(ask, ask.length, InetAddress.getByName("255.255.255.255"), port));
                long until = System.currentTimeMillis() + 1500;
                byte[] buffer = new byte[512];
                while (System.currentTimeMillis() < until) {
                    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                    try {
                        socket.receive(packet);
                    } catch (java.net.SocketTimeoutException e) {
                        continue;
                    }
                    String text = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                    if (!text.startsWith("MITZI!")) continue;
                    JSObject info = new JSObject(text.substring(6));
                    JSObject peer = new JSObject();
                    peer.put("host", packet.getAddress().getHostAddress());
                    peer.put("port", info.getInt("port"));
                    peer.put("id", info.getString("id"));
                    found.put(peer);
                }
            } catch (Exception e) {
                // sin red o sin permiso: se devuelve lo que se haya encontrado
            }
            JSObject result = new JSObject();
            result.put("peers", found);
            call.resolve(result);
        }).start();
    }

    /** El nombre del teléfono que eligió su dueño («HUAWEI Pura 70 Ultra»), o el modelo. */
    @PluginMethod
    public void deviceLabel(PluginCall call) {
        String name = null;
        try {
            name = Settings.Global.getString(getContext().getContentResolver(), "device_name");
        } catch (Exception e) {
            // algunos sistemas no lo dan
        }
        if (name == null || name.trim().isEmpty()) name = Build.MANUFACTURER + " " + Build.MODEL;
        JSObject result = new JSObject();
        result.put("label", name.trim());
        call.resolve(result);
    }

    /** Un POST mínimo de HTTP/1.1 (el servidor de Mitzi en la PC cierra la conexión al responder). */
    private static String postLocal(String host, int port, String body) throws Exception {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 2500);
            // una vez conectados, unir los datos en la PC puede tardar
            socket.setSoTimeout(90000);
            OutputStream out = socket.getOutputStream();
            String head = "POST /mitzi-sync HTTP/1.1\r\n"
                + "Host: " + host + ":" + port + "\r\n"
                + "Content-Type: application/json\r\n"
                + "Content-Length: " + bytes.length + "\r\n"
                + "Connection: close\r\n\r\n";
            out.write(head.getBytes(StandardCharsets.US_ASCII));
            out.write(bytes);
            out.flush();

            InputStream in = socket.getInputStream();
            ByteArrayOutputStream raw = new ByteArrayOutputStream();
            byte[] buffer = new byte[65536];
            int n;
            while ((n = in.read(buffer)) != -1) raw.write(buffer, 0, n);
            byte[] all = raw.toByteArray();
            // los encabezados terminan en la primera línea vacía
            int split = -1;
            for (int i = 0; i + 3 < all.length; i++) {
                if (all[i] == '\r' && all[i + 1] == '\n' && all[i + 2] == '\r' && all[i + 3] == '\n') {
                    split = i;
                    break;
                }
            }
            if (split < 0) throw new Exception("respuesta incompleta");
            String headers = new String(all, 0, split, StandardCharsets.US_ASCII);
            String status = headers.split("\r\n", 2)[0];
            if (status.contains(" 403")) throw new SecurityException("El código no coincide");
            if (!status.contains(" 200")) throw new Exception(status);
            byte[] reply = Arrays.copyOfRange(all, split + 4, all.length);
            if (headers.toLowerCase(Locale.ROOT).contains("transfer-encoding: chunked")) reply = dechunk(reply);
            return new String(reply, StandardCharsets.UTF_8);
        }
    }

    /** Une una respuesta «por partes»: cada parte viene precedida de su tamaño en hexadecimal. */
    private static byte[] dechunk(byte[] raw) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int i = 0;
        while (i < raw.length) {
            int lineEnd = i;
            while (lineEnd + 1 < raw.length && !(raw[lineEnd] == '\r' && raw[lineEnd + 1] == '\n')) lineEnd++;
            String sizeText = new String(raw, i, lineEnd - i, StandardCharsets.US_ASCII).split(";", 2)[0].trim();
            int size = Integer.parseInt(sizeText, 16);
            if (size == 0) break;
            int start = lineEnd + 2;
            if (start + size > raw.length) throw new Exception("respuesta incompleta");
            out.write(raw, start, size);
            i = start + size + 2;
        }
        return out.toByteArray();
    }

    // ---------- atender a los equipos vinculados ----------

    /** Un pedido que llegó y espera la respuesta de la página (que es la que une los datos). */
    private static class PendingSync {
        final CountDownLatch done = new CountDownLatch(1);
        volatile boolean ok;
        volatile String body = "";
    }

    private final Map<String, PendingSync> pendingSync = new ConcurrentHashMap<>();
    private ServerSocket syncServer;
    private DatagramSocket syncFinder;
    private WifiManager.MulticastLock multicastLock;
    private int syncPort;

    /**
     * Abre un servidor HTTP mínimo para que los otros equipos vinculados le hablen a este, igual
     * que a la PC. Cada pedido se le pasa a la página («syncIncoming»), que lo abre y lo une, y su
     * respuesta («syncReply») se le devuelve al otro. También responde «¿dónde estás?» por UDP.
     */
    @PluginMethod
    public void syncServe(PluginCall call) {
        int port = call.getInt("port", 47123);
        String myId = call.getString("id", "");
        try {
            if (syncServer == null || syncServer.isClosed()) {
                ServerSocket server;
                try {
                    server = new ServerSocket();
                    server.setReuseAddress(true);
                    server.bind(new InetSocketAddress(port));
                } catch (Exception busy) {
                    // el puerto de siempre está ocupado: cualquiera libre (va en el código QR)
                    server = new ServerSocket(0);
                }
                syncServer = server;
                syncPort = server.getLocalPort();
                final ServerSocket accepting = server;
                new Thread(() -> acceptSync(accepting)).start();
                startFinder(syncPort, myId);
            }
            JSObject result = new JSObject();
            result.put("hosts", localAddresses());
            result.put("port", syncPort);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("No se pudo abrir: " + e.getMessage());
        }
    }

    @PluginMethod
    public void syncReply(PluginCall call) {
        PendingSync pending = pendingSync.get(call.getString("id", ""));
        if (pending != null) {
            pending.ok = Boolean.TRUE.equals(call.getBoolean("ok", false));
            pending.body = call.getString("body", "");
            pending.done.countDown();
        }
        call.resolve();
    }

    @PluginMethod
    public void syncStop(PluginCall call) {
        stopSyncServer();
        call.resolve();
    }

    private void stopSyncServer() {
        try {
            if (syncServer != null) syncServer.close();
        } catch (Exception ignored) {
            // ya estaba cerrado
        }
        syncServer = null;
        if (syncFinder != null) syncFinder.close();
        syncFinder = null;
        if (multicastLock != null && multicastLock.isHeld()) multicastLock.release();
        multicastLock = null;
        for (PendingSync pending : pendingSync.values()) pending.done.countDown();
    }

    private void acceptSync(ServerSocket server) {
        while (!server.isClosed()) {
            try {
                Socket socket = server.accept();
                new Thread(() -> handleSync(socket)).start();
            } catch (Exception e) {
                return;
            }
        }
    }

    /** Lee un POST (encabezados y cuerpo según Content-Length), espera a la página y responde. */
    private void handleSync(Socket accepted) {
        try (Socket socket = accepted) {
            socket.setSoTimeout(30000);
            InputStream in = socket.getInputStream();
            ByteArrayOutputStream head = new ByteArrayOutputStream();
            int b;
            int newlines = 0;
            while ((b = in.read()) != -1) {
                head.write(b);
                // los encabezados terminan en \r\n\r\n
                newlines = (b == '\n') ? newlines + 1 : (b == '\r' ? newlines : 0);
                if (newlines == 2) break;
                if (head.size() > 16384) return;
            }
            String headers = head.toString("US-ASCII");
            int length = -1;
            for (String line : headers.split("\r\n")) {
                if (line.toLowerCase(Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(line.substring(15).trim());
            }
            OutputStream out = socket.getOutputStream();
            if (!headers.startsWith("POST /mitzi-sync ") || length <= 0 || length > 64 * 1024 * 1024) {
                out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                return;
            }
            byte[] body = new byte[length];
            int read = 0;
            while (read < length) {
                int n = in.read(body, read, length - read);
                if (n < 0) return;
                read += n;
            }
            String id = UUID.randomUUID().toString();
            PendingSync pending = new PendingSync();
            pendingSync.put(id, pending);
            JSObject event = new JSObject();
            event.put("id", id);
            event.put("body", new String(body, StandardCharsets.UTF_8));
            event.put("remote", socket.getInetAddress().getHostAddress());
            notifyListeners("syncIncoming", event);
            boolean answered = pending.done.await(60, TimeUnit.SECONDS);
            pendingSync.remove(id);
            if (answered && pending.ok) {
                byte[] reply = pending.body.getBytes(StandardCharsets.UTF_8);
                String top = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + reply.length + "\r\nConnection: close\r\n\r\n";
                out.write(top.getBytes(StandardCharsets.US_ASCII));
                out.write(reply);
            } else {
                out.write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
            }
            out.flush();
        } catch (Exception ignored) {
            // el otro se fue a mitad: no pasa nada
        }
    }

    /** Responde a quien pregunte en la red «¿dónde hay un equipo con Mitzi?» con su id y su puerto. */
    private void startFinder(int port, String myId) {
        try {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                // sin esto, algunos teléfonos descartan los mensajes a toda la red
                multicastLock = wifi.createMulticastLock("mitzi:buscar");
                multicastLock.acquire();
            }
            DatagramSocket socket = new DatagramSocket(null);
            socket.setReuseAddress(true);
            socket.bind(new InetSocketAddress(port));
            syncFinder = socket;
            new Thread(() -> {
                byte[] buffer = new byte[64];
                while (!socket.isClosed()) {
                    try {
                        DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                        socket.receive(packet);
                        String text = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                        if (!text.equals("MITZI?")) continue;
                        JSObject info = new JSObject();
                        info.put("id", myId);
                        info.put("port", port);
                        byte[] answer = ("MITZI!" + info.toString()).getBytes(StandardCharsets.UTF_8);
                        socket.send(new DatagramPacket(answer, answer.length, packet.getAddress(), packet.getPort()));
                    } catch (Exception e) {
                        if (socket.isClosed()) return;
                    }
                }
            }).start();
        } catch (Exception e) {
            // sin búsqueda: las direcciones guardadas bastan casi siempre
        }
    }

    /** Las direcciones IPv4 de este equipo en la red local (Wi-Fi). */
    private static JSArray localAddresses() {
        JSArray out = new JSArray();
        try {
            for (NetworkInterface net : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!net.isUp() || net.isLoopback()) continue;
                for (InetAddress address : Collections.list(net.getInetAddresses())) {
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()) out.put(address.getHostAddress());
                }
            }
        } catch (Exception ignored) {
            // sin red
        }
        return out;
    }

    /** «Seguir atenta en segundo plano» (apagado de inicio): el servicio con aviso fijo. */
    @PluginMethod
    public void setBackgroundSync(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        Intent service = new Intent(getContext(), SyncKeepAlive.class);
        if (on) {
            // Android 13+: para que se vea el aviso hay que pedir permiso (sin él, igual funciona)
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(getActivity(), new String[] { "android.permission.POST_NOTIFICATIONS" }, 7);
            }
            ContextCompat.startForegroundService(getContext(), service);
        } else {
            getContext().stopService(service);
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopSyncServer();
        getContext().stopService(new Intent(getContext(), SyncKeepAlive.class));
        super.handleOnDestroy();
    }

    // ---------- actualizaciones ----------

    /** Solo se descargan archivos de las versiones publicadas de este repositorio. */
    private static final String RELEASES = "https://github.com/luisnajm26-creator/mitzi/releases/download/";

    /**
     * Descarga el APK de una versión nueva, comprueba su huella SHA-256 contra el
     * SHA256SUMS.txt publicado y abre el instalador del sistema. Android además solo lo
     * instala si está firmado con la misma llave que la app actual.
     */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        String url = call.getString("url", "");
        String sumsUrl = call.getString("sumsUrl", "");
        String name = call.getString("name", "");
        if (!url.startsWith(RELEASES) || !sumsUrl.startsWith(RELEASES) || !name.matches("Mitzi-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk")) {
            call.reject("Dirección de actualización no permitida");
            return;
        }
        // Android 8+: el usuario tiene que permitir, una vez, que Mitzi instale apps
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(settings);
            JSObject ret = new JSObject();
            ret.put("status", "needs-permission");
            call.resolve(ret);
            return;
        }
        new Thread(() -> {
            try {
                String expected = null;
                for (String line : readText(sumsUrl).split("\n")) {
                    String[] parts = line.trim().split("\\s+");
                    if (parts.length == 2 && parts[1].equals(name)) expected = parts[0].toLowerCase(Locale.ROOT);
                }
                if (expected == null) throw new Exception("La versión no trae la huella de su APK");

                File dir = new File(getContext().getCacheDir(), "actualizacion");
                if (!dir.exists()) dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File apk = new File(dir, name);
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
                con.setInstanceFollowRedirects(true);
                long total = con.getContentLengthLong();
                long received = 0;
                long lastNotice = 0;
                try (InputStream in = con.getInputStream(); OutputStream os = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[128 * 1024];
                    int n;
                    while ((n = in.read(buffer)) > 0) {
                        os.write(buffer, 0, n);
                        digest.update(buffer, 0, n);
                        received += n;
                        long now = System.currentTimeMillis();
                        if (total > 0 && now - lastNotice > 150) {
                            lastNotice = now;
                            JSObject progress = new JSObject();
                            progress.put("fraction", (double) received / total);
                            notifyListeners("updateProgress", progress);
                        }
                    }
                }
                StringBuilder hex = new StringBuilder();
                for (byte b : digest.digest()) hex.append(String.format("%02x", b));
                if (!hex.toString().equals(expected)) {
                    apk.delete();
                    throw new Exception("La descarga no coincide con la huella publicada: no se instaló");
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(install);
                JSObject ret = new JSObject();
                ret.put("status", "installing");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "No se pudo actualizar");
            }
        })
            .start();
    }

    private static String readText(String address) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(address).openConnection();
        con.setInstanceFollowRedirects(true);
        try (InputStream in = con.getInputStream()) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        }
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
