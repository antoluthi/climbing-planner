import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  garminCall, syncWindows, mergeNights, lastGarminNight,
  autoSyncDue, readLastAttempt, writeLastAttempt,
} from "../lib/garmin.js";
import { localDateStr } from "../lib/helpers.js";

// ─── SYNCHRO DU SOMMEIL GARMIN ───────────────────────────────────────────────
// Va chercher les nuits auprès de `api/garmin` et les range dans `data.sleep`.
// Trois déclencheurs : l'ouverture de l'app, chaque retour au premier plan, et
// le bouton du compte. Les deux premiers sont espacés (`autoSyncDue`) ; le
// troisième passe toujours.
//
// `data.profile.garmin` dit seulement qu'une clé est enregistrée (`linked`) et
// si Garmin l'a refusée (`broken`) : la clé elle-même n'est jamais côté app.
// Ce drapeau voyage avec le planning, si bien que le téléphone se met à
// importer dès qu'on a relié Garmin depuis l'ordinateur.
//
// ⚠️ **En vue athlète, rien ne part.** `data` y est le planning de l'athlète,
// mais la clé utilisée serait celle du coach : ses nuits atterriraient chez
// l'athlète. La vérification se refait après chaque réponse, parce que le coach
// peut changer de vue pendant un import. Les références sont tenues à jour
// dans un effet de mise en page : il passe avant toute suite d'appel réseau,
// là où un effet ordinaire laisserait une fenêtre.
export function useGarminSync({ session, data, setData, viewingAthlete }) {
  const garmin = data.profile?.garmin;
  const linked = !!garmin?.linked;
  const canSync = !!session && !viewingAthlete;
  const auto = canSync && linked && !garmin?.broken;

  const [state, setState] = useState({ running: false, done: 0, total: 0, error: null, at: null });
  const busy = useRef(false);
  const live = useRef({ canSync, linked, sleep: data.sleep });
  useLayoutEffect(() => { live.current = { canSync, linked, sleep: data.sleep }; });

  // `justLinked` : la clé vient d'être enregistrée, le drapeau n'a pas encore
  // fait le tour du rendu.
  const sync = useCallback(async ({ force = false, justLinked = false } = {}) => {
    const L = live.current;
    if (!L.canSync || !(L.linked || justLinked) || busy.current) return;
    const today = localDateStr(new Date());
    const last = lastGarminNight(L.sleep);
    if (!force && !autoSyncDue(last, today, Date.now(), readLastAttempt())) return;

    busy.current = true;
    writeLastAttempt(Date.now());
    const windows = syncWindows(last, today);
    setState(s => ({ ...s, running: true, done: 0, total: windows.length, error: null }));
    let error = null;
    for (const w of windows) {
      const res = await garminCall("sleep", { query: w });
      if (!live.current.canSync) break;
      if (!res.ok) { error = res.error; break; }
      const nights = res.data?.nights || [];
      setData(d => {
        const sleep = mergeNights(d.sleep, nights);
        return sleep === d.sleep ? d : { ...d, sleep };
      });
      setState(s => ({ ...s, done: s.done + 1 }));
    }
    if (live.current.canSync) {
      // La clé a été oubliée ailleurs : on cesse d'importer. Refusée par
      // Garmin : on cesse de réessayer tout seul, jusqu'à la nouvelle clé.
      if (error === "no_key") setData(d => ({ ...d, profile: { ...d.profile, garmin: null } }));
      if (error === "key_rejected") setData(d => ({ ...d, profile: { ...d.profile, garmin: { ...(d.profile?.garmin || {}), broken: true } } }));
    }
    setState(s => ({ ...s, running: false, error, at: error ? s.at : Date.now() }));
    busy.current = false;
  }, [setData]);

  // La clé enregistrée : le drapeau, puis l'import d'un an, tout de suite.
  const markLinked = useCallback(() => {
    setData(d => ({ ...d, profile: { ...d.profile, garmin: { linked: true, since: localDateStr(new Date()) } } }));
    sync({ force: true, justLinked: true });
  }, [setData, sync]);

  // Les nuits déjà importées restent : ce sont les tiennes.
  const markUnlinked = useCallback(() => {
    setData(d => ({ ...d, profile: { ...d.profile, garmin: null } }));
    setState(s => ({ ...s, error: null }));
  }, [setData]);

  useEffect(() => {
    if (!auto) return;
    // Laisse d'abord la synchro du planning passer : elle peut apporter des
    // nuits importées ailleurs.
    const first = setTimeout(() => sync(), 2500);
    const onWake = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", onWake);
    return () => { clearTimeout(first); document.removeEventListener("visibilitychange", onWake); };
  }, [auto, sync]);

  return { linked, broken: !!garmin?.broken, canSync, ...state, sync, markLinked, markUnlinked };
}
