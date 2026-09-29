import { useMemo } from "react";
import { AuthContext } from "./AuthContext.js";
import { useSupabaseSync } from "../hooks/useSupabaseSync.js";

export function AuthProvider({ children }) {
  const sync = useSupabaseSync();

  const value = useMemo(() => ({
    session: sync.session,
    setSession: sync.setSession,
    authChecked: sync.authChecked,
    syncStatus: sync.syncStatus,
    reportSync: sync.reportSync,
    fetchCloudHead: sync.fetchCloudHead,
    loadFromCloud: sync.loadFromCloud,
    writeGuarded: sync.writeGuarded,
    upsertRow: sync.upsertRow,
    saveToCloud: sync.saveToCloud,
    writeStatus: sync.writeStatus,
    subscribeToChanges: sync.subscribeToChanges,
  }), [
    sync.session,
    sync.setSession,
    sync.authChecked,
    sync.syncStatus,
    sync.reportSync,
    sync.fetchCloudHead,
    sync.loadFromCloud,
    sync.writeGuarded,
    sync.upsertRow,
    sync.saveToCloud,
    sync.writeStatus,
    sync.subscribeToChanges,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
