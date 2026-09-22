// Point d'entrée « collection » : /api/caldav/:token (avec ou sans « / »).
// Le vrai gestionnaire vit dans ../_caldav-handler.js — voir l'en-tête de ce
// fichier pour la raison de ce découpage en deux routes.
export { default } from "../_caldav-handler.js";
