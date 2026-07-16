import { useState, useEffect, useRef } from "react";
import { DataContext } from "./DataContext.js";
import { useAuth } from "./AuthContext.js";
import supabase from "../lib/supabase.js";
import { DEFAULT_MESOCYCLES } from "../lib/constants.js";
import { getMondayOf, weekKey } from "../lib/helpers.js";
import { generateId, loadData, saveData, migrateData, freshData, getLocalDataOwner, setLocalDataOwner } from "../lib/storage.js";
import { useCommunitySessionsSync } from "../hooks/useCommunitySessionsSync.js";
import { useSessionsCatalog } from "../hooks/useSessionsCatalog.js";
import { useSessionBlocks } from "../hooks/useSessionBlocks.js";
import { useCoachAthletes } from "../hooks/useCoachAthletes.js";
import { useNotifications } from "../hooks/useNotifications.js";

export function DataProvider({ children }) {
  const {
    session, syncStatus, loadFromCloud, saveToCloud,
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
  const { catalog, saveUserSession, deleteUserSession } = useSessionsCatalog(session?.user?.id);
  const { blocks: dbBlocks, saveBlock, deleteBlock } = useSessionBlocks(session?.user?.id);
  const { athletes, searchAthletes, removeAthlete, myCoaches, leaveCoach, refreshAthletes, refreshMyCoaches } = useCoachAthletes(session?.user?.id);
  const {
    notifications, sentInvites, unreadCount,
    markInfosRead, sendCoachRequest, respondCoachRequest, notifyPlanUpdate,
    refreshNotifications,
  } = useNotifications(session?.user?.id);

  // ── Cloud load on first login ──
  // Le rôle est résolu ICI, depuis la même requête que les données : plus de
  // SELECT status séparé qui pouvait perdre la course contre le uploadNow de
  // création de ligne (et sauter silencieusement le choix du rôle).
  useEffect(() => {
    if (!session || cloudLoaded) return;
    loadFromCloud()
      .then(cloudData => {
        setCloudLoaded(true);
        if (cloudData) {
          const { _cloudUpdatedAt: _cua, _status, ...cleanData } = cloudData;
          if (_status == null) {
            // Ligne existante mais status NULL : jamais choisi.
            setAccountRole(null);
            setNeedsRoleChoice(true);
          } else {
            setAccountRole(_status === "solo" ? null : _status);
            setNeedsRoleChoice(false);
          }
          setRoleResolved(true);
          const migrated = migrateData(cleanData);
          isCloudSetRef.current = true;
          setData(migrated);
          saveData(migrated);
          setLocalDataOwner(session.user.id);
        } else {
          // Nouveau compte : pas encore de ligne → choix du rôle requis.
          setAccountRole(null);
          setNeedsRoleChoice(true);
          setRoleResolved(true);
          // Garde anti-fuite : le localStorage est partagé par NAVIGATEUR.
          // On ne pousse les données locales vers le cloud du nouveau compte
          // que si elles n'appartiennent à personne d'autre (usage solo
          // hors-ligne qui crée son compte). Sinon — un autre compte s'est
          // déjà connecté sur ce navigateur — le nouveau compte démarre
          // vierge, au lieu d'hériter du profil/planning du précédent.
          const owner = getLocalDataOwner();
          if (owner && owner !== session.user.id) {
            const blank = migrateData(freshData());
            isCloudSetRef.current = true;
            setData(blank);
            saveData(blank);
            uploadNow(blank, session.user.id);
          } else {
            uploadNow(data, session.user.id);
          }
          setLocalDataOwner(session.user.id);
        }
      })
      .catch(() => {});
  }, [session, cloudLoaded, loadFromCloud, uploadNow]); // eslint-disable-line

  // ── Realtime sync ──
  useEffect(() => {
    if (!session?.user?.id || !cloudLoaded) return;
    const unsubscribe = subscribeToChanges(session.user.id, async () => {
      if (hasPendingSave()) return;
      try {
        const cloudData = await loadFromCloud();
        if (cloudData) {
          const { _cloudUpdatedAt: _cua, _status, ...cleanData } = cloudData;
          void _status;
          const migrated = migrateData(cleanData);
          isCloudSetRef.current = true;
          setData(migrated);
          saveData(migrated);
        }
      } catch { /* ignore */ }
    });
    return unsubscribe;
  }, [session?.user?.id, cloudLoaded]); // eslint-disable-line

  // ── Reset à la déconnexion ──
  useEffect(() => {
    if (!session) {
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
  useEffect(() => {
    if (isCloudSetRef.current) {
      isCloudSetRef.current = false;
      return;
    }
    if (viewingAthlete) {
      saveToCloud(data, viewingAthlete.userId);
    } else {
      saveData(data);
      saveToCloud(data, session?.user?.id);
    }
  }, [data]); // eslint-disable-line

  const pullFromCloud = async () => {
    const cloudData = await loadFromCloud();
    if (cloudData) {
      // Même traitement que les autres chemins de chargement : on retire le
      // champ technique _cloudUpdatedAt, on migre, et on ne redéclenche pas
      // l'auto-save (sinon le pull resauvegarde aussitôt vers le cloud).
      const { _cloudUpdatedAt: _cua, _status, ...cleanData } = cloudData;
      void _status;
      const migrated = migrateData(cleanData);
      isCloudSetRef.current = true;
      setData(migrated);
      saveData(migrated);
    }
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
  const addMesocycle = () => updateMesocycles(m => [...m, { id: generateId(), label: "Nouveau mésocycle", color: "#e0a875", durationWeeks: 4, startDate: "", description: "", microcycles: [] }]);
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

  // ── Sync planned sessions/blocks ──
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

  const syncPlannedBlocks = (updatedBlock) => {
    if (!updatedBlock?.id) return;
    const todayKey = weekKey(getMondayOf(new Date()));
    setData(d => {
      let changed = false;
      const newWeeks = Object.fromEntries(
        Object.entries(d.weeks).map(([key, weekData]) => {
          if (key < todayKey || !Array.isArray(weekData)) return [key, weekData];
          const newWeek = weekData.map(dayArr =>
            Array.isArray(dayArr)
              ? dayArr.map(s => {
                  if (s.id === updatedBlock.id && s.isBlock) {
                    changed = true;
                    return { ...updatedBlock, isBlock: true, feedback: s.feedback, startTime: s.startTime, endTime: s.endTime, coachNote: s.coachNote, date: s.date };
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

  // ── Session block CRUD wrappers ──
  const addSessionBlock = b => saveBlock(b);
  const editSessionBlock = async (b) => {
    await saveBlock(b);
    const affectedSessions = catalog.filter(s => s.blocks?.some(bl => bl.id === b.id));
    for (const sess of affectedSessions) {
      const updatedBlocks = sess.blocks.map(bl => bl.id === b.id ? { ...bl, ...b } : bl);
      const updatedSession = { ...sess, blocks: updatedBlocks };
      saveUserSession(updatedSession);
      syncPlannedSessions(updatedSession);
    }
    syncPlannedBlocks(b);
  };
  const deleteSessionBlock = id => deleteBlock(id);

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
    dbBlocks, saveBlock, deleteBlock,
    communitySessions, pushToCommunity, deleteFromCommunity,
    athletes, searchAthletes, removeAthlete, myCoaches, leaveCoach, refreshAthletes, refreshMyCoaches,
    notifications, sentInvites, unreadCount,
    markInfosRead, sendCoachRequest, respondCoachRequest, refreshNotifications,
    addMesocycle, updateMesocycle, deleteMesocycle,
    addMicrocycle, updateMicrocycle, deleteMicrocycle,
    addCustomCycle, updateCustomCycle, deleteCustomCycle,
    addQuickSession, editQuickSession, removeQuickSession,
    syncPlannedSessions, syncPlannedBlocks,
    addSessionBlock, editSessionBlock, deleteSessionBlock,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
