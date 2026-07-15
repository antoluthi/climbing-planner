# ✅ Actions à faire de ton côté

État au 15 juillet 2026. Tout le code des deux dernières semaines vit sur la
branche **`claude/apk-application-audit-4klr69`** (correctifs APK, charge
unifiée 0-10, rôles robustes, invitations coach-athlète + cloche de
notifications). Rien n'est encore mergé sur `master`, et **aucune migration
Supabase récente n'est appliquée**. Voici tout ce qui t'attend, dans l'ordre.

---

## 1 · Migrations Supabase (~10 min) — À FAIRE EN PREMIER

Dans **Supabase Dashboard → SQL Editor**, colle et exécute chaque fichier de
`supabase/migrations/` **dans cet ordre**. Tous les scripts sont idempotents :
les relancer ne casse rien, même si une partie était déjà passée.

| Ordre | Fichier | Ce que ça active | Sans elle |
|---|---|---|---|
| 1 | `20260331_realtime_climbing_plans.sql` | Sync temps réel entre appareils/onglets | Risque d'écrasements de données entre ton téléphone et ton PC |
| 2 | `20260512_avatars_bucket.sql` | Bucket Storage `avatars` (photos de profil) | Upload d'avatar échoue silencieusement |
| 3 | `20260513_shared_sessions_catalog.sql` | Bibliothèque de séances commune | Chacun ne voit que ses propres séances de catalogue |
| 4 | `20260517_public_profiles.sql` | Colonne `is_public` + plannings publics | Le bouton « Voir un planning public » de l'écran de connexion renvoie une erreur |
| 5 | `20260715_notifications_coach_invites.sql` | **Cloche 🔔, invitations coach-athlète, RPC get_my_coaches** | Les invitations affichent une erreur ; **plus aucun moyen d'ajouter un athlète** (l'ancien ajout direct a été retiré, et c'était une faille : n'importe qui pouvait s'auto-déclarer coach de n'importe qui) |

**Vérification rapide après coup** (SQL Editor) :
```sql
select count(*) from notifications;                          -- doit répondre 0 (pas d'erreur)
select * from pg_policies where tablename = 'coach_athletes'; -- 3 policies : accepts/read/delete
select * from get_my_coaches();                               -- doit répondre (vide)
```

> ⚠️ La migration 5 change les règles `coach_athletes` : les liens
> coach-athlète **existants sont conservés**, mais tout nouveau lien passe
> obligatoirement par invitation + acceptation de l'athlète.

---

## 2 · Supabase Auth — redirect APK (2 min)

**Dashboard → Authentication → URL Configuration → Redirect URLs**, ajouter :

```
com.climbingplanner.app://auth-callback
```

Sans ça, le **magic link ne fonctionne pas dans l'APK Android** (le lien
retomberait sur le site web au lieu d'ouvrir l'app). Le login par mot de passe
marche dans tous les cas.

---

## 3 · Merger la branche sur `master` (déploiement Vercel auto)

La branche `claude/apk-application-audit-4klr69` contient ~6 gros commits :

1. `AUDIT-APK.md` + merge de la branche APK (`apk-app-branch-on2lag`)
2. Correctifs audit APK (deep link auth, bouton retour Android, service worker,
   flush de sauvegarde, Hooper partiel, steppers poids, modales, polices
   auto-hébergées, code-splitting…)
3. Icônes launcher + splash Android aux couleurs de l'app
4. **Charge unifiée 0-10** (toutes disciplines, slider de feedback pré-rempli,
   migration automatique des données v5)
5. **Rôles robustes + invitations par consentement + cloche de notifications**

À faire : ouvrir une PR `claude/apk-application-audit-4klr69 → master` (ou
merger directement). **Applique les migrations (étape 1) avant ou juste après
le merge** — l'app tolère leur absence avec des messages d'erreur propres,
mais les invitations coach et la cloche ne marcheront pas sans la n°5.

> Note : cette branche inclut le contenu de `claude/apk-app-branch-on2lag`
> (ta branche APK d'origine) — plus besoin de la merger séparément.

---

## 4 · Vercel — variable d'environnement (si pas déjà fait)

**Vercel Dashboard → Settings → Environment Variables** :

```
SUPABASE_SERVICE_ROLE_KEY = <service role key Supabase>
```

Uniquement nécessaire pour les endpoints calendrier `/api/caldav/*` et
`/api/calendar/*` (sync CalDAV/iCal). Sans elle ils répondent 503 — le reste
de l'app n'est pas affecté.

---

## 5 · Test à deux comptes (10 min, après merge + migrations)

Le flux coach-athlète n'a pas pu être testé de bout en bout (il faut deux
vrais comptes). Checklist :

- [ ] **Compte coach** : Profil → « Inviter un athlète » → chercher → **Inviter**
      → l'état passe à « Invitation en attente… »
- [ ] **Compte athlète** : la cloche 🔔 affiche un badge → ouvrir → « X souhaite
      devenir ton coach » → **Accepter**
- [ ] **Coach** : notification « Y a accepté ton invitation », Y apparaît dans
      « Mes athlètes » (temps réel, sans recharger)
- [ ] **Coach** : « Voir » l'athlète → vérifier que tu peux **modifier ses
      cycles** et ouvrir **ta bibliothèque** pendant la vue athlète (c'était le
      bug n°1, corrigé)
- [ ] **Coach** : modifier une séance de l'athlète → « Retour à ma vue » →
      **l'athlète reçoit** « X a mis à jour ton planning — semaine du … »
- [ ] **Athlète** : Profil → section « Mon coach » visible, bouton « Quitter »
- [ ] Se déconnecter/reconnecter sur chaque compte : pas de re-demande de rôle

**À savoir** : les comptes existants qui étaient « athlète solo » (statut NULL
en base) reverront **une fois** l'écran de choix de rôle — c'est voulu, le
choix est maintenant stocké explicitement (`'solo'`) pour fiabiliser
l'onboarding.

---

## 6 · Build APK Android (quand tu veux tester sur téléphone)

```bash
# ⚠️ .env.local doit exister AVANT le build (la clé Supabase est intégrée au bundle)
npm install
npm run cap:sync    # build web (sans service worker) + sync android/
npm run cap:open    # ouvre Android Studio → Run sur ton téléphone
```

À vérifier sur l'appareil : icône calendrier verte + splash sombre, bouton
retour (ferme les modales, ne quitte plus l'app), magic link (après l'étape 2),
barres système qui suivent le thème.

**Plus tard, pour distribuer** : configurer la signature release dans Android
Studio (Build → Generate Signed App Bundle/APK) — garde précieusement le
keystore. `versionCode`/`versionName` dans `android/app/build.gradle`.

---

## 7 · Automatique — rien à faire, juste à savoir

- **Migration des données v5 (charge 0-10)** : se fait toute seule au premier
  chargement sur chaque appareil (anciennes charges escalade ÷ 4,8, feedbacks
  « charge adaptée » convertis en ressenti). Le catalogue coach en base est
  normalisé à la volée à l'affichage.
- **Entrées Hooper partielles** existantes : nettoyées automatiquement
  (exclues des stats tant que les 4 critères ne sont pas remplis).
- `CLAUDE.md` documente tout (système de charge, rôles, notifications) — mets
  à jour les statuts ⏳/✅ de la table des migrations quand tu les as passées.
