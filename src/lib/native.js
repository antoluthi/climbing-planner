import { Capacitor, SystemBars } from "@capacitor/core";
import supabase from "./supabase.js";

// ─── Contexte natif (APK Capacitor) ──────────────────────────────────────────
// Point unique pour tout ce qui diffère entre le web (Vercel) et la WebView
// Android : origine publique, deep link d'auth, bouton retour matériel,
// barres système.

export const isNative = Capacitor.isNativePlatform();

// Dans l'APK, window.location.origin vaut https://localhost — inutilisable
// pour toute URL destinée à l'extérieur (CalDAV, redirections d'auth email…).
export const PROD_ORIGIN = "https://climbing-planner-theta.vercel.app";
export const appOrigin = isNative ? PROD_ORIGIN : window.location.origin;

// Scheme déclaré dans AndroidManifest.xml (intent-filter VIEW).
// Doit aussi figurer dans l'allowlist Supabase (Auth > URL Configuration).
export const AUTH_CALLBACK_URL = "com.climbingplanner.app://auth-callback";

// ─── Pile de calques (modales / sheets) ──────────────────────────────────────
// Chaque overlay ouvert s'enregistre ici. Sert à deux choses :
//  - Échap ne ferme que le calque du dessus (pas toute la pile) ;
//  - le bouton retour Android ferme le calque du dessus avant de naviguer.

const layerStack = [];

export function pushLayer(close) {
  const entry = { close };
  layerStack.push(entry);
  return {
    remove() {
      const i = layerStack.indexOf(entry);
      if (i >= 0) layerStack.splice(i, 1);
    },
    isTop() {
      return layerStack[layerStack.length - 1] === entry;
    },
  };
}

export function closeTopLayer() {
  const top = layerStack[layerStack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

// Verrou de scroll du body pendant qu'une modale est ouverte (compteur pour
// gérer l'empilement).
let bodyLockCount = 0;
export function lockBodyScroll() {
  if (++bodyLockCount === 1) document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--bodyLockCount === 0) document.body.style.overflow = "";
  };
}

// ─── Bouton retour : handler racine (navigation entre vues) ──────────────────
// Enregistré par AutonomousShell. Retourne true si le retour a été consommé
// (ex. retour à l'accueil), false pour laisser l'app se minimiser.

let rootBackHandler = null;
export function setRootBackHandler(fn) {
  rootBackHandler = fn;
  return () => {
    if (rootBackHandler === fn) rootBackHandler = null;
  };
}

// ─── Barres système Android ──────────────────────────────────────────────────
// Style "DARK" = icônes claires (fond sombre), "LIGHT" = icônes sombres.
export function syncSystemBars(isDark) {
  if (!isNative) return;
  SystemBars.setStyle({ style: isDark ? "DARK" : "LIGHT" }).catch(() => {});
}

// ─── Callback d'auth (magic link / confirmation email) ───────────────────────
async function handleAuthUrl(url) {
  if (!supabase) return;
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token && refresh_token) {
    // onAuthStateChange (useSupabaseSync) propage la session à toute l'app.
    await supabase.auth.setSession({ access_token, refresh_token }).catch(() => {});
  }
}

// ─── Initialisation (appelée une fois depuis main.jsx) ───────────────────────
export async function initNativeApp() {
  if (!isNative) return;
  const { App } = await import("@capacitor/app");

  // Deep link : lien magique Supabase → com.climbingplanner.app://auth-callback#…
  App.addListener("appUrlOpen", ({ url }) => {
    if (url?.startsWith("com.climbingplanner.app://")) handleAuthUrl(url);
  });

  // Bouton / geste retour : modale ouverte > navigation racine > minimiser.
  App.addListener("backButton", () => {
    if (closeTopLayer()) return;
    if (rootBackHandler && rootBackHandler()) return;
    App.minimizeApp();
  });

  // Filet de sécurité supplémentaire : l'app passe en arrière-plan → un flush
  // de sauvegarde est déjà déclenché par visibilitychange (useSupabaseSync).
}
