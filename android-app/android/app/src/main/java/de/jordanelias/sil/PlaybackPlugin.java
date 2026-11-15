package de.jordanelias.sil;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the web page start and stop the sound-playing notification, and hears the Pause button. */
@CapacitorPlugin(name = "SilPlayback")
public class PlaybackPlugin extends Plugin {
    private BroadcastReceiver receiver;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) { notifyListeners("pause", new JSObject()); }
        };
        ContextCompat.registerReceiver(getContext(), receiver, new IntentFilter(PlaybackService.ACTION_PAUSED), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), PlaybackService.class).putExtra("title", call.getString("title", "SIL is playing"));
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) { call.reject("Could not start", e); }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (receiver != null) { try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) { } receiver = null; }
    }
}
