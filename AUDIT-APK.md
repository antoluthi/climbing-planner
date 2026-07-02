# Audit — Application APK (Capacitor Android)

**Branche auditée** : `claude/apk-app-branch-on2lag` (26 juin 2026, 14 commits devant `master`)
**Contenu de la branche** : refactor en shells/providers (Phases 1–6), ajout Capacitor 8 + projet `android/`, auto-save des inputs inline, primitives de modales `ui/Modal` + `ui/Field`.
**Verdict global** : le build web passe, le refactor React est propre et sans perte fonctionnelle détectée. En revanche, **l'enrobage natif est un `cap add android` brut, sans aucune intégration Capacitor côté JS** (zéro import `@capacitor/*` dans `src/`). Trois points bloquants empêchent une distribution en l'état.

---

## Sprint 1 — Bloquants (l'APK n'est pas utilisable sans ça)

### 1.1 — Connexion par magic link cassée dans l'APK
- **Où** : `src/components/AuthPanel.jsx:37`, `android/app/src/main/AndroidManifest.xml`
- **Problème** : `signInWithOtp({ options: { emailRedirectTo: window.location.origin } })`. Dans l'APK, l'origine est `https://localhost` → le lien reçu par email redirige vers `https://localhost` dans le navigateur du téléphone : impasse totale. Le manifest n'a **aucun intent-filter deep link** (le `custom_url_scheme` de `strings.xml` n'est pas câblé), et il n'y a pas de listener `appUrlOpen`.
- **Impact** : un utilisateur APK sans mot de passe ne peut pas se connecter. L'inscription par email de confirmation a le même problème.
- **Plan** :
  1. Installer `@capacitor/app`.
  2. Ajouter un intent-filter `VIEW` pour le scheme `com.climbingplanner.app` dans le manifest.
  3. En natif, passer `emailRedirectTo: "com.climbingplanner.app://auth-callback"` et écouter `App.addListener("appUrlOpen", …)` pour extraire les tokens (`supabase.auth.setSession`).
  4. Ajouter ce redirect à l'allowlist Supabase (Auth > URL Configuration).
  5. En attendant : mettre en avant la connexion par mot de passe dans l'APK.

### 1.2 — Le bouton retour Android quitte l'application
- **Où** : aucun code ne le gère (aucun usage de l'API history dans `src/`, pas de plugin `@capacitor/app`)
- **Problème** : la SPA ne pousse jamais d'entrée d'historique ; le comportement Capacitor par défaut ferme/minimise l'activité. Chaque retour (geste ou bouton) sort de l'app — y compris quand une modale est ouverte ou depuis n'importe quelle vue.
- **Plan** : listener `backButton` de `@capacitor/app` : fermer la modale ouverte si présente, sinon revenir à `viewMode: "accueil"`, sinon `App.minimizeApp()`. Nécessite d'exposer un petit registre "modale ouverte / vue courante" (l'état vit déjà dans `AutonomousShell`).

### 1.3 — URL CalDAV affichée : `https://localhost/api/caldav/…`
- **Où** : `src/components/CalendarSyncSection.jsx:9`
- **Problème** : l'URL est construite avec `window.location.origin`. Dans l'APK l'utilisateur copiera une URL localhost inutilisable dans son appli calendrier. Plus largement, tout endpoint `/api/*` (fonctions serverless Vercel) n'existe pas dans l'APK.
- **Plan** : constante `PROD_ORIGIN = "https://climbing-planner-theta.vercel.app"` utilisée quand `Capacitor.isNativePlatform()` (ou systématiquement pour les URL destinées à des apps externes).

---

## Sprint 2 — Risques de données et de comportement

### 2.1 — Service worker PWA embarqué dans l'APK
- **Où** : `vite.config.js` (vite-plugin-pwa), `dist/registerSW.js` injecté dans `index.html`
- **Problème** : le SW s'enregistre aussi dans la WebView Capacitor. Il précache ~4 Mo servis localement (inutile), et sa stratégie `NetworkFirst` avec timeout 5 s s'applique à la navigation locale. Risque classique : après mise à jour de l'APK, l'ancien SW sert des assets périmés jusqu'à activation du nouveau ; comportements de démarrage difficiles à déboguer.
- **Plan** : désactiver le plugin PWA pour le build natif — ex. `VitePWA({ disable: process.env.CAP_BUILD === "1", … })` et script `"cap:sync": "CAP_BUILD=1 vite build && npx cap sync android"`.

### 2.2 — Perte des dernières modifications quand l'app est tuée
- **Où** : `src/hooks/useSupabaseSync.js:69` (flush uniquement sur `pagehide`)
- **Problème** : la sauvegarde cloud est débouncée à 1,5 s et le filet de sécurité est l'événement `pagehide`. Dans une WebView Android, `pagehide` ne se déclenche pas de façon fiable quand l'utilisateur passe l'app en arrière-plan puis la tue (swipe dans les récents). Les édits des dernières secondes sont perdus.
- **Plan** : flush aussi sur `visibilitychange === "hidden"` (fonctionne web + WebView), et idéalement sur l'événement `pause` de `@capacitor/app` une fois le plugin installé (synergie avec 1.1/1.2).

### 2.3 — Hooper partiel enregistré comme entrée réelle → stats faussées
- **Où** : `src/components/DayLogModal.jsx` (flushHooper), `src/components/HooperSection.jsx` (autoSaveHooper) — commit `452454d`
- **Problème** : depuis "save on every criterion change", un seul critère cliqué (ex. fatigue = 3) crée une entrée `{ total: 3 }` dans `data.hooper`. L'indice Hooper va de 4 à 28 (plus bas = meilleure forme) : une entrée partielle abandonnée ressemble à une forme exceptionnelle. Le label "(partiel)" n'existe que dans le formulaire ; la donnée persistée n'a **aucun flag partiel** et alimente Dashboard, ActivityHeatmap, `getDayLogWarning` et la phrase d'accueil.
- **Plan** : au choix —
  - a) persister les 4 critères mais `total: null` tant que tout n'est pas rempli, et filtrer `total == null` dans les graphes/heatmap/warnings ; ou
  - b) ajouter `partial: true` et l'exclure des agrégats.
  - Dans les deux cas, prévoir un nettoyage des entrées partielles déjà créées (migration dans `migrateData`).

### 2.4 — Steppers de poids : enregistrement de valeurs absurdes
- **Où** : `src/components/AccueilView.jsx:1301-1336`, `src/components/DayLogModal.jsx` (steppers) — commit `f43fc8a`
- **Problème** :
  - AccueilView, bouton "−" sans historique de poids : `cur = 0` → `next = 0` → `onSaveWeight(today, 0)` → **0 kg enregistré** (le "+" enregistre 0,1 kg).
  - DayLogModal : le "−" a une garde `next > 0` mais le "+" depuis un champ vide enregistre 0,1 kg.
  - Avant l'auto-save, le bouton "Enregistrer" validait la saisie ; maintenant un tap parasite écrit directement dans `data.weight` et pollue le graphique de poids.
- **Plan** : ne pas sauvegarder depuis les steppers quand le champ de départ est vide (ou garde de plausibilité, ex. `val >= 20`), harmoniser les deux composants.

---

## Sprint 3 — UX / cohérence visuelle

### 3.1 — Icône et splash screen = branding Capacitor par défaut
- **Où** : `android/app/src/main/res/**` (mipmap + drawable)
- **Problème** : l'APK s'installe avec le logo bleu Capacitor générique, et le splash est ce même logo sur fond **blanc** alors que `capacitor.config.json` déclare un fond `#1a1410` → flash blanc au lancement d'une app sombre.
- **Plan** : générer icônes + splash depuis le logo hexagone avec `@capacitor/assets` (`npx capacitor-assets generate --android`), fond `#1a1410`.

### 3.2 — Formulaires fermables sans confirmation (perte de saisie)
- **Où** : `CustomCycleModal`, `DeadlineModal`, `SessionScheduleModal`, `TemplateEditorModal` (commits `0607885`, `ac7a570`)
- **Problème** : la migration vers `ui/Modal` a **ajouté** Esc + clic-backdrop à des modales qui ne les avaient pas, sans brancher `useConfirmClose`. Un tap à côté de la modale (fréquent sur mobile) jette silencieusement la saisie — particulièrement douloureux dans l'éditeur de templates coach. Les gros formulaires (BlockFormModal, CustomSessionModal, QuickSessionModal, ReminderModal, SessionComposer) sont, eux, correctement protégés.
- **Plan** : brancher `useConfirmClose` sur ces 4 modales (le hook existe déjà), ou `dismissOnBackdrop={false}` pour les formulaires.

### 3.3 — Échap avec modales empilées + scroll d'arrière-plan
- **Où** : `src/components/ui/Modal.jsx`
- **Problème** : chaque `Modal` pose son propre listener `keydown` sur `window`. Avec une ConfirmModal au-dessus d'un formulaire, un seul Échap déclenche les deux handlers (le résultat dépend de l'ordre d'enregistrement). Par ailleurs aucune modale ne verrouille le scroll du `body` : sur mobile, l'arrière-plan défile sous la modale.
- **Plan** : gestionnaire d'Échap "top-of-stack only" (pile de modales partagée ou `stopImmediatePropagation`), et `document.body.style.overflow = "hidden"` pendant qu'une modale est montée.

### 3.4 — Polices chargées depuis Google Fonts (réseau)
- **Où** : `index.html` (Inter + Newsreader), `CoachShell.jsx` / `AthleteShell.jsx` (Cormorant Garamond)
- **Problème** : hors-ligne (salle, falaise) l'APK retombe sur les polices système — toute l'identité typographique disparaît. Le `runtimeCaching` PWA ne cache pas non plus fonts.googleapis.com, donc le problème existe aussi en PWA. Bonus : les stubs Coach/Athlète référencent **Cormorant Garamond qui n'est plus chargée du tout** (fallback Georgia silencieux).
- **Plan** : auto-héberger Inter + Newsreader (`@fontsource/*`), supprimer les `<link>` Google Fonts ; corriger ou supprimer la référence Cormorant.

### 3.5 — Barres système Android (statut / navigation)
- **Où** : `capacitor.config.json`, thème de l'app
- **Problème** : Capacitor 8 gère l'edge-to-edge (padding automatique, insets clavier — vérifié dans `SystemBars.java`), mais la bande sous la barre de statut prend la couleur `backgroundColor: "#1a1410"` **fixe** : en thème clair, bandeau sombre incohérent. Le style des icônes de statut suit le thème *système*, pas le toggle jour/nuit de l'app → risque d'icônes illisibles.
- **Plan** : à la bascule de thème, appeler le plugin SystemBars (`setStyle`) et/ou ajuster `backgroundColor` ; à tester sur device réel (Android 12 / 15).

### 3.6 — Divers UI
- `Toggle` (`ui/Field.jsx`) : le libellé affiché dans un `<label>` n'est pas cliquable (le `onClick` n'est que sur le div du switch) alors que le curseur pointer suggère le contraire.
- Pas de `screenOrientation` sur l'activité : l'APK tourne en paysage alors que le manifest PWA impose `portrait` — trancher (verrouiller portrait ou assumer le paysage).
- Nom de l'app : "Climbing Planner" partout côté Android, "Planif" côté PWA — unifier.

---

## Sprint 4 — Dette technique / préparation release (non bloquant)

| # | Sujet | Détail |
|---|---|---|
| 4.1 | **Release Android non configurée** | `minifyEnabled false`, aucun signingConfig release, `versionCode 1` en dur. À traiter avant tout envoi Play Store / distribution APK signée. |
| 4.2 | **Bundle JS 1 Mo** | Pas de code-splitting ; Recharts dans le bundle principal. Démarrage WebView plus lent — le backlog `manualChunks` / `React.lazy` de CLAUDE.md devient plus rentable en natif. |
| 4.3 | **Test instrumenté cassé** | `ExampleInstrumentedTest` attend `"com.getcapacitor.app"` au lieu de `com.climbingplanner.app` — échouera si un jour la CI Android tourne. |
| 4.4 | **`@capacitor/cli` en `dependencies`** | Devrait être en `devDependencies`. |
| 4.5 | **Variables d'env au build APK** | L'anon key Supabase est bakée au `vite build` : sans `.env.local` sur la machine qui builde l'APK, `supabase = null` et l'app démarre silencieusement en mode hors-ligne. Documenter dans le README / vérifier au build. |
| 4.6 | **Code mort dans AutonomousShell** | `metaEditing` / `tempMeta` / `saveMeta` inutilisés, bloc `{false && <NewSessionSheet/>}` (hérités de master). Lint global : 158 erreurs, mais master en a 166 — la branche améliore légèrement, dette préexistante. |
| 4.7 | **`pullFromCloud`** (`DataProvider.jsx:145`) | Contrairement aux deux autres chemins de chargement, ne passe ni par `migrateData`, ni ne strip `_cloudUpdatedAt`, ni ne pose `isCloudSetRef` → un pull manuel resauvegarde aussitôt vers le cloud et peut réinjecter `_cloudUpdatedAt` dans `data`. (Préexistant sur master, à corriger au passage.) |
| 4.8 | **Dossiers parasites hérités de master** | `Climbing Planner/push_to_repo/` (828 Ko de copie du src) et `mascot/` sont commités — à nettoyer côté master. |

---

## Ce qui est sain (vérifié)

- **Refactor Phases 1–5** : diff complet monolithe → `AutonomousShell` + providers relu ; aucune perte fonctionnelle détectée (vue athlète, `switchToAthlete` + retour vue semaine, pickers avec `autoFocus`, suggestions de déplacement, realtime sync — tout est conservé).
- **RoleRouter** : coach/athlète passent par `AutonomousShell` comme sur master ; les stubs `CoachShell`/`AthleteShell` sont volontairement non routés (code en construction, sans effet).
- **RoleOnboardingModal** : exige désormais un choix explicite de rôle (amélioration).
- **`useConfirmClose`** : bon pattern, correctement branché sur les gros formulaires.
- **Edge-to-edge Android 15** : géré nativement par Capacitor 8 (padding automatique + insets clavier), pas de `viewport-fit` requis.
- **Build** : `npm run build` OK, `cap:sync`/`cap:open` présents, `.gitignore` Android correct, `google-services.json` optionnel géré.

---

## Ordre d'attaque recommandé

1. **Sprint 1 (1.1 → 1.3)** : sans ça l'APK n'est pas testable par un utilisateur réel. 1.1 et 1.2 partagent l'installation de `@capacitor/app`.
2. **Sprint 2 (2.1 → 2.4)** : 2.3 et 2.4 concernent aussi le web — à corriger avant que la branche ne remonte vers master.
3. **Sprint 3** : 3.1 (branding) est rapide et à fort impact perçu ; 3.2/3.3 stabilisent la nouvelle couche modale.
4. **Sprint 4** : au fil de l'eau ; 4.1 uniquement quand une distribution signée est en vue.
