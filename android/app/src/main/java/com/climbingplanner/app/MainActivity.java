package com.climbingplanner.app;

import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Le widget lit ce que la WebView a écrit dans les SharedPreferences. Il
     * faut donc lui dire de se redessiner une fois l'écriture faite — et le
     * moment juste : quand on quitte l'app, c'est-à-dire au moment précis où le
     * widget redevient visible. Sans ça, il attendrait son quart d'heure
     * (updatePeriodMillis) pour afficher ce qu'on vient de changer.
     *
     * Deux fois, parce que l'écriture côté JS est débouncée (400 ms) : le
     * premier passage peut relire le cliché d'avant la dernière modification.
     * Le second rattrape, et redessiner un widget ne coûte rien.
     */
    @Override
    public void onPause() {
        super.onPause();
        TodayWidget.refresh(this);
        final android.content.Context app = getApplicationContext();
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> TodayWidget.refresh(app), 900);
    }
}
