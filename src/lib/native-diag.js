// ─── SONDE NATIVE ────────────────────────────────────────────────────────────
// Un APK installé à la main n'a ni console ni rapport de plantage : quand un
// appel de plugin échoue sur le téléphone, il n'existe aucun moyen de le voir.
// Cette sonde répond à la seule question qui compte alors — **qui a échoué,
// et avec quel message** — et son résultat s'affiche dans Compte.
//
// Chaque étape est isolée : une qui tombe n'empêche pas les suivantes de
// parler.

const msg = (e) => (e?.message || String(e) || "erreur inconnue").slice(0, 200);

export async function nativeDiagnostics() {
  const out = {
    native: null,          // Capacitor dit-il qu'on est dans l'APK ?
    notifications: "—",    // le plugin de notifications répond-il ?
    permission: "—",
    pending: null,         // combien de notifications sont programmées
    preferences: "—",      // le plugin de stockage répond-il ?
    snapshot: "—",         // l'app a-t-elle déjà écrit pour le widget ?
    queue: "—",            // des coches attendent-elles d'être reprises ?
    errors: [],
  };

  try {
    const { isNative } = await import("./native.js");
    out.native = isNative;
  } catch (e) {
    out.errors.push("plateforme : " + msg(e));
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    out.notifications = "chargé";
    out.permission = (await LocalNotifications.checkPermissions())?.display ?? "?";
    out.pending = (await LocalNotifications.getPending())?.notifications?.length ?? 0;
  } catch (e) {
    out.notifications = "ÉCHEC";
    out.errors.push("notifications : " + msg(e));
  }

  try {
    const { Preferences } = await import("@capacitor/preferences");
    out.preferences = "chargé";
    const snap = await Preferences.get({ key: "widget_today" });
    out.snapshot = snap?.value ? `${snap.value.length} car.` : "absent";
    const q = await Preferences.get({ key: "widget_pending" });
    out.queue = q?.value ? `${JSON.parse(q.value).length} en attente` : "vide";
  } catch (e) {
    out.preferences = "ÉCHEC";
    out.errors.push("préférences : " + msg(e));
  }

  return out;
}

// Rendu compact, fait pour être lu (ou photographié) sur un téléphone.
export function formatDiagnostics(d) {
  if (!d) return "";
  const lines = [
    `natif        ${d.native === null ? "?" : d.native ? "oui" : "non (web)"}`,
    `notifs       ${d.notifications}${d.permission !== "—" ? ` · ${d.permission}` : ""}`,
    `programmées  ${d.pending ?? "—"}`,
    `préférences  ${d.preferences}`,
    `widget       ${d.snapshot}`,
    `file coches  ${d.queue}`,
  ];
  if (d.errors.length) lines.push("", ...d.errors.map(e => "⚠ " + e));
  return lines.join("\n");
}
