package com.climbingplanner.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
 * beaucoup de code pour quatre lignes. Les lignes sont dans la mise en page et
 * on masque celles qui ne servent pas.
 */
public class TodayWidget extends AppWidgetProvider {

    private static final String PREFS = "CapacitorStorage";
    private static final String KEY_SNAPSHOT = "widget_today";
    private static final String KEY_PENDING = "widget_pending";

    public static final String ACTION_TOGGLE = "com.climbingplanner.app.WIDGET_TOGGLE";
    private static final String EXTRA_ID = "reminderId";

    private static final int[] ROW_IDS = {
        R.id.widget_row_0, R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3
    };
    private static final int[] BOX_IDS = {
        R.id.widget_box_0, R.id.widget_box_1, R.id.widget_box_2, R.id.widget_box_3
    };
    private static final int[] NAME_IDS = {
        R.id.widget_name_0, R.id.widget_name_1, R.id.widget_name_2, R.id.widget_name_3
    };

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
            views.setTextViewText(R.id.widget_date, "CHARGE");
            views.setTextViewText(R.id.widget_journal, "Ouvre l’app pour commencer");
            for (int rowId : ROW_IDS) {
                views.setViewVisibility(rowId, android.view.View.GONE);
            }
            views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE);
            views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context));
            manager.updateAppWidget(widgetId, views);
            return;
        }

        views.setTextViewText(R.id.widget_date, snapshot.optString("label", ""));
        views.setTextViewText(R.id.widget_journal, snapshot.optString("journal", ""));
        views.setImageViewResource(R.id.widget_journal_icon,
            snapshot.optBoolean("journalDone", false) ? R.drawable.ic_widget_check_on : R.drawable.ic_widget_check_off);

        JSONArray reminders = snapshot.optJSONArray("reminders");
        int count = reminders == null ? 0 : reminders.length();
        for (int i = 0; i < ROW_IDS.length; i++) {
            if (i < count) {
                JSONObject r = reminders.optJSONObject(i);
                String id = r == null ? "" : r.optString("id", "");
                boolean done = r != null && r.optBoolean("done", false);
                views.setViewVisibility(ROW_IDS[i], android.view.View.VISIBLE);
                views.setTextViewText(NAME_IDS[i], r == null ? "" : r.optString("name", ""));
                views.setImageViewResource(BOX_IDS[i],
                    done ? R.drawable.ic_widget_check_on : R.drawable.ic_widget_check_off);
                // Coché = éteint. Pas de texte barré : `setPaintFlags` n'est pas
                // une méthode « remotable », un widget qui l'appelle affiche
                // « problème de chargement » au lieu de se dessiner.
                views.setTextColor(NAME_IDS[i], done ? 0xFF8A8A8A : 0xFFFFFFFF);
                views.setOnClickPendingIntent(ROW_IDS[i], toggleIntent(context, id, i));
            } else {
                views.setViewVisibility(ROW_IDS[i], android.view.View.GONE);
            }
        }

        views.setViewVisibility(R.id.widget_empty,
            count == 0 ? android.view.View.VISIBLE : android.view.View.GONE);

        // Le journal et l'en-tête ouvrent l'app.
        views.setOnClickPendingIntent(R.id.widget_journal_row, openAppIntent(context));
        views.setOnClickPendingIntent(R.id.widget_date, openAppIntent(context));

        manager.updateAppWidget(widgetId, views);
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
