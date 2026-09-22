// Route « membre » : le .ics d'une séance, et diag.json.
//
// Publiquement, un membre vit **sous la collection** — WebDAV l'exige :
//   /api/caldav/<jeton>/<uid>.ics
// `vercel.json` réécrit cette URL vers ici. Pourquoi ce détour par un autre
// préfixe, plutôt que `api/caldav/[token]/[file].js` : Vercel refuse le dépôt
// entier si deux fichiers produisent le même segment de chemin, et
// `caldav/[token]/` entre en conflit avec `caldav/[...path].js` —
//
//   Error: Two or more files have conflicting paths or names.
//   The path "api/caldav/[token]/[file].js" has conflicts with
//   "api/caldav/[...path].js".
//
// Le conflit est une contrainte de nommage, pas de routage : sous `dav/`, les
// deux segments dynamiques ne gênent plus personne.
export { default } from "../../_caldav-handler.js";
