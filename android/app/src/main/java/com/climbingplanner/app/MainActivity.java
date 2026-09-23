package com.climbingplanner.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Android **rejoue l'Intent de lancement**, et c'est ce qui ouvrait le
     * journal (ou une séance) tout seul « assez souvent ».
     *
     * Le bouton du widget lance MainActivity avec l'URI
     * {@code com.climbingplanner.app://day-log} ; une notification touchée la
     * lance avec ses extras. Cet Intent reste attaché à la tâche : quand le
     * système a tué le processus et que l'utilisateur rouvre l'app depuis les
     * Récents, la même Intent revient telle quelle — avec, cette fois, le
     * drapeau {@code FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY}. Côté JS,
     * {@code App.getLaunchUrl()} relit donc un lien vieux de plusieurs heures
     * et l'assistant du jour s'ouvre sans que personne ne l'ait demandé.
     *
     * On vide donc l'Intent dans ce cas précis : une relance depuis l'historique
     * n'est pas un clic sur le widget ni sur une notification. Un vrai clic,
     * lui, arrive avec un Intent neuf, sans ce drapeau, et passe intact.
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Intent intent = getIntent();
        if (intent != null
                && (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
            intent.setAction(Intent.ACTION_MAIN);
            intent.setData(null);
            intent.replaceExtras((Bundle) null);
            setIntent(intent);
        }
        super.onCreate(savedInstanceState);
    }

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
