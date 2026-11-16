package de.jordanelias.sil;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlaybackPlugin.class); // sound with the screen off
        super.onCreate(savedInstanceState);
        // Private content (journal, check-ins, messages, vault): no screenshots, and the recent-apps preview is blank.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
