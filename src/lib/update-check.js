import { isNative } from "./native.js";

// ─── Détection de mise à jour (APK uniquement) ───────────────────────────────
// L'APK embarque ses fichiers web : un changement de code ne l'atteint qu'en
// installant un nouvel APK. Rien ne le signalerait sans ça — le web, lui, se
// met à jour tout seul au rechargement de la page.
//
// Source de vérité : le titre de la release `latest-apk`, écrit par la CI au
// format « Climbing Planner 1.0.<numéro de run> » (.github/workflows/build-apk.yml).
// L'API GitHub renvoie `Access-Control-Allow-Origin: *`, donc un fetch standard
// passe depuis la WebView (origine https://localhost) — pas besoin de plugin HTTP.
// Un fichier de version déposé en asset de release serait plus économe en quota,
// mais la redirection de téléchargement ne porte aucun en-tête CORS : inatteignable
// en fetch. D'où l'API, et un échec (quota atteint, hors-ligne) traité en silence.

const RELEASE_API =
  "https://api.github.com/repos/antoluthi/climbing-planner/releases/tags/latest-apk";

const APK_ASSET = "climbing-planner.apk";
const VERSION_IN_TITLE = /(\d+\.\d+\.(\d+))\s*$/;

export const RELEASE_PAGE =
  "https://github.com/antoluthi/climbing-planner/releases/tag/latest-apk";

// Renvoie { versionName, versionCode, url } si une version plus récente est
// publiée, sinon null. Ne lève jamais : hors-ligne, quota d'API atteint ou
// release absente se traduisent par « rien à signaler ».
export async function checkForUpdate() {
  // Sur le web il n'y a rien à installer ; en build local (__APP_VERSION_CODE__
  // à 0) la comparaison n'aurait aucun sens.
  if (!isNative || !__APP_VERSION_CODE__) return null;

  try {
    const res = await fetch(RELEASE_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const release = await res.json();

    const match = VERSION_IN_TITLE.exec(release?.name || "");
    if (!match) return null;

    const versionCode = Number(match[2]);
    if (!(versionCode > __APP_VERSION_CODE__)) return null;

    const asset = (release.assets || []).find(a => a.name === APK_ASSET);
    return {
      versionName: match[1],
      versionCode,
      url: asset?.browser_download_url || RELEASE_PAGE,
    };
  } catch {
    return null;
  }
}

// Une version refusée ne doit pas revenir à chaque démarrage — mais une version
// plus récente encore, si.
const DISMISS_KEY = "climbing_planner_update_dismissed";

export function isDismissed(versionCode) {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) >= versionCode;
  } catch {
    return false;
  }
}

export function dismissUpdate(versionCode) {
  try {
    localStorage.setItem(DISMISS_KEY, String(versionCode));
  } catch {
    /* stockage indisponible : le bandeau réapparaîtra, sans gravité */
  }
}
