// ─── UN APPEL NATIF NE DOIT JAMAIS POUVOIR GELER L'APP ───────────────────────
// Une promesse **rejetée** se rattrape. Une promesse qui ne se termine jamais,
// non : elle laisse l'écran figé sans un mot. C'est ce qui arrivait quand le
// pont Capacitor ne répondait pas — bascule bloquée, diagnostic bloqué sur
// « … », widget jamais écrit.
//
// Toute traversée du pont passe donc par ici : au-delà du délai, on renvoie
// une erreur nommée, qui devient un message à l'écran.

export class TimeoutError extends Error {
  constructor(label, ms) {
    super(`${label} : aucune réponse après ${ms} ms`);
    this.name = "TimeoutError";
    this.label = label;
  }
}

export function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    }),
  ]);
}
