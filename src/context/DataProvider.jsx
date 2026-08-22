import { useState, useEffect, useRef, useCallback } from "react";
import { DataContext } from "./DataContext.js";
import { useAuth } from "./AuthContext.js";
import supabase from "../lib/supabase.js";
import { DEFAULT_MESOCYCLES } from "../lib/constants.js";
import { getMondayOf, weekKey } from "../lib/helpers.js";
import { generateId, loadData, saveData, migrateData, freshData, getLocalDataOwner, setLocalDataOwner } from "../lib/storage.js";
import { readSyncMeta, markDirty, markSynced, decideSync } from "../lib/sync-meta.js";
import { useCommunitySessionsSync } from "../hooks/useCommunitySessionsSync.js";
import { useSessionsCatalog } from "../hooks/useSessionsCatalog.js";
import { useCoachAthletes } from "../hooks/useCoachAthletes.js";
import { useNotifications } from "../hooks/useNotifications.js";
import { DATA } from "../theme/palette.js";

export function DataProvider({ children }) {
  const {
    session, syncStatus, fetchCloudHead, loadFromCloud, saveToCloud,
    uploadNow, writeStatus, subscribeToChanges, hasPendingSave,
  } = useAuth();

  const [data, setData] = useState(loadData);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);
  // Rôle du COMPTE connecté (colonne status, jamais le blob affiché) :
  // undefined = pas encore résolu · null = athlète solo · "coach" | "athlete" | "auto".
  // Toute l'UI de permissions doit dériver de cette valeur — pas de
  // data.profile.role, qui devient celui de l'ATHLÈTE en vue athlète.
  const [accountRole, setAccountRole] = useState(undefined);
  // true = la colonne status est NULL en DB → l'utilisateur n'a jamais choisi.
  const [needsRoleChoice, setNeedsRoleChoice] = useState(false);

  const coachDataRef = useRef(null);
  const [viewingAthlete, setViewingAthlete] = useState(null);

  const isCloudSetRef = useRef(false);
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

  // ── Réconciliation avec le cloud ───────────────────────────────────────────
  // Une seule fonction, appelée à chaque moment où l'état des deux côtés peut
  // avoir divergé : connexion, retour de l'app au premier plan, notification
  // temps réel, bouton « Charger depuis le cloud ». Elle regarde la date de la
  // ligne, la compare à notre marqueur local (`lib/sync-meta.js`) et tire les
  // conséquences — sans jamais écraser le plus récent des deux.
  //
  // Le rôle du compte se résout au même endroit, depuis la même requête : plus
  // de SELECT status séparé qui pouvait perdre la course contre le premier
  // upload (et sauter silencieusement le choix du rôle).
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const viewingAthleteRef = useRef(null);
  useEffect(() => { viewingAthleteRef.current = viewingAthlete; }, [viewingAthlete]);
  // Tant que la première réconciliation n'a pas eu lieu, aucune écriture
  // automatique vers le cloud : c'est ce qui laissait des données locales
  // périmées écraser une ligne plus fraîche pendant le chargement.
  const syncReadyRef = useRef(false);
  const reconcilingRef = useRef(false);
  const lastReconcileRef = useRef(0);
  const loginRetriesRef = useRef(0);
  const lastWakeRef = useRef(0);
  const initialDataRef = useRef(data);

  const adoptCloudData = (cloudData, userId, updatedAt) => {
    const { _cloudUpdatedAt: _cua, _status, ...cleanData } = cloudData;
    void _cua; void _status;
    const migrated = migrateData(cleanData);
    isCloudSetRef.current = true;
    setData(migrated);
    saveData(migrated);
    markSynced(userId, updatedAt);
    setLocalDataOwner(userId);
  };

  // `status` NULL = n'a jamais choisi son rôle → onboarding. Mais on ne le
  // rejoue qu'au premier passage : un réveil d'app pendant que la modale est
  // ouverte ne doit pas défaire le choix en cours d'enregistrement.
  const applyRole = (status, initial) => {
    if (status == null) {
      if (!initial) return;
      setAccountRole(null);
      setNeedsRoleChoice(true);
    } else {
      setAccountRole(status === "solo" ? null : status);
      setNeedsRoleChoice(false);
    }
    setRoleResolved(true);
  };

  const reconcile = useCallback(async (reason = "auto") => {
    const userId = session?.user?.id;
    if (!supabase || !userId) return;
    // En vue athlète, `data` n'est pas le planning du coach : on ne touche à
    // rien tant qu'il n'est pas revenu chez lui.
    if (viewingAthleteRef.current) return;
    if (reconcilingRef.current) return;
    // Les réveils d'app arrivent en rafale (visibilitychange + focus) :
    // une passe à la fois suffit.
    if (reason === "resume" && Date.now() - lastReconcileRef.current < 3000) return;
    reconcilingRef.current = true;
    const initial = reason === "login";
    let ok = false;
    try {
      const head = await fetchCloudHead(userId);
      // `climbing_planner_owner_v1` précède le marqueur de synchro : sur une
      // installation qui vient de se mettre à jour, c'est lui qui sait à qui
      // appartiennent les données locales, et la garde anti-fuite en dépend.
      const stored = readSyncMeta();
      const meta = { ...stored, userId: stored.userId ?? getLocalDataOwner() };
      const action = decideSync({
        hasCloudRow:    !!head?.exists,
        cloudUpdatedAt: head?.updatedAt ?? null,
        meta,
        userId,
      });

      if (action === "pull") {
        const cloudData = await loadFromCloud(userId);
        if (cloudData) adoptCloudData(cloudData, userId, head.updatedAt);
        applyRole(head.status ?? null, initial);
      } else if (action === "push") {
        const updatedAt = await uploadNow(dataRef.current, userId);
        if (updatedAt) markSynced(userId, updatedAt);
        setLocalDataOwner(userId);
        applyRole(head?.exists ? (head.status ?? null) : null, initial);
      } else if (action === "reset") {
        // Garde anti-fuite : le localStorage est partagé par NAVIGATEUR. Un
        // compte tout neuf ne doit pas hériter du planning du précédent.
        const blank = migrateData(freshData());
        isCloudSetRef.current = true;
        setData(blank);
        saveData(blank);
        const updatedAt = await uploadNow(blank, userId);
        markSynced(userId, updatedAt);
        setLocalDataOwner(userId);
        applyRole(null, initial);
      } else {
        applyRole(head?.status ?? null, initial);
      }
      ok = true;
    } catch {
      // Hors ligne, ou jeton pas encore rafraîchi au démarrage : on garde les
      // données locales telles quelles, `dirtyAt` reste posé, et on réessaie —
      // au réveil, au retour du réseau, ou dans quelques secondes si c'est la
      // toute première tentative.
      if (initial && loginRetriesRef.current < 3) {
        loginRetriesRef.current += 1;
        setTimeout(() => reconcileRef.current?.("login"), 5000);
      }
    } finally {
      lastReconcileRef.current = Date.now();
      reconcilingRef.current = false;
      // Tant qu'on ne sait pas ce que contient la base, l'auto-save reste
      // cantonné au localStorage : pas question d'y pousser à l'aveugle.
      syncReadyRef.current = ok;
      // L'écran, lui, doit sortir du squelette même hors ligne.
      setCloudLoaded(true);
    }
  }, [session?.user?.id, fetchCloudHead, loadFromCloud, uploadNow]);

  // Le retry différé doit appeler la version courante, pas celle capturée à la
  // création du timer.
  const reconcileRef = useRef(reconcile);
  useEffect(() => { reconcileRef.current = reconcile; }, [reconcile]);

  // ── À la connexion ──
  useEffect(() => {
    if (!session?.user?.id) return;
    syncReadyRef.current = false;
    loginRetriesRef.current = 0;
    reconcile("login");
  }, [session?.user?.id]); // eslint-disable-line

  // ── Au retour de l'app au premier plan ──
  // C'est le chaînon qui manquait : dans l'APK, la WebView survit à la mise en
  // arrière-plan, donc rien ne relisait jamais la base — seul le temps réel
  // aurait pu prévenir, et il n'est pas connecté quand l'app dort. Les deux
  // appareils devaient donc être ouverts au même moment pour se synchroniser.
  useEffect(() => {
    if (!session?.user?.id) return;
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      // Reprise de focus, retour au premier plan et retour du réseau arrivent
      // souvent ensemble : une passe suffit.
      if (Date.now() - lastWakeRef.current < 3000) return;
      lastWakeRef.current = Date.now();
      reconcile("resume");
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
  }, [session?.user?.id, reconcile]); // eslint-disable-line

  // ── Temps réel : un autre appareil vient d'écrire ──
  useEffect(() => {
    if (!session?.user?.id || !cloudLoaded) return;
    const unsubscribe = subscribeToChanges(session.user.id, () => {
      if (hasPendingSave()) return;
      reconcile("realtime");
    });
    return unsubscribe;
  }, [session?.user?.id, cloudLoaded, reconcile]); // eslint-disable-line

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
  // réconciliation, rien ne se perd. Le cloud ensuite, mais seulement une fois
  // qu'on sait ce qu'il contient.
  useEffect(() => {
    if (isCloudSetRef.current) {
      isCloudSetRef.current = false;
      return;
    }
    // Tant que `data` est encore l'objet sorti du localStorage au montage,
    // rien n'a changé. Le marquer « modifié » ferait passer des données au
    // repos pour plus récentes que la base — et le prochain démarrage
    // écraserait le planning saisi ailleurs. (Comparaison par identité, et non
    // par « premier passage » : en développement React monte les effets deux
    // fois, ce qui suffisait à salir le marqueur.)
    if (data === initialDataRef.current) return;
    if (viewingAthlete) {
      saveToCloud(data, viewingAthlete.userId);
      return;
    }
    saveData(data);
    const userId = session?.user?.id;
    if (!userId) return;
    markDirty();                        // à renvoyer, tôt ou tard
    if (!syncReadyRef.current) return;  // réconciliation en cours : on attend
    saveToCloud(data, userId);
  }, [data]); // eslint-disable-line

  // Bouton « ↓ Charger depuis le cloud » : un ordre explicite, donc pas de
  // politique — on prend la version en base, quoi qu'en dise le marqueur.
  const pullFromCloud = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const head = await fetchCloudHead(userId).catch(() => null);
    const cloudData = await loadFromCloud(userId);
    if (cloudData) adoptCloudData(cloudData, userId, head?.updatedAt ?? null);
  };

  // ── Rafraîchir la liste d'athlètes quand une invitation est acceptée ──
  // (la notification coach_accepted arrive en temps réel côté coach)
  const acceptedCount = notifications.filter(n => n.type === "coach_accepted").length;
  useEffect(() => {
    if (acceptedCount > 0) refreshAthletes();
  }, [acceptedCount]); // eslint-disable-line

  // ── Choix du rôle (onboarding) ──
  // Écrit le statut en DB ('solo' pour « athlète solo »), pose le rôle du
  // compte et la copie d'affichage dans le profil.
  const chooseRole = (role) => {
    setAccountRole(role);
    setNeedsRoleChoice(false);
    setData(d => ({ ...d, profile: { ...(d.profile || {}), role } }));
    if (session?.user?.id) writeStatus(session.user.id, role);
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
  const addMesocycle = () => updateMesocycles(m => [...m, { id: generateId(), label: "Nouveau mésocycle", color: DATA.picker[0], durationWeeks: 4, startDate: "", description: "", microcycles: [] }]);
  const updateMesocycle = (id, changes) => updateMesocycles(m => m.map(x => x.id === id ? { ...x, ...changes } : x));
  const deleteMesocycle = id => updateMesocycles(m => m.filter(x => x.id !== id));
  const addMicrocycle = mesoId => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: [...x.microcycles, { id: generateId(), label: "Nouveau microcycle", durationWeeks: 1, description: "" }] } : x));
  const updateMicrocycle = (mesoId, microId, changes) => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: x.microcycles.map(mc => mc.id === microId ? { ...mc, ...changes } : mc) } : x));
  const deleteMicrocycle = (mesoId, microId) => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: x.microcycles.filter(mc => mc.id !== microId) } : x));

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
    addMesocycle, updateMesocycle, deleteMesocycle,
    addMicrocycle, updateMicrocycle, deleteMicrocycle,
    addCustomCycle, updateCustomCycle, deleteCustomCycle,
    addQuickSession, editQuickSession, removeQuickSession,
    syncPlannedSessions,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
