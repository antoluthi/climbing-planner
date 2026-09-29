import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { DataContext } from "./DataContext.js";
import { useAuth } from "./AuthContext.js";
import supabase from "../lib/supabase.js";
import { DEFAULT_MESOCYCLES } from "../lib/constants.js";
import { getMondayOf, weekKey } from "../lib/helpers.js";
import { generateId, loadData, saveData, migrateData, freshData, getLocalDataOwner, setLocalDataOwner } from "../lib/storage.js";
import { readSyncMeta, readSyncBase, settleSync, markDirty, decideSync } from "../lib/sync-meta.js";
import { mergePlans, deepEqual } from "../lib/merge-plan.js";
import { recomputeMesoDates, setAnchor, moveMeso } from "../lib/cycles.js";
import { DEFAULT_RUN_BLOCK } from "../lib/run-goals.js";
import { useCommunitySessionsSync } from "../hooks/useCommunitySessionsSync.js";
import { useSessionsCatalog } from "../hooks/useSessionsCatalog.js";
import { useCoachAthletes } from "../hooks/useCoachAthletes.js";
import { useNotifications } from "../hooks/useNotifications.js";
import { DATA } from "../theme/palette.js";

// Traduction de la colonne `status` en rôle applicatif — le seul endroit qui
// connaisse les valeurs historiques : 'solo' → null, et 'auto' → coach
// (l'« athlète autonome » ne se distinguait du coach nulle part ; l'option a été
// retirée, les comptes restés à cette valeur gardent l'accès coach).
const roleFromStatus = (status) => status === "solo" ? null
  : status === "auto" ? "coach"
  : status;

export function DataProvider({ children }) {
  const {
    session, syncStatus, reportSync, fetchCloudHead, loadFromCloud, writeGuarded, upsertRow,
    saveToCloud, writeStatus, subscribeToChanges,
  } = useAuth();

  const [data, setData] = useState(loadData);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);
  // Rôle du COMPTE connecté (colonne status, jamais le blob affiché) :
  // undefined = pas encore résolu · null = athlète solo · "coach" | "athlete".
  // Toute l'UI de permissions doit dériver de cette valeur — pas de
  // data.profile.role, qui devient celui de l'ATHLÈTE en vue athlète.
  const [accountRole, setAccountRole] = useState(undefined);
  // true = la colonne status est NULL en DB → l'utilisateur n'a jamais choisi.
  const [needsRoleChoice, setNeedsRoleChoice] = useState(false);

  const coachDataRef = useRef(null);
  const [viewingAthlete, setViewingAthlete] = useState(null);

  const migrationDoneRef = useRef(false);
  const avatarMigratedRef = useRef(false);

  const { communitySessions, pushToCommunity, deleteFromCommunity } = useCommunitySessionsSync(session);
  const { catalog, saveUserSession, deleteUserSession, refreshCatalog } = useSessionsCatalog(session?.user?.id);
  const { athletes, searchAthletes, removeAthlete, myCoaches, leaveCoach, refreshAthletes, refreshMyCoaches } = useCoachAthletes(session?.user?.id);
  const {
    notifications, sentInvites, unreadCount,
    markInfosRead, sendCoachRequest, respondCoachRequest, notifyPlanUpdate,
    refreshNotifications,
  } = useNotifications(session?.user?.id);

  // ── Synchronisation avec le cloud ──────────────────────────────────────────
  // Connexion, retour au premier plan, notification temps réel, enregistrement,
  // boutons du compte : **tout passe par une seule file** (`runSync`), une passe
  // à la fois. C'est ce qui manquait. Un rapatriement pouvait se glisser entre
  // le moment où une modification était prise en photo et celui où elle
  // partait ; l'envoi présentait alors la date fraîchement téléchargée avec des
  // données d'avant, la garde le laissait passer, et un téléphone resté sur
  // l'ancien état écrasait tout ce que le PC venait de faire. Reproduit, deux
  // appareils contre une fausse base : c'est ce qui a vidé un PC sous les yeux
  // de son utilisateur.
  //
  // Une passe regarde la date de la ligne, la compare au marqueur local
  // (`lib/sync-meta.js`) et agit ; quand les deux côtés ont bougé, elle
  // fusionne **à trois voies** avec la base — le dernier état commun — pour ne
  // donner raison à un appareil que sur ce qu'il a réellement modifié
  // (`lib/merge-plan.js`). Chaque envoi est gardé par la date **des données
  // qu'il envoie**, jamais par celle du marqueur au moment de partir.
  //
  // Le rôle du compte se résout au même endroit, depuis la même requête.
  const dataRef = useRef(data);
  // Pendant le commit, pas après : une passe qui reprend après une requête doit
  // voir la dernière frappe, sinon elle fusionnerait contre un planning d'une
  // frappe en retard.
  useLayoutEffect(() => { dataRef.current = data; }, [data]);
  const viewingAthleteRef = useRef(null);
  useEffect(() => { viewingAthleteRef.current = viewingAthlete; }, [viewingAthlete]);
  const userIdRef = useRef(null);
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = session; userIdRef.current = session?.user?.id ?? null; }, [session]);
  // Tant que la première passe n'a pas abouti, aucun envoi automatique : on ne
  // sait pas encore ce que contient la base (ni à qui appartient le local).
  const syncReadyRef = useRef(false);
  const loginRetriesRef = useRef(0);
  const lastWakeRef = useRef(0);
  const initialDataRef = useRef(data);
  // Le planning que la synchro vient de poser elle-même. L'auto-save le
  // reconnaît **à son identité** et ne le prend pas pour une modification ; une
  // frappe arrivée entre-temps a une autre identité, et en reste une.
  const adoptedRef = useRef(null);
  const syncQueueRef = useRef({ running: null, reasons: new Set() });
  const saveTimerRef = useRef(null);

  // Pose un planning venu de la synchro. `from` : la version locale dont il a
  // été calculé. Si l'écran a bougé depuis, la modification est refusionnée
  // par-dessus au lieu d'être écrasée.
  const adoptData = (next, from) => {
    const cur = dataRef.current;
    const value = cur === from ? next : migrateData(mergePlans(cur, next, from));
    adoptedRef.current = value;
    dataRef.current = value;
    setData(prev => (prev === cur ? value : migrateData(mergePlans(prev, value, cur))));
    saveData(value);
    return value;
  };

  // Un échange a abouti : le cloud contient `written` à la date `at`. `local` :
  // le planning que cet échange couvre. Si l'écran a bougé depuis, il reste du
  // travail — le marqueur reste sale, une autre passe suivra.
  const settle = (userId, at, written, local) => {
    const dirty = dataRef.current !== local;
    settleSync({ userId, syncedAt: at, base: written, dirty });
    setLocalDataOwner(userId);
    if (dirty) scheduleSave();
  };

  // Une passe en cours ne doit rien poser à l'écran si le coach vient d'ouvrir
  // le planning d'un athlète : ce serait le sien qui s'afficherait à la place.
  const stillOwn = () => {
    if (viewingAthleteRef.current) throw new Error("vue athlète ouverte");
  };

  // Rapatrier le cloud, en gardant ce qui doit l'être du local. Trois modes :
  //   "pull"  — rien à envoyer au moment de décider (ou un local qui appartient
  //             à un autre compte, qu'on jette) : le cloud remplace le local.
  //             Seule une frappe faite **pendant** le téléchargement survit,
  //             fusionnée par-dessus : `decided` est le local au moment de
  //             décider, donc la base exacte de cette frappe.
  //   "merge" — du local non envoyé : fusion à trois voies avec la base.
  //   "force" — le bouton « Charger depuis le cloud » : le cloud écrase tout,
  //             sur ordre explicite.
  // ⚠️ Le mode vient de la décision, pas de `dirtyAt` : un navigateur qui a
  // servi à un autre compte porte un marqueur sale, et le fusionner ferait
  // entrer le planning de cet autre compte dans celui-ci.
  const pullOrMerge = async (userId, mode = "merge", decided = dataRef.current) => {
    let base = mode === "merge" ? readSyncBase(readSyncMeta().syncedAt) : decided;
    for (let attempt = 0; attempt < 3; attempt++) {
      const cloud = await loadFromCloud(userId);
      stillOwn();
      if (!cloud) return;
      const { _cloudUpdatedAt: at, _status, ...raw } = cloud;
      void _status;
      const cloudData = migrateData(raw);
      const local = dataRef.current;
      const target = mode === "force" ? cloudData
        : mode === "pull" && local === decided ? cloudData
        : migrateData(mergePlans(local, cloudData, base));
      const shown = adoptData(target, local);
      if (deepEqual(target, cloudData)) {
        settle(userId, at, cloudData, shown);
        return;
      }
      reportSync("saving");
      const res = await writeGuarded(target, userId, at);
      stillOwn();
      if (res.ok) {
        settle(userId, res.updatedAt, target, shown);
        reportSync("saved");
        return;
      }
      // Une troisième écriture est passée entre-temps. `target` a été bâti sur
      // `cloudData` : c'est elle, la base du tour suivant — et ce tour-là est une
      // fusion, quoi qu'il en soit de celui-ci.
      base = cloudData;
      mode = "merge";
    }
    throw new Error("conflit de synchronisation persistant");
  };

  // Envoyer le local, gardé par la date sur laquelle il est bâti. Refusé :
  // quelqu'un a écrit entre-temps, on passe par la fusion.
  const pushLocal = async (userId, expectedAt) => {
    const sent = dataRef.current;
    reportSync("saving");
    if (!expectedAt) {
      // Premier envoi : le compte n'a pas encore de ligne, rien à préserver.
      const at = await upsertRow(sent, userId);
      stillOwn();
      settle(userId, at, sent, sent);
      reportSync("saved");
      return;
    }
    const res = await writeGuarded(sent, userId, expectedAt);
    stillOwn();
    if (res.ok) {
      settle(userId, res.updatedAt, sent, sent);
      reportSync("saved");
      return;
    }
    await pullOrMerge(userId, "merge");
  };

  // Garde anti-fuite : le localStorage est partagé par NAVIGATEUR. Un compte
  // tout neuf ne doit pas hériter du planning du précédent — ici on écrase
  // volontairement, c'est le but.
  const resetForAccount = async (userId) => {
    const blank = migrateData(freshData());
    const shown = adoptData(blank, dataRef.current);
    const at = await upsertRow(blank, userId);
    settle(userId, at, blank, shown);
  };

  // `status` NULL = n'a jamais choisi son rôle → onboarding. Mais on ne le
  // rejoue qu'au premier passage : un réveil d'app pendant que la modale est
  // ouverte ne doit pas défaire le choix en cours d'enregistrement.
  const applyRole = useCallback((status, initial) => {
    if (status == null) {
      if (!initial) return;
      setAccountRole(null);
      setNeedsRoleChoice(true);
    } else {
      setAccountRole(roleFromStatus(status));
      setNeedsRoleChoice(false);
    }
    setRoleResolved(true);
  }, []);

  const syncPass = async (reasons) => {
    const userId = userIdRef.current;
    if (!supabase || !userId || viewingAthleteRef.current) return;
    const initial = reasons.has("login");
    const onlySave = [...reasons].every(r => r === "save");
    // Avant la première passe réussie, un enregistrement attend : la passe de
    // connexion s'en chargera, une fois qu'on saura ce que contient la base.
    if (onlySave && !syncReadyRef.current) return;
    let ok = false;
    try {
      if (onlySave) {
        // Le cas courant — une modification ici, rien de neuf là-bas : on tente
        // l'écriture conditionnelle directement. Une requête, pas deux.
        const meta = readSyncMeta();
        if (!meta.dirtyAt) { ok = true; return; }
        if (meta.syncedAt && meta.userId === userId) {
          const sent = dataRef.current;
          reportSync("saving");
          const res = await writeGuarded(sent, userId, meta.syncedAt);
          stillOwn();
          if (res.ok) {
            settle(userId, res.updatedAt, sent, sent);
            reportSync("saved");
            ok = true;
            return;
          }
        }
      }
      if (reasons.has("manual")) markDirty();   // « Envoyer » : même sans modification
      const head = await fetchCloudHead(userId);
      stillOwn();
      if (reasons.has("force-pull")) {
        if (head?.exists) await pullOrMerge(userId, "force");
      } else {
        const stored = readSyncMeta();
        // `climbing_planner_owner_v1` précède le marqueur de synchro : sur une
        // installation qui vient de se mettre à jour, c'est lui qui sait à qui
        // appartiennent les données locales, et la garde anti-fuite en dépend.
        const meta = { ...stored, userId: stored.userId ?? getLocalDataOwner() };
        const decided = dataRef.current;
        const action = decideSync({
          hasCloudRow: !!head?.exists, cloudUpdatedAt: head?.updatedAt ?? null, meta, userId,
        });
        if (action === "reset") await resetForAccount(userId);
        else if (action === "push") await pushLocal(userId, head?.exists ? meta.syncedAt : null);
        else if (action === "pull" || action === "merge") await pullOrMerge(userId, action, decided);
      }
      if (head) applyRole(head.exists ? (head.status ?? null) : null, initial);
      ok = true;
    } catch {
      // Hors ligne, jeton pas encore rafraîchi, conflit persistant : les données
      // locales restent telles quelles, `dirtyAt` reste posé, et une prochaine
      // passe réessaiera — au réveil, au retour du réseau, à la prochaine
      // modification, ou dans quelques secondes si c'est la connexion.
      // (Une vue athlète ouverte en cours de passe n'est pas une panne réseau.)
      if (!viewingAthleteRef.current) reportSync("offline");
      if (initial && loginRetriesRef.current < 3) {
        loginRetriesRef.current += 1;
        setTimeout(() => runSync("login"), 5000);
      }
    } finally {
      if (ok) syncReadyRef.current = true;
      // L'écran, lui, doit sortir du squelette même hors ligne.
      setCloudLoaded(true);
    }
  };
  // La file appelle toujours la dernière version (elle lit l'état du rendu).
  const syncPassRef = useRef(syncPass);
  useLayoutEffect(() => { syncPassRef.current = syncPass; });

  // La file : une demande pendant une passe ne lance pas une passe parallèle,
  // elle en ajoute une après — et plusieurs demandes s'y regroupent.
  const runSync = useCallback((reason) => {
    const q = syncQueueRef.current;
    q.reasons.add(reason);
    if (q.running) return q.running;
    q.running = (async () => {
      try {
        while (q.reasons.size) {
          const reasons = new Set(q.reasons);
          q.reasons.clear();
          await syncPassRef.current(reasons).catch(() => {});
        }
      } finally {
        q.running = null;
      }
    })();
    return q.running;
  }, []);

  function scheduleSave() {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => runSync("save"), 500);
  }

  // ── À la connexion ──
  useEffect(() => {
    if (!session?.user?.id) return;
    syncReadyRef.current = false;
    loginRetriesRef.current = 0;
    runSync("login");
  }, [session?.user?.id]); // eslint-disable-line

  // ── Au retour de l'app au premier plan ──
  // Dans l'APK, la WebView survit à la mise en arrière-plan, et le temps réel
  // n'est pas connecté quand l'app dort : sans cette passe, rien ne relirait la
  // base avant la prochaine modification.
  useEffect(() => {
    if (!session?.user?.id) return;
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      // Reprise de focus, retour au premier plan et retour du réseau arrivent
      // souvent ensemble : une passe suffit.
      if (Date.now() - lastWakeRef.current < 3000) return;
      lastWakeRef.current = Date.now();
      runSync("resume");
      // Le planning n'est pas seul à vivre en base : la bibliothèque, les
      // athlètes et les notifications aussi. On les rafraîchit au réveil,
      // sinon ils datent de l'ouverture de l'app.
      refreshCatalog?.();
      refreshAthletes?.();
      refreshMyCoaches?.();
      refreshNotifications?.();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [session?.user?.id]); // eslint-disable-line

  // ── Temps réel : un autre appareil vient d'écrire ──
  // (nos propres écritures reviennent aussi par là : la passe les trouve à
  // jour et ne fait rien.)
  useEffect(() => {
    if (!session?.user?.id || !cloudLoaded) return;
    return subscribeToChanges(session.user.id, () => runSync("realtime"));
  }, [session?.user?.id, cloudLoaded]); // eslint-disable-line

  // ── Envoi de secours, quand l'app passe en arrière-plan ──
  // Fermer l'onglet ou quitter l'app pendant l'attente d'un envoi ne doit rien
  // perdre — mais surtout rien écraser. L'ancien envoi de secours était un
  // upsert **sans condition** : un téléphone dont un envoi avait échoué gardait
  // son instantané armé, et le poussait au prochain changement d'app par-dessus
  // tout ce qu'un autre appareil avait écrit entre-temps. Celui-ci est gardé
  // comme les autres : si la ligne a bougé, il ne touche à rien, et la
  // prochaine ouverture fusionnera.
  //
  // Un `fetch` keepalive ne peut pas lire sa réponse (la page s'en va) : le
  // marqueur reste sale, la prochaine passe trouvera la ligne à jour et le
  // constatera. Au-delà de 64 Ko de corps, le navigateur refuse le keepalive —
  // `dirtyAt` s'en charge alors au prochain lancement.
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabase || !url) return;
    const flush = () => {
      const userId = userIdRef.current;
      const token = sessionRef.current?.access_token;
      const meta = readSyncMeta();
      if (!userId || !token || viewingAthleteRef.current) return;
      if (!meta.dirtyAt || !meta.syncedAt || meta.userId !== userId) return;
      const plan = dataRef.current;
      const q = `user_id=eq.${encodeURIComponent(userId)}&updated_at=eq.${encodeURIComponent(meta.syncedAt)}`;
      try {
        fetch(`${url}/rest/v1/climbing_plans?${q}`, {
          method: "PATCH",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            data: plan,
            first_name: plan?.profile?.firstName ?? null,
            last_name: plan?.profile?.lastName ?? null,
          }),
        }).catch(() => {});
      } catch { /* corps trop gros pour un keepalive : ce sera au prochain lancement */ }
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  // ── Reset à la déconnexion ──
  useEffect(() => {
    if (!session) {
      // Le marqueur de synchro survit volontairement : les données locales
      // appartiennent toujours à ce compte, et si elles n'ont pas fini d'être
      // envoyées, `dirtyAt` doit encore être là à la reconnexion.
      syncReadyRef.current = false;
      setCloudLoaded(false);
      setRoleResolved(false);
      setAccountRole(undefined);
      setNeedsRoleChoice(false);
    }
  }, [session]);

  // ── Migration: customSessions → sessions_catalog ──
  useEffect(() => {
    if (migrationDoneRef.current) return;
    if (!session?.user?.id) return;
    const customs = data?.customSessions;
    if (!customs || customs.length === 0) return;
    migrationDoneRef.current = true;
    Promise.all(customs.map(s => saveUserSession(s))).then(() => {
      setData(d => ({ ...d, customSessions: [] }));
    });
  }, [session?.user?.id, data?.customSessions?.length, saveUserSession]);

  // ── Migration: avatarDataUrl → Supabase Storage ──
  useEffect(() => {
    if (avatarMigratedRef.current) return;
    if (!session?.user?.id) return;
    if (!cloudLoaded) return;
    const legacy = data?.profile?.avatarDataUrl;
    if (!legacy || data?.profile?.avatarUrl) return;
    avatarMigratedRef.current = true;
    import("../lib/avatar-storage.js")
      .then(({ uploadAvatar }) => uploadAvatar(session.user.id, legacy))
      .then(url => {
        setData(d => ({
          ...d,
          profile: { ...(d.profile || {}), avatarUrl: url, avatarDataUrl: undefined },
        }));
      })
      .catch(e => {
        console.warn("[avatar] migration legacy → storage failed:", e);
      });
  }, [session?.user?.id, cloudLoaded, data?.profile?.avatarDataUrl, data?.profile?.avatarUrl]);

  // ── Auto-save ──
  // Le local d'abord, toujours : même hors ligne, même avant la première
  // passe, rien ne se perd. Le cloud ensuite, par la file de synchro.
  useEffect(() => {
    // Tant que `data` est encore l'objet sorti du localStorage au montage,
    // rien n'a changé. Le marquer « modifié » ferait passer des données au
    // repos pour plus récentes que la base. (Comparaison par identité, et non
    // par « premier passage » : en développement React monte les effets deux
    // fois, ce qui suffisait à salir le marqueur.)
    if (data === initialDataRef.current) return;
    // Posé par la synchro : déjà enregistré, déjà d'accord avec le cloud.
    if (data === adoptedRef.current) return;
    if (viewingAthlete) {
      saveToCloud(data, viewingAthlete.userId);
      return;
    }
    saveData(data);
    if (!session?.user?.id) return;
    markDirty();                        // à renvoyer, tôt ou tard
    scheduleSave();
  }, [data]); // eslint-disable-line

  // Bouton « ↓ Charger depuis le cloud » : un ordre explicite, donc pas de
  // politique — on prend la version en base, quoi qu'en dise le marqueur.
  const pullFromCloud = () => runSync("force-pull");
  // Bouton « Envoyer » : envoie le local même sans modification — sous garde,
  // donc en fusionnant si un autre appareil a écrit entre-temps.
  const uploadNow = () => runSync("manual");

  // ── Rafraîchir la liste d'athlètes quand une invitation est acceptée ──
  // (la notification coach_accepted arrive en temps réel côté coach)
  const acceptedCount = notifications.filter(n => n.type === "coach_accepted").length;
  useEffect(() => {
    if (acceptedCount > 0) refreshAthletes();
  }, [acceptedCount]); // eslint-disable-line

  // ── Choix du rôle ──
  // Écrit le statut en DB ('solo' pour « athlète solo »), pose le rôle du
  // compte et la copie d'affichage dans le profil. Appelé à l'inscription
  // (RoleOnboardingModal) comme depuis le compte (RoleSection).
  //
  // L'affichage bascule tout de suite, mais si la base refuse l'écriture on
  // revient en arrière : un rôle qui n'est pas dans `status` n'existe pas —
  // le prochain démarrage, ou l'autre appareil, l'ignorerait.
  const chooseRole = async (role) => {
    const previousRole = accountRole;
    const previousNeedsChoice = needsRoleChoice;
    setAccountRole(role);
    setNeedsRoleChoice(false);
    setData(d => ({ ...d, profile: { ...(d.profile || {}), role } }));
    const userId = session?.user?.id;
    if (!userId) return {};
    const { error } = await writeStatus(userId, role);
    if (error) {
      setAccountRole(previousRole);
      setNeedsRoleChoice(previousNeedsChoice);
      setData(d => ({ ...d, profile: { ...(d.profile || {}), role: previousRole ?? null } }));
    }
    return { error };
  };

  // ── Coach-athlete switching ──
  // athleteSnapshotRef : état du planning de l'athlète à l'ouverture de la
  // vue — sert à détecter les modifications pour la notification de sortie.
  const athleteSnapshotRef = useRef(null);
  const switchToAthlete = async (athlete) => {
    if (!supabase) return;
    coachDataRef.current = data;
    const { data: row } = await supabase
      .from("climbing_plans")
      .select("data")
      .eq("user_id", athlete.userId)
      .maybeSingle();
    const athleteData = row?.data ?? {
      weeks: {}, weekMeta: {}, customSessions: [],
      mesocycles: DEFAULT_MESOCYCLES, sleep: [], hooper: [],
      notes: {}, creatine: {}, weight: {}, nutrition: {},
      profile: {}, customCycles: [], cyclesLocked: false,
    };
    setViewingAthlete(athlete);
    athleteSnapshotRef.current = {
      weeks: JSON.stringify(athleteData.weeks ?? {}),
      weekKeys: athleteData.weeks ?? {},
      cycles: JSON.stringify([athleteData.mesocycles ?? [], athleteData.customCycles ?? []]),
    };
    setData(athleteData);
  };

  const switchBackToCoach = () => {
    // Si le coach a modifié le planning de l'athlète pendant la vue,
    // on envoie UNE notification (cloche) à l'athlète en sortant.
    const snap = athleteSnapshotRef.current;
    if (snap && viewingAthlete) {
      const weeksNow = JSON.stringify(data.weeks ?? {});
      const cyclesNow = JSON.stringify([data.mesocycles ?? [], data.customCycles ?? []]);
      const weeksChanged = weeksNow !== snap.weeks;
      const cyclesChanged = cyclesNow !== snap.cycles;
      if (weeksChanged || cyclesChanged) {
        // Semaines touchées (pour un message concret côté athlète).
        const before = snap.weekKeys;
        const changedWeeks = Object.keys({ ...(data.weeks ?? {}), ...before })
          .filter(k => JSON.stringify((data.weeks ?? {})[k]) !== JSON.stringify(before[k]))
          .sort()
          .slice(0, 4);
        const coachProfile = coachDataRef.current?.profile ?? {};
        const fromName = [coachProfile.firstName, coachProfile.lastName].filter(Boolean).join(" ") || "Ton coach";
        notifyPlanUpdate(viewingAthlete.userId, fromName, { weeks: changedWeeks, cyclesChanged });
      }
    }
    athleteSnapshotRef.current = null;
    if (coachDataRef.current) {
      setData(coachDataRef.current);
      coachDataRef.current = null;
    }
    setViewingAthlete(null);
  };

  // ── Mesocycle CRUD ──
  const updateMesocycles = updater => setData(d => ({ ...d, mesocycles: updater(d.mesocycles || []) }));
  // Le chaînage ne se rejoue que sur ce qui déplace les dates : durée, ajout,
  // retrait, réarrangement, ancre. Renommer un bloc ne réécrit pas le plan.
  const addMesocycle = () => updateMesocycles(m => recomputeMesoDates([...m, { id: generateId(), label: "Nouveau mésocycle", color: DATA.picker[0], durationWeeks: 4, startDate: "", description: "", microcycles: [] }]));
  const updateMesocycle = (id, changes) => updateMesocycles(m => {
    const next = m.map(x => x.id === id ? { ...x, ...changes } : x);
    return "durationWeeks" in changes ? recomputeMesoDates(next) : next;
  });
  const deleteMesocycle = id => updateMesocycles(m => recomputeMesoDates(m.filter(x => x.id !== id)));
  // Une date saisie sur n'importe quel mésocycle devient l'ancre du plan.
  const anchorMesocycle = (id, startDate) => updateMesocycles(m => setAnchor(m, id, startDate));
  const reorderMesocycles = (from, to) => updateMesocycles(m => moveMeso(m, from, to));
  const addMicrocycle = mesoId => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: [...x.microcycles, { id: generateId(), label: "Nouveau microcycle", durationWeeks: 1, description: "" }] } : x));
  const updateMicrocycle = (mesoId, microId, changes) => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: x.microcycles.map(mc => mc.id === microId ? { ...mc, ...changes } : mc) } : x));
  const deleteMicrocycle = (mesoId, microId) => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: x.microcycles.filter(mc => mc.id !== microId) } : x));

  // ── Blocs de course (objectif km/semaine) ──
  // Piste à part des mésocycles : chaque bloc porte SA date de début, sans
  // chaînage. C'est ce qui permet de laisser exprès des semaines vides entre
  // deux blocs — le chaînage des mésocycles, lui, colle les blocs bout à bout.
  const updateRunBlocks = updater => setData(d => ({ ...d, runBlocks: updater(d.runBlocks || []) }));
  const addRunBlock = () => updateRunBlocks(list => [...list, {
    id: generateId(), ...DEFAULT_RUN_BLOCK, color: DATA.picker[3], startDate: "", overrides: {},
  }]);
  const updateRunBlock = (id, changes) => updateRunBlocks(list => list.map(b => b.id === id ? { ...b, ...changes } : b));
  const deleteRunBlock = id => updateRunBlocks(list => list.filter(b => b.id !== id));
  // Une semaine forcée : `null` efface le forçage et rend la semaine à la courbe.
  const setRunBlockOverride = (id, weekIndex, km) => updateRunBlocks(list => list.map(b => {
    if (b.id !== id) return b;
    const overrides = { ...(b.overrides || {}) };
    if (km == null || km === "") delete overrides[weekIndex];
    else overrides[weekIndex] = Number(km);
    return { ...b, overrides };
  }));

  // ── Custom cycle CRUD ──
  const updateCustomCycles = updater => setData(d => ({ ...d, customCycles: updater(d.customCycles || []) }));
  const addCustomCycle = cc => updateCustomCycles(list => [...list, cc]);
  const updateCustomCycle = (id, cc) => updateCustomCycles(list => list.map(x => x.id === id ? { ...x, ...cc } : x));
  const deleteCustomCycle = id => updateCustomCycles(list => list.filter(x => x.id !== id));

  // ── Quick session CRUD ──
  const addQuickSession = qs => setData(d => ({ ...d, quickSessions: [...(d.quickSessions || []), qs] }));
  const editQuickSession = qs => setData(d => ({ ...d, quickSessions: (d.quickSessions || []).map(q => q.id === qs.id ? qs : q) }));
  const removeQuickSession = id => setData(d => ({ ...d, quickSessions: (d.quickSessions || []).filter(q => q.id !== id) }));

  // ── Répercute une modification de modèle sur les séances planifiées ──
  const syncPlannedSessions = (updatedSession) => {
    if (!updatedSession?.id) return;
    const todayKey = weekKey(getMondayOf(new Date()));
    setData(d => {
      let changed = false;
      const newWeeks = Object.fromEntries(
        Object.entries(d.weeks).map(([key, weekData]) => {
          if (key < todayKey || !Array.isArray(weekData)) return [key, weekData];
          const newWeek = weekData.map(dayArr =>
            Array.isArray(dayArr)
              ? dayArr.map(s => {
                  if (s.id === updatedSession.id && !s.isBlock) {
                    changed = true;
                    return { ...updatedSession, feedback: s.feedback, startTime: s.startTime, endTime: s.endTime, coachNote: s.coachNote, date: s.date };
                  }
                  return s;
                })
              : dayArr
          );
          return [key, newWeek];
        })
      );
      return changed ? { ...d, weeks: newWeeks } : d;
    });
  };

  const value = {
    data, setData,
    cloudLoaded, roleResolved, viewingAthlete,
    accountRole, needsRoleChoice, chooseRole,
    syncStatus,
    switchToAthlete, switchBackToCoach,
    pullFromCloud,
    uploadNow,
    writeStatus,
    catalog, saveUserSession, deleteUserSession,
    communitySessions, pushToCommunity, deleteFromCommunity,
    athletes, searchAthletes, removeAthlete, myCoaches, leaveCoach, refreshAthletes, refreshMyCoaches,
    notifications, sentInvites, unreadCount,
    markInfosRead, sendCoachRequest, respondCoachRequest, refreshNotifications,
    addMesocycle, updateMesocycle, deleteMesocycle, anchorMesocycle, reorderMesocycles,
    addMicrocycle, updateMicrocycle, deleteMicrocycle,
    addCustomCycle, updateCustomCycle, deleteCustomCycle,
    addRunBlock, updateRunBlock, deleteRunBlock, setRunBlockOverride,
    addQuickSession, editQuickSession, removeQuickSession,
    syncPlannedSessions,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
