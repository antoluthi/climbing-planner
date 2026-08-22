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
    fetchCloudHead: sync.fetchCloudHead,
    loadFromCloud: sync.loadFromCloud,
    saveToCloud: sync.saveToCloud,
    uploadNow: sync.uploadNow,
    writeStatus: sync.writeStatus,
    subscribeToChanges: sync.subscribeToChanges,
    hasPendingSave: sync.hasPendingSave,
  }), [
    sync.session,
    sync.setSession,
    sync.authChecked,
    sync.syncStatus,
    sync.fetchCloudHead,
    sync.loadFromCloud,
    sync.saveToCloud,
    sync.uploadNow,
    sync.writeStatus,
    sync.subscribeToChanges,
    sync.hasPendingSave,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
