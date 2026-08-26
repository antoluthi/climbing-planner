import { withTimeout } from "./promise-timeout.js";

// ─── SONDE NATIVE ────────────────────────────────────────────────────────────
// Un APK installé à la main n'a ni console ni rapport de plantage : quand un
// appel de plugin échoue sur le téléphone, il n'existe aucun moyen de le voir.
// Cette sonde répond à la seule question qui compte alors — **qui ne répond
// pas, et avec quel message** — et son résultat s'affiche dans Compte.
//
// Chaque étape est isolée *et* bornée dans le temps : une qui tombe n'empêche
// pas les suivantes de parler, et une qui ne répond jamais devient une ligne
// « sans réponse » au lieu de figer l'écran.

const STEP_MS = 4000;
const msg = (e) => (e?.message || String(e) || "erreur inconnue").slice(0, 160);

async function step(label, run) {
  try {
    return { ok: true, value: await withTimeout(run(), STEP_MS, label) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// `onProgress` reçoit l'état après chaque étape : même si la suite se bloque,
// ce qui a déjà répondu est déjà à l'écran.
export async function nativeDiagnostics(onProgress) {
  const out = {
    native: null, notifications: "—", permission: "—", pending: null,
    preferences: "—", snapshot: "—", queue: "—", errors: [],
  };
  const tick = () => onProgress?.({ ...out, errors: [...out.errors] });

  const plat = await step("plateforme", async () => (await import("./native.js")).isNative);
  if (plat.ok) out.native = plat.value; else out.errors.push("plateforme : " + plat.error);
  tick();

  // Enveloppé dans un objet : renvoyer le plugin nu depuis une fonction async
  // ferait lire `.then` sur son proxy, donc un appel natif qui ne revient pas.
  const ln = await step("import notifications", async () =>
    ({ LN: (await import("@capacitor/local-notifications")).LocalNotifications }));
  if (!ln.ok) {
    out.notifications = "ÉCHEC";
    out.errors.push("import notifications : " + ln.error);
  } else {
    out.notifications = "chargé";
    tick();
    const perm = await step("checkPermissions", () => ln.value.LN.checkPermissions());
    if (perm.ok) out.permission = perm.value?.display ?? "?";
    else { out.permission = "SANS RÉPONSE"; out.errors.push("checkPermissions : " + perm.error); }
    tick();
    const pend = await step("getPending", () => ln.value.LN.getPending());
    if (pend.ok) out.pending = pend.value?.notifications?.length ?? 0;
    else out.errors.push("getPending : " + pend.error);
  }
  tick();

  const pr = await step("import préférences", async () =>
    ({ P: (await import("@capacitor/preferences")).Preferences }));
  if (!pr.ok) {
    out.preferences = "ÉCHEC";
    out.errors.push("import préférences : " + pr.error);
  } else {
    out.preferences = "chargé";
    tick();
    const snap = await step("lecture widget_today", () => pr.value.P.get({ key: "widget_today" }));
    if (snap.ok) out.snapshot = snap.value?.value ? `${snap.value.value.length} car.` : "absent";
    else { out.snapshot = "SANS RÉPONSE"; out.errors.push("lecture widget_today : " + snap.error); }
    tick();
    const q = await step("lecture widget_pending", () => pr.value.P.get({ key: "widget_pending" }));
    if (q.ok) {
      try {
        out.queue = q.value?.value ? `${JSON.parse(q.value.value).length} en attente` : "vide";
      } catch { out.queue = "illisible"; }
    } else out.errors.push("lecture widget_pending : " + q.error);
  }
  tick();

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
