package com.climbingplanner.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Widget « aujourd'hui » : les rappels du jour, cochables, et le journal.
 *
 * Il ne lit pas le planning — il lit ce que l'app dépose pour lui dans les
 * SharedPreferences de Capacitor (voir src/lib/widget.js) :
 *
 *   widget_today    ce qu'il faut afficher, écrit par l'app ;
 *   widget_pending  les coches faites ici, que l'app appliquera à son réveil.
 *
 * Cocher met donc à jour deux choses : la file d'intentions (pour l'app) et la
 * copie affichée (pour que la case bouge tout de suite, sans attendre que l'app
 * s'ouvre). Le widget n'écrit jamais dans le planning lui-même.
 *
 * Pas de ListView ici : une liste dans un widget impose un RemoteViewsService,
 * beaucoup de code pour ce qu'on affiche. Les lignes sont dans la mise en page
 * et on masque celles qui ne servent pas.
 *
 * <h2>Redimensionnement</h2>
 * Un widget ne se met pas à l'échelle tout seul : agrandi, il garde ses quatre
 * lignes et laisse du vide ; réduit, il rogne le bas. C'est {@link #fit} qui
 * répond, à partir de la taille que le lanceur nous donne, à « combien de
 * rappels tiennent, et la date et le journal ont-ils encore leur place ». La
 * taille arrive par {@code getAppWidgetOptions} et change par
 * {@link #onAppWidgetOptionsChanged}, seul signal qu'on ait d'un
 * redimensionnement.
 */
public class TodayWidget extends AppWidgetProvider {

    private static final String PREFS = "CapacitorStorage";
    private static final String KEY_SNAPSHOT = "widget_today";
    private static final String KEY_PENDING = "widget_pending";

    public static final String ACTION_TOGGLE = "com.climbingplanner.app.WIDGET_TOGGLE";
    private static final String EXTRA_ID = "reminderId";

    private static final int[] ROW_IDS = {
        R.id.widget_row_0, R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3,
        R.id.widget_row_4, R.id.widget_row_5, R.id.widget_row_6, R.id.widget_row_7
    };
    private static final int[] BOX_IDS = {
        R.id.widget_box_0, R.id.widget_box_1, R.id.widget_box_2, R.id.widget_box_3,
        R.id.widget_box_4, R.id.widget_box_5, R.id.widget_box_6, R.id.widget_box_7
    };
    private static final int[] NAME_IDS = {
        R.id.widget_name_0, R.id.widget_name_1, R.id.widget_name_2, R.id.widget_name_3,
        R.id.widget_name_4, R.id.widget_name_5, R.id.widget_name_6, R.id.widget_name_7
    };

    // Hauteurs mesurées sur la mise en page, en dp. Elles n'ont pas à être
    // exactes au pixel : mieux vaut une ligne de moins qu'une ligne rognée.
    private static final int ROW_DP     = 34;   // case 20dp + 7dp de part et d'autre
    private static final int HEADER_DP  = 18;   // la ligne de date
    private static final int JOURNAL_DP = 34;   // marge 8 + padding 8 + icône 16 + 2
    private static final int PAD_DP     = 12;   // padding du cadre, en haut et en bas
    private static final int PAD_TIGHT_DP = 8;  // … resserré quand la place manque

    // Tailles par défaut (celles déclarées dans widget_today_info.xml), au cas
    // où le lanceur ne nous dirait rien.
    private static final int DEFAULT_W_DP = 250;
    private static final int DEFAULT_H_DP = 180;

    /** Ce que la taille du moment permet d'afficher. */
    private static final class Fit {
        final int rows; final boolean header, journal; final int padDp;
        Fit(int rows, boolean header, boolean journal, int padDp) {
            this.rows = rows; this.header = header; this.journal = journal; this.padDp = padDp;
        }
    }

    /**
     * Ce qui tient dans {@code hDp} de haut. L'ordre des sacrifices suit
     * l'importance : les rappels d'abord — c'est ce pour quoi le widget
     * existe —, puis le journal, puis la date.
     *
     * On raisonne sur la hauteur **minimale** que donne le lanceur (celle de
     * l'orientation la plus serrée) : ce qui tient là tient dans les deux sens,
     * alors qu'un calcul sur la hauteur maximale rognerait en paysage.
     */
    static Fit fit(int wDp, int hDp) {
        boolean header  = hDp >= 100;
        boolean journal = hDp >= 140;
        int pad = journal ? PAD_DP : PAD_TIGHT_DP;
        int avail = hDp - 2 * pad - (header ? HEADER_DP : 0) - (journal ? JOURNAL_DP : 0);
        int rows = avail / ROW_DP;
        if (rows < 1) rows = 1;
        if (rows > ROW_IDS.length) rows = ROW_IDS.length;
        return new Fit(rows, header, journal, pad);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Redessine tous les exemplaires posés. Appelé aussi depuis MainActivity. */
    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName name = new ComponentName(context, TodayWidget.class);
        int[] ids = manager.getAppWidgetIds(name);
        for (int id : ids) {
            render(context, manager, id);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            render(context, manager, id);
        }
    }

    /**
     * Le seul avertissement qu'on reçoive d'un redimensionnement. Sans cette
     * redéfinition, le widget étiré garderait la mise en page de sa taille
     * d'avant jusqu'au prochain réveil de l'app.
     */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
                                          int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, manager, appWidgetId, newOptions);
        render(context, manager, appWidgetId);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent != null && ACTION_TOGGLE.equals(intent.getAction())) {
            String reminderId = intent.getStringExtra(EXTRA_ID);
            if (reminderId != null) {
                toggle(context, reminderId);
            }
            refresh(context);
        }
    }

    /**
     * Bascule une case : on retourne l'état dans la copie affichée, et on
     * empile l'intention pour l'app.
     */
    private void toggle(Context context, String reminderId) {
        SharedPreferences sp = prefs(context);
        String raw = sp.getString(KEY_SNAPSHOT, null);
        if (raw == null) return;
        try {
            JSONObject snapshot = new JSONObject(raw);
            String date = snapshot.optString("date", "");
            JSONArray reminders = snapshot.optJSONArray("reminders");
            if (reminders == null || date.isEmpty()) return;

            boolean next = false;
            boolean found = false;
            for (int i = 0; i < reminders.length(); i++) {
                JSONObject r = reminders.optJSONObject(i);
                if (r != null && reminderId.equals(r.optString("id"))) {
                    next = !r.optBoolean("done", false);
                    r.put("done", next);
                    found = true;
                    break;
                }
            }
            if (!found) return;

            String pendingRaw = sp.getString(KEY_PENDING, null);
            JSONArray pending = pendingRaw == null ? new JSONArray() : new JSONArray(pendingRaw);
            JSONObject entry = new JSONObject();
            entry.put("id", reminderId);
            entry.put("date", date);
            entry.put("done", next);
            pending.put(entry);

            sp.edit()
              .putString(KEY_SNAPSHOT, snapshot.toString())
              .putString(KEY_PENDING, pending.toString())
              .apply();
        } catch (Exception ignored) {
            // Un widget ne doit jamais faire tomber le lanceur : au pire il
            // n'affiche pas la coche, l'app reste la source de vérité.
        }
    }

    private static void render(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        Fit fit = fitFor(manager, widgetId);
        int padPx = dp(context, fit.padDp);
        views.setViewPadding(R.id.widget_root, padPx, padPx, padPx, padPx);

        String raw = prefs(context).getString(KEY_SNAPSHOT, null);
        JSONObject snapshot = null;
        if (raw != null) {
            try {
                snapshot = new JSONObject(raw);
            } catch (Exception ignored) {
                snapshot = null;
            }
        }

        if (snapshot == null) {
            // Rien à afficher : la date et le journal restent, ce sont les deux
            // seules choses à dire — quelle que soit la taille.
            views.setViewVisibility(R.id.widget_header, View.VISIBLE);
            views.setViewVisibility(R.id.widget_journal_row, View.VISIBLE);
            views.setViewVisibility(R.id.widget_more, View.GONE);
            views.setTextViewText(R.id.widget_date, "CHARGE");
            views.setTextViewText(R.id.widget_journal, "Ouvre l’app pour commencer");
            for (int rowId : ROW_IDS) {
                views.setViewVisibility(rowId, View.GONE);
            }
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context));
            manager.updateAppWidget(widgetId, views);
            return;
        }

        JSONArray reminders = snapshot.optJSONArray("reminders");
        int count = reminders == null ? 0 : reminders.length();
        int total = snapshot.optInt("total", count);
        int shown = Math.min(count, fit.rows);

        // Sans rappel, la date reprend sa place : c'est tout ce qu'il reste.
        boolean header = fit.header || count == 0;
        views.setViewVisibility(R.id.widget_header, header ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_journal_row, fit.journal ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_date, snapshot.optString("label", ""));
        views.setTextViewText(R.id.widget_journal, snapshot.optString("journal", ""));
        views.setImageViewResource(R.id.widget_journal_icon,
            snapshot.optBoolean("journalDone", false) ? R.drawable.ic_widget_check_on : R.drawable.ic_widget_check_off);

        // Réduit, le widget cache des rappels : il doit le dire, sinon on croit
        // avoir tout fait. Le compte est celui du jour, pas celui de la copie.
        int hidden = Math.max(0, total - shown);
        views.setViewVisibility(R.id.widget_more, hidden > 0 && header ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_more, "+" + hidden);

        for (int i = 0; i < ROW_IDS.length; i++) {
            if (i < shown) {
                JSONObject r = reminders.optJSONObject(i);
                String id = r == null ? "" : r.optString("id", "");
                boolean done = r != null && r.optBoolean("done", false);
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
                views.setTextViewText(NAME_IDS[i], r == null ? "" : r.optString("name", ""));
                views.setImageViewResource(BOX_IDS[i],
                    done ? R.drawable.ic_widget_check_on : R.drawable.ic_widget_check_off);
                // Coché = éteint. Pas de texte barré : `setPaintFlags` n'est pas
                // une méthode « remotable », un widget qui l'appelle affiche
                // « problème de chargement » au lieu de se dessiner.
                views.setTextColor(NAME_IDS[i], done ? 0xFF8A8A8A : 0xFFFFFFFF);
                views.setOnClickPendingIntent(ROW_IDS[i], toggleIntent(context, id, i));
            } else {
                views.setViewVisibility(ROW_IDS[i], View.GONE);
            }
        }

        views.setViewVisibility(R.id.widget_empty,
            count == 0 ? View.VISIBLE : View.GONE);

        // Le journal et l'en-tête ouvrent l'app.
        views.setOnClickPendingIntent(R.id.widget_journal_row, openAppIntent(context));
        views.setOnClickPendingIntent(R.id.widget_date, openAppIntent(context));

        manager.updateAppWidget(widgetId, views);
    }

    /** La taille que le lanceur nous accorde, en dp, et ce qu'elle permet. */
    private static Fit fitFor(AppWidgetManager manager, int widgetId) {
        int w = DEFAULT_W_DP;
        int h = DEFAULT_H_DP;
        try {
            Bundle o = manager.getAppWidgetOptions(widgetId);
            if (o != null) {
                int ow = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
                int oh = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
                if (ow > 0) w = ow;
                if (oh > 0) h = oh;
            }
        } catch (Exception ignored) {
            // Taille inconnue : on retombe sur celle déclarée, qui a toujours
            // fonctionné. Mieux vaut un widget de taille par défaut qu'aucun.
        }
        return fit(w, h);
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    private static PendingIntent openAppIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Un code de requête distinct par ligne : sans ça, Android réutiliserait le
     * même PendingIntent et toutes les lignes cocheraient le même rappel.
     */
    private static PendingIntent toggleIntent(Context context, String reminderId, int row) {
        Intent intent = new Intent(context, TodayWidget.class);
        intent.setAction(ACTION_TOGGLE);
        intent.putExtra(EXTRA_ID, reminderId);
        return PendingIntent.getBroadcast(context, 100 + row, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
