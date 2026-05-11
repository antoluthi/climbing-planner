// ─── TOAST STORE ─────────────────────────────────────────────────────────────
// Module-level emitter pour des toasts global, observable via subscribe.
// Format: { id, kind: "success"|"info"|"error", message, undo, duration }

let nextId = 1;
const toasts = [];
const listeners = new Set();

function emit() {
  listeners.forEach(fn => fn([...toasts]));
}

function subscribe(fn) {
  listeners.add(fn);
  fn([...toasts]);
  return () => listeners.delete(fn);
}

function dismiss(id) {
  const idx = toasts.findIndex(t => t.id === id);
  if (idx >= 0) {
    toasts.splice(idx, 1);
    emit();
  }
}

function push({ kind = "info", message, undo, duration }) {
  const id = nextId++;
  const t = { id, kind, message, undo, duration: duration ?? (undo ? 6000 : 4000) };
  toasts.push(t);
  // Limit à 3 visibles : ne fait pas la queue, juste retire les plus anciens
  while (toasts.length > 3) toasts.shift();
  emit();
  setTimeout(() => dismiss(id), t.duration);
  return id;
}

export const toast = {
  success: (message, opts = {}) => push({ kind: "success", message, ...opts }),
  info:    (message, opts = {}) => push({ kind: "info",    message, ...opts }),
  error:   (message, opts = {}) => push({ kind: "error",   message, ...opts }),
  dismiss,
  subscribe,
};
