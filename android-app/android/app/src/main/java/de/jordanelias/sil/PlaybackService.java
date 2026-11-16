package de.jordanelias.sil;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Runs while the app is making sound, so Android keeps the app alive with the screen off, and shows the notification
 * "SIL is playing" with a Pause button. It plays nothing itself: the sound comes from the web page. It records nothing
 * and sends nothing. The lock-screen version of the notification says only "Sound is playing".
 */
public class PlaybackService extends Service {
    static final String CHANNEL = "sil_playback";
    static final String ACTION_PAUSE = "de.jordanelias.sil.PLAYBACK_PAUSE";
    static final String ACTION_PAUSED = "de.jordanelias.sil.PLAYBACK_PAUSED"; // told to the app, so the page can stop its sound
    private static final int ID = 4107;
    private PowerManager.WakeLock wake;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_PAUSE.equals(intent.getAction())) {
            sendBroadcast(new Intent(ACTION_PAUSED).setPackage(getPackageName()));
            stopSelf();
            return START_NOT_STICKY;
        }
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "SIL is playing";
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Sound playing", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while the app is playing sound, so it can keep playing with the screen off.");
            ch.setSound(null, null);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            nm.createNotificationChannel(ch);
        }
        int immutable = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent openPi = PendingIntent.getActivity(this, 0, open, immutable);
        PendingIntent pausePi = PendingIntent.getService(this, 1, new Intent(this, PlaybackService.class).setAction(ACTION_PAUSE), immutable);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification publicVersion = (Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this))
            .setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("Sound is playing").build();
        b.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(title).setContentText("Tap to open")
            .setContentIntent(openPi).setOngoing(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion).addAction(new Notification.Action.Builder(null, "Pause", pausePi).build());
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(ID, n);
        if (wake == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sil:playback");
            wake.acquire(6 * 60 * 60 * 1000L); // never longer than six hours, whatever happens
        }
        return START_NOT_STICKY;
    }

    @Override public void onTaskRemoved(Intent rootIntent) { stopSelf(); super.onTaskRemoved(rootIntent); }

    @Override
    public void onDestroy() {
        if (wake != null && wake.isHeld()) wake.release();
        wake = null;
        stopForeground(true);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
