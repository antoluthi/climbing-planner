import { useRef } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";

export function SyncButtons({ data, onImport, compact, syncStatus, session, onUpload, onPull }) {
  const { styles } = useThemeCtx();
  const importRef = useRef(null);

  const handleExport = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planif-escalade-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.weeks !== undefined && parsed.weekMeta !== undefined) {
          onImport(parsed);
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const btnStyle = compact ? styles.syncBtnCompact : styles.syncBtn;

  const syncIcon = syncStatus === "saving" ? "⟳"
    : syncStatus === "saved" ? "✓"
    : syncStatus === "offline" ? "—"
    : null;
  const syncColor = syncStatus === "saved" ? "#c8906a"
    : syncStatus === "offline" ? "#f97316"
    : "#555";

  return (
    <div style={styles.syncBtns}>
      {syncIcon && (
        <span style={{ ...styles.syncDot, color: syncColor }} title={
          syncStatus === "saving" ? "Synchronisation…"
          : syncStatus === "saved" ? "Synchronisé"
          : "Hors ligne — données sauvées localement"
        }>{syncIcon}</span>
      )}
      {session && onUpload && (
        <button style={{ ...btnStyle, color: "#c8906a" }} onClick={onUpload} title="Envoyer mes données vers le cloud (écraser)">
          ↑
        </button>
      )}
      {session && onPull && (
        <button style={{ ...btnStyle, color: "#60a5fa" }} onClick={onPull} title="Charger les données depuis le cloud (écraser local)">
          ↓
        </button>
      )}
      {!compact && (
        <>
          <button style={btnStyle} onClick={handleExport} title="Exporter en JSON">↓ Export</button>
          <button style={btnStyle} onClick={() => importRef.current?.click()} title="Importer un JSON">↑ Import</button>
        </>
      )}
      <input
        ref={importRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleImport}
      />
    </div>
  );
}
