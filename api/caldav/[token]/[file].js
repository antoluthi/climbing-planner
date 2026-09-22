// Point d'entrée « membre » : /api/caldav/:token/:file (le .ics d'une séance,
// et diag.json).
//
// Pourquoi une route séparée alors que `[...path].js` est un catch-all : en
// production, ce catch-all ne matche **qu'un seul** segment. Deux segments
// n'atteignent jamais la fonction, Vercel répond sa propre page 404
// (« NOT_FOUND ») — donc l'URL .ics de chaque séance était morte, alors que
// PROPFIND Depth:1 les publiait consciencieusement. Vérifié en production sur
// les quatre formes de chemin.
//
// Deux segments dynamiques explicites, eux, marchent — c'est le seul mécanisme
// de routage que ce projet a pu vérifier. Le gestionnaire est le même : il
// reconstitue ses segments depuis `req.query` quelle que soit la route.
export { default } from "../../_caldav-handler.js";
