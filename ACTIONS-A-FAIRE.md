# Actions à faire de ton côté

**État au 20 août 2026** — vérifié en direct contre Supabase, Vercel et GitHub
Actions, pas déduit du code.

La version précédente de ce fichier (15 juillet) affirmait que rien n'était
mergé et qu'aucune migration n'était appliquée : c'est faux depuis le 16
juillet. Tout est passé. Ce qui suit est l'état réel.

---

## ✅ Déjà fait — ne rien refaire

| Action | Vérification |
|---|---|
| **Les 5 migrations Supabase** | Table `notifications` répond `200 []` (une table absente renvoie `PGRST205/404` — contrôle négatif effectué) · colonne `climbing_plans.is_public` présente · RPC `get_my_coaches` présente · bucket Storage `avatars` présent (`NoSuchKey`, pas `NoSuchBucket`) |
| **Redirect URL de l'APK dans Supabase Auth** | `/auth/v1/verify` avec `redirect_to=com.climbingplanner.app://auth-callback` renvoie un `303` **vers le scheme** ; une URL non autorisée retombe sur le site web. Le magic link fonctionne donc dans l'APK. |
| **Merge sur `master` + déploiement Vercel** | `master` = `b7eb14e` ; le bundle en production contient bien le dernier commit (anti-fuite de données entre comptes, flux « Créer un compte ») |
| **`SUPABASE_SERVICE_ROLE_KEY` sur Vercel** | `/api/calendar/<uuid>.ics` renvoie `404 Calendar not found`, pas le `503 Server misconfigured` du chemin « clé absente » → CalDAV/iCal opérationnels |
| **Secrets GitHub `VITE_SUPABASE_*`** | Le build APK #8 est en succès — le workflow échoue volontairement si les secrets manquent |
| **Vue publique** | Un profil est bien `is_public = true` et lisible en anonyme |

---

## 1 · Keystore de signature — la vraie action restante (~10 min, une fois)

**Pourquoi c'est le sujet n°1** : tu partages l'APK à d'autres personnes, et la
CI construit en `assembleDebug`. Le keystore de debug n'est pas versionné —
Gradle en régénère un sur le runner GitHub, donc **la signature peut changer
d'un build à l'autre**. Android refuse d'installer une mise à jour signée par
une autre clé : tes utilisateurs verront « application non installée » et
devront désinstaller l'app (donc se reconnecter) avant de réinstaller.

Sur ta machine :

```bash
keytool -genkeypair -v -keystore climbing-planner.jks \
  -alias climbing-planner -keyalg RSA -keysize 2048 -validity 10000
```

⚠️ **Garde le `.jks` et les mots de passe hors du repo, et sauvegarde-les.**
Keystore perdu = plus aucune mise à jour possible pour les gens qui ont déjà
installé l'app ; il faut leur faire désinstaller/réinstaller.

Puis **GitHub → Settings → Secrets and variables → Actions** :

```
ANDROID_KEYSTORE_BASE64   = sortie de `base64 -w0 climbing-planner.jks`
ANDROID_KEYSTORE_PASSWORD = <mot de passe du store>
ANDROID_KEY_ALIAS         = climbing-planner
ANDROID_KEY_PASSWORD      = <mot de passe de la clé>
```

Quand c'est fait, dis-le : le `signingConfig` dans `android/app/build.gradle` et
la bascule de la CI sur `assembleRelease` restent à câbler. En attendant, le
build debug marche — c'est la stabilité entre mises à jour qui n'est pas garantie.

---

## 2 · Test coach-athlète à deux comptes (~10 min)

Jamais validé de bout en bout, et le dernier commit a modifié le comportement au
premier login.

- [ ] **Coach** : Profil → Inviter un athlète → chercher → **Inviter** → l'état
      passe à « Invitation en attente… »
- [ ] **Athlète** : badge sur la cloche 🔔 → ouvrir → **Accepter**
- [ ] **Coach** : l'athlète apparaît dans « Mes athlètes » **sans recharger**
- [ ] **Coach** : « Voir » l'athlète → modifier ses cycles et ouvrir ta
      bibliothèque **pendant** la vue athlète
- [ ] **Coach** : modifier une séance → « Retour à ma vue » → l'athlète reçoit
      « … a mis à jour ton planning »
- [ ] **Athlète** : Profil → section « Mon coach » + bouton « Quitter »

**Le point le plus important** : créer un **nouveau compte par mot de passe**
depuis un navigateur qui a déjà servi à un autre compte. Il doit démarrer
**vierge** — sans hériter du nom, de l'avatar ni du planning du compte
précédent. C'est le bug corrigé par le dernier commit, jamais re-testé depuis.

---

## 3 · Décisions produit (sans urgence)

- **Nom de l'app** : « Climbing Planner » côté Android, « Planif » côté PWA.
  À unifier ?
- **Orientation** : le manifeste PWA impose `portrait`, l'APK tourne librement
  (aucun `screenOrientation` sur l'activité). Verrouiller ou assumer ?
- **Notifications push** : la cloche est purement in-app — rien ne s'affiche
  quand l'app est fermée. Du vrai push demanderait un projet Firebase +
  `google-services.json` + `@capacitor/push-notifications`.

---

## 4 · Comment mettre à jour l'app

**Le site web se met à jour tout seul.** Push sur `master` → Vercel redéploie →
tu recharges la page. Rien à faire.

**L'APK, non.** Il embarque ses propres fichiers web : un changement de code ne
l'atteint qu'en installant un nouvel APK. La CI en construit un à chaque push
sur `master` et met à jour la release. Sur le téléphone :

1. l'app affiche « Version X disponible » avec un bouton **Télécharger**
   (elle interroge la release au démarrage) ;
2. sinon, lien permanent :
   <https://github.com/antoluthi/climbing-planner/releases/tag/latest-apk>
3. ouvrir le fichier téléchargé → installer par-dessus.

⚠️ **Tant que le keystore de l'étape 1 n'existe pas**, l'étape 3 échoue
(« application non installée ») : chaque build CI est signé par une clé
différente. Il faut désinstaller l'app puis réinstaller, et te reconnecter. Tes
données sont dans Supabase, rien n'est perdu.

⚠️ **Au passage à la clé de release**, une **dernière** désinstallation sera
nécessaire — pour toi et pour les personnes ayant déjà l'app. Ensuite les mises
à jour s'installent par-dessus, normalement.

Les personnes qui installent doivent autoriser les « sources inconnues » sur
leur téléphone. La version installée est affichée **en bas de l'onglet Profil** —
demande-la quand quelqu'un te remonte un bug.

Les builds de branches de travail ne remplacent **pas** la release : ils sont
téléchargeables depuis la page du run GitHub Actions correspondant.

**En local** (téléphone branché ou émulateur) :

```bash
./run-android.sh    # one-shot : build + install + lancement
# ou : npm run cap:sync puis npm run cap:open (Android Studio)
```

⚠️ `.env.local` doit exister **avant** le build : la clé Supabase est intégrée
au bundle, sinon l'app démarre muette en mode hors-ligne.

---

## 5 · Automatique — juste à savoir

- **Migration des données v5 (charge 0-10)** : se fait seule au premier
  chargement sur chaque appareil.
- **Entrées Hooper partielles** : nettoyées automatiquement.
- **versionCode / versionName** : dérivés du numéro de run GitHub (`1.0.<run>`),
  plus rien à incrémenter à la main.
