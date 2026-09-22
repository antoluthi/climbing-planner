// Route « collection » : /api/caldav/:token (avec ou sans barre oblique finale).
//
// Malgré son nom, ce catch-all ne matche **qu'un seul** segment en production —
// deux segments n'atteignent jamais la fonction, Vercel répond sa propre page
// 404 (« NOT_FOUND »). Les membres passent donc par `api/dav/[token]/[file].js`,
// via une réécriture de `vercel.json`. Voir l'en-tête de `../_caldav-handler.js`.
export { default } from "../_caldav-handler.js";
