package io.github.luisnajm26creator.mitzi;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/**
 * «Seguir atenta en segundo plano»: un servicio con aviso fijo que le dice a Android que Mitzi
 * sigue trabajando, para que no la congele mientras atiende a los otros equipos vinculados.
 * No hace nada por sí mismo: el servidor vive en el plugin y la unión de datos en la página;
 * esto solo mantiene vivo el proceso (y el Wi-Fi despierto). Si cierras Mitzi desde las
 * recientes, se apaga con ella.
 */
public class SyncKeepAlive extends Service {
    // «atenta»: el canal «sincronizar» se creó con importancia mínima y Huawei ocultaba el aviso
    private static final String CHANNEL = "atenta";
    private WifiManager.WifiLock wifiLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            // importancia baja: sin sonido, pero se ve en la cortina (así sabes que está activo)
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Sincronizar con tus equipos", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent tap = open == null ? null : PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Mitzi está atenta a tus equipos")
            .setContentText("Para sincronizar tu lectura por Wi-Fi. Se apaga en Configuración › Sincronizar.")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(tap)
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, notification);
        if (wifiLock == null) {
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wifi != null) {
                wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "mitzi:sincronizar");
                wifiLock.acquire();
            }
        }
        // si Android cierra Mitzi, no se revive solo: sin la página no hay quién una los datos
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        wifiLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
