package com.climbingplanner.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Le widget lit ce que la WebView a écrit dans les SharedPreferences. Il
     * faut donc lui dire de se redessiner une fois l'écriture faite — et le
     * moment juste : quand on quitte l'app, c'est-à-dire au moment précis où le
     * widget redevient visible. Sans ça, il attendrait son quart d'heure
     * (updatePeriodMillis) pour afficher ce qu'on vient de changer.
     */
    @Override
    public void onPause() {
        super.onPause();
        TodayWidget.refresh(this);
    }
}
