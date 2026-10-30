import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  garminCall, planSync, syncCursor, isTransient, mergeNights, mergeRecovery, linkActivities,
  lastGarminNight, autoSyncDue, readLastAttempt, writeLastAttempt,
} from "../lib/garmin.js";
import { localDateStr } from "../lib/helpers.js";

// ─── SYNCHRO GARMIN ──────────────────────────────────────────────────────────
// Une passe par plage de 31 jours (`api/garmin/sync`) : les nuits vont dans
// `data.sleep`, les journées (FC au repos, VFC, Body Battery, stress) dans
// `data.recovery`, et les activités cochent les séances prévues
// (`linkActivities`) ou deviennent des séances faites.
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

  const [state, setState] = useState({ running: false, done: 0, total: 0, error: null, at: null, partial: null, checked: 0, added: 0 });
  const busy = useRef(false);
  const live = useRef({ canSync, linked, sleep: data.sleep, through: garmin?.through, backfill: garmin?.backfill });
  useLayoutEffect(() => { live.current = { canSync, linked, sleep: data.sleep, through: garmin?.through, backfill: garmin?.backfill }; });
  // Ce qu'a fait chaque plage, rangé par plage : en développement, React
  // appelle deux fois une mise à jour ; une simple addition compterait double.
  const report = useRef({});

  // `justLinked` : la clé vient d'être enregistrée, le drapeau n'a pas encore
  // fait le tour du rendu.
  const sync = useCallback(async ({ force = false, justLinked = false } = {}) => {
    const L = live.current;
    if (!L.canSync || !(L.linked || justLinked) || busy.current) return;
    const today = localDateStr(new Date());
    const lastNight = lastGarminNight(L.sleep);
    if (!force && !autoSyncDue(lastNight, today, Date.now(), readLastAttempt())) return;

    busy.current = true;
    writeLastAttempt(Date.now());
    // Où reprendre : le dernier jour lu (`through`, partagé par tous les
    // appareils), sinon la dernière nuit ; sans l'un ni l'autre, un an. Se fier
    // aux seules nuits referait l'année entière, à chaque passe, pour qui ne
    // porte pas sa montre la nuit. Puis ce qui reste de l'historique
    // (`backfill`), si un import s'est arrêté en route.
    const windows = planSync({ through: L.through, backfill: L.backfill, lastNight }, today);
    report.current = {};
    setState(s => ({ ...s, running: true, done: 0, total: windows.length, error: null, partial: null, checked: 0, added: 0 }));
    let error = null;
    let failedAt = null;
    const partial = {};
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const res = await garminCall("sync", { query: w });
      if (!live.current.canSync) { failedAt = i; break; }
      if (!res.ok) { error = res.error; failedAt = i; break; }
      const { nights = [], days = [], activities = [] } = res.data || {};
      Object.assign(partial, res.data?.partial || {});
      setData(d => {
        let next = d;
        const sleep = mergeNights(d.sleep, nights);
        if (sleep !== d.sleep) next = { ...next, sleep };
        const recovery = mergeRecovery(d.recovery, days);
        if (recovery !== d.recovery) next = { ...next, recovery };
        const out = linkActivities(next, activities, {
          todayISO: today,
          autoAdd: d.profile?.garminAddUnplanned !== false,
          sports: d.profile?.sports,
        });
        report.current[w.start] = { checked: out.linked.filter(l => l.checked).length, added: out.added.length };
        return out.data;
      });
      setState(s => ({ ...s, done: s.done + 1 }));
      // Une lecture en panne passagère : ce qui est arrivé est gardé, mais la
      // plage reste à relire. Inutile d'aller plus loin, Garmin est occupé.
      if (Object.values(res.data?.partial || {}).some(isTransient)) { failedAt = i; break; }
    }
    if (live.current.canSync) {
      const next = syncCursor(windows, failedAt, today, L);
      // Rarement : chaque écriture du profil repart en synchro. Aujourd'hui
      // déjà noté et rien en attente, on n'écrit rien.
      if (next.through !== (L.through || null) || next.backfill !== (L.backfill || null)) {
        setData(d => {
          if (!d.profile?.garmin) return d;
          const garmin = { ...d.profile.garmin, through: next.through };
          if (next.backfill) garmin.backfill = next.backfill;
          else delete garmin.backfill;
          return { ...d, profile: { ...d.profile, garmin } };
        });
      }
    }

    if (live.current.canSync) {
      // La clé a été oubliée ailleurs : on cesse d'importer. Refusée par
      // Garmin : on cesse de réessayer tout seul, jusqu'à la nouvelle clé.
      if (error === "no_key") setData(d => ({ ...d, profile: { ...d.profile, garmin: null } }));
      if (error === "key_rejected") setData(d => ({ ...d, profile: { ...d.profile, garmin: { ...(d.profile?.garmin || {}), broken: true } } }));
    }
    // Le bilan se lit dans la mise à jour, pas tout de suite : les mises à jour
    // du planning passent avant (le fournisseur des données se dessine avant
    // ce composant), celles de chaque plage sont donc déjà comptées.
    setState(s => {
      const totals = Object.values(report.current).reduce((t, r) => ({ checked: t.checked + r.checked, added: t.added + r.added }), { checked: 0, added: 0 });
      return { ...s, running: false, error, at: error ? s.at : Date.now(), partial: Object.keys(partial).length ? partial : null, ...totals };
    });
    busy.current = false;
  }, [setData]);

  // La clé enregistrée : le drapeau, puis l'import d'un an, tout de suite.
  // Une clé changée reprend où l'ancienne s'était arrêtée (`through`,
  // `backfill`).
  const markLinked = useCallback(() => {
    setData(d => {
      const { through, backfill } = d.profile?.garmin || {};
      const garmin = { linked: true, since: localDateStr(new Date()), ...(through ? { through } : {}), ...(backfill ? { backfill } : {}) };
      return { ...d, profile: { ...d.profile, garmin } };
    });
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
