# Garmin Connect Auto-Sync — Notes pour implémentation future

## Idée générale
Synchroniser automatiquement les données de sommeil Garmin sans export CSV manuel.
L'utilisateur saisit email + mot de passe Garmin → l'app récupère les données via Supabase Edge Function.

## Architecture
- **Supabase Edge Function** (Deno runtime) : `supabase/functions/garmin-sync/index.ts`
- Le frontend appelle la fonction avec `{ email, password, days }` en POST
- La fonction retourne `{ records: SleepRecord[] }`
- Les credentials ne sont jamais stockés (utilisés uniquement pour la session)

## Flux d'authentification Garmin Connect

### Étape 1 — Login SSO
1. GET `https://sso.garmin.com/sso/signin?service=...` → récupérer le token CSRF (`name="_csrf" value="..."`)
2. POST credentials + CSRF → recevoir un ticket SSO + cookies de session
3. Suivre les redirects (jusqu'à 6) pour collecter tous les cookies de session

**Important** : utiliser `headers.getSetCookie()` (Deno 1.37+) au lieu de `headers.get("set-cookie")` pour capturer TOUS les Set-Cookie headers (la méthode standard n'en retourne qu'un).

### Étape 2A — Approche cookies + AJAX headers (plus simple)
Ajouter ces headers aux requêtes API :
```
Accept: application/json, text/plain, */*
X-Requested-With: XMLHttpRequest
NK: NT
X-app-ver: 4.60.2.0
DI-Backend: connectapi.garmin.com
```
Endpoint profil : `https://connect.garmin.com/modern/proxy/userprofile-service/socialProfile`
Endpoint sommeil : `https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailySleepData/{displayName}?startDate=...&endDate=...`

**Problème rencontré** : Garmin renvoyait du HTML (200 OK) au lieu de JSON même avec les AJAX headers → session cookies insuffisants ou endpoint modifié.

### Étape 2B — OAuth1 → OAuth2 Bearer token (fallback)
1. OAuth1 preauthorized : GET `https://connectapi.garmin.com/oauth-service/oauth/preauthorized?oauth_callback=oob&accepts_tos=true`
   - Signer avec HMAC-SHA1 : `consumerKey + consumerSecret`
   - Consumer key/secret à récupérer (ex: depuis la lib Python `garth`)
2. OAuth2 exchange : POST `https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0`
   - Signer avec HMAC-SHA1 : `consumerKey + consumerSecret + oauth1Token + oauth1Secret`
3. Utiliser le Bearer token pour les API `connectapi.garmin.com`

**Problème rencontré** : OAuth1 preauthorized retournait 401. Possible que les consumer key/secret soient révoqués ou incorrects.

## Consumer Key/Secret
Ceux utilisés lors des tests (issus de la lib Python `garth`) :
- Key : `fc3e99d2-118c-44b8-914d-3f01d98a0e04`
- Secret : `E08WAR897WH6-610JD474-1JJ7344TJ8X`

Ces credentials peuvent changer. Voir https://github.com/matin/garth pour les valeurs à jour.

## Format de réponse attendu (API sleep)
```json
{
  "dailySleepDTO": {
    "calendarDate": "2026-03-08",
    "sleepTimeSeconds": 26640,
    "deepSleepSeconds": 6540,
    "lightSleepSeconds": 16560,
    "remSleepSeconds": 3600,
    "awakeSleepSeconds": 3300,
    "sleepScores": { "overall": { "value": 61 } }
  }
}
```
Ou un tableau pour plusieurs jours.

## Alternatives à explorer
- **Garmin Health API** : API officielle pour développeurs, nécessite une approbation Garmin
- **Lib Python `garth`** : fonctionne bien, pourrait tourner sur une Cloud Function Python
- **Zapier/Make** : automatisation no-code Garmin → Supabase
- **Fichier CSV** : solution actuelle, simple et fiable

## Commandes utiles
```bash
# Déployer la Edge Function
npx supabase functions deploy garmin-sync --project-ref zkoiykpiymvwioihnhhp

# Tester localement
npx supabase functions serve garmin-sync
```
