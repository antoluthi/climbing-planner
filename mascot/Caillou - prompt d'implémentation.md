# Prompt d'implémentation — Mascotte Caillou

> À coller dans Claude Code (ou autre agent dev) à la racine du projet `ClaudeCode/`.

---

## Contexte

Tu vas implémenter une mascotte visuelle nommée **Caillou** dans l'app Planif Escalade (React 19 + Vite, design system custom dans `src/theme/makeStyles.js`). La mascotte est un galet de bloc stylisé, animé en CSS pur, qui apparaît à des moments calmes de l'app pour réchauffer les temps d'attente.

**Règle d'or :** la mascotte est **purement visuelle**. Aucun texte de l'UI ne lui attribue d'intention, de mémoire ou de pensée. Elle ne parle pas, ne dit pas "je m'en souviens", n'est jamais qualifiée de personnage. C'est un ornement vivant — comme une plante sur un bureau.

---

## 1. Composant — `src/components/Caillou.jsx`

Crée un composant React fonctionnel avec la signature suivante :

```jsx
<Caillou state="idle" size={120} />
```

### Props

| prop | type | défaut | description |
|---|---|---|---|
| `state` | `"idle" \| "sleep" \| "loading" \| "success" \| "error" \| "curious" \| "rainy" \| "micro"` | `"idle"` | État d'animation |
| `size` | `number` | `120` | Largeur en px (le SVG est carré, viewBox 320×320) |
| `aria-label` | `string` | omis | Si fourni, ajoute `role="img"` ; sinon `aria-hidden="true"` |

### Comportement

- Le composant n'a pas d'état React interne.
- Toutes les animations sont en CSS pur, déclenchées par la classe `pebble pebble--{state}`.
- Respecte `@media (prefers-reduced-motion: reduce)` → toutes animations désactivées.
- Le `state="success"` et `state="error"` jouent leur animation **une fois** ; ils retournent à idle au remontage. Pour rejouer, le parent doit unmount/remount ou changer une `key`.
- Les couleurs viennent **exclusivement** des CSS custom properties définies plus bas — pas de prop `color`, pas de styled-components, pas d'`isDark`. Le composant suit automatiquement le thème via les variables.

### SVG + CSS

Le markup SVG complet et les keyframes sont fournis dans la maquette `mascot/Caillou.html` (sections "Anatomie" + "Catalogue"). Copie le SVG (~80 lignes) tel quel dans le composant. Mets les styles dans `src/components/Caillou.css` (importé en haut du fichier) — **ne** mets pas les keyframes dans `makeStyles.js`, elles sont CSS pur.

---

## 2. Tokens couleur — `src/theme/makeStyles.js`

Ajoute les tokens de roche dans la fonction `makeStyles(isDark)`, à côté des tokens existants (`bg`, `accent`, etc.) :

```js
// Pebble palette
rock1:      D ? "#8d7960" : "#b8a484",
rock2:      D ? "#6f5e49" : "#97836a",
rock3:      D ? "#4d4032" : "#6c5b46",
rockShine:  D ? "#a89a82" : "#d8c9ad",
rockEdge:   D ? "#2e251c" : "#5c4830",
rockIris:   D ? "#1a1410" : "#2a2218",
```

Puis expose ces tokens en CSS custom properties dans le composant racine (App.jsx ou équivalent) via un `<style>` injecté, OU mieux : dans le `<Caillou>` lui-même via une wrapper `<div style={{ '--rock-1': t.rock1, ... }}>`.

---

## 3. Points d'intégration

Pour chaque point, branche le composant avec l'état indiqué. **N'ajoute pas de texte qui personnifie la mascotte.**

### A. `src/components/AuthPanel.jsx` — magic link envoyé
- Après l'envoi du magic link, quand `sent === true` :
- Affiche le caillou en `state="curious"`, `size={110}`, **au-dessus** du message "Lien envoyé — vérifiez vos mails".
- Pas de texte additionnel.

### B. `src/App.jsx` (ou équivalent au boot) — chargement initial Supabase
- Pendant le premier fetch de la semaine (loading state du Dashboard avant que `weekData` soit prêt) :
- Si le chargement dépasse 800 ms, affiche `<Caillou state="loading" size={160} />` centré, sous un texte sobre type "Récupération de la semaine…".
- Disparaît en fade-out 200 ms dès que le contenu est prêt.

### C. Empty state — semaine sans aucune séance
- Quand `weekSessions.length === 0` ET qu'aucune métadonnée n'est saisie :
- Affiche `<Caillou state="curious" size={130} />` au-dessus du texte "Aucune séance prévue" et du bouton "+ Nouvelle séance".
- Disparaît dès qu'une séance ou métadonnée est ajoutée.

### D. `src/components/AccueilView.jsx` — carte du jour, jour de repos
- Quand `isRestDay === true` (déjà calculé dans le composant) :
- Affiche `<Caillou state="sleep" size={84} />` à gauche du greeting dans la carte du jour.
- N'altère pas le greeting généré par `getGreeting()`.

### E. `src/components/HooperSection.jsx` — fatigue forte
- Quand le score Hooper indique une fatigue élevée (selon la logique `hooperColor` existante en zone "rouge") :
- Affiche `<Caillou state="rainy" size={72} />` discrètement dans la carte Hooper.

### F. `src/components/ToastContainer.jsx` — toasts de succès
- Pour les toasts `type: "success"` (sauvegarde, sync ok) :
- Préfixe avec `<Caillou state="success" size={28} />` à la place de l'icône ✓ actuelle si elle existe.
- Pour `type: "error"` : utiliser `state="error"`, même taille.

### G. Header — indicateur de sync long
- Dans le header (`src/components/Dashboard.jsx` ou équivalent), pendant une vraie sync &gt; 1 s :
- Remplace le point de couleur (`syncDot`) par `<Caillou state="micro" size={24} />`.
- Le micro variant a une respiration et un clignement, rien d'autre.

### H. Modale de feedback envoyé
- Dans la confirmation après envoi d'un feedback à la séance :
- Affiche `<Caillou state="success" size={100} />` centré au-dessus du titre "Merci pour ton retour."
- **Aucun texte n'évoque la mascotte.**

---

## 4. Garde-fous

1. **Pas de mascotte sur les écrans de saisie active** (création de séance, BlockEditor, formulaires). Elle distrairait.
2. **Pas de mascotte dans plus d'une zone visible à la fois.** Une présence par écran maximum.
3. **Pas de mascotte sous les 800 ms d'attente.** Pour les opérations rapides, un spinner classique ou rien.
4. **Pas de variation de copy autour d'elle.** Le texte qui l'accompagne doit être strictement fonctionnel ("Sauvegardé", "Aucune séance prévue", etc.). Aucune phrase ne lui attribue de qualités humaines.
5. **A11y** : `aria-hidden="true"` par défaut. Le contenu textuel à côté porte le sens.

---

## 5. Tests

- Vérifie le rendu dans les deux thèmes (sombre / clair) sur chaque point d'intégration.
- Vérifie qu'avec `prefers-reduced-motion: reduce`, le caillou est immobile mais visible.
- Vérifie qu'il n'y a aucun layout shift quand il apparaît/disparaît (utilise `min-height` ou `aspect-ratio` sur le conteneur).

---

## 6. Livrable attendu

- `src/components/Caillou.jsx` — composant
- `src/components/Caillou.css` — styles + keyframes
- 6 fichiers modifiés selon section 3.
- Tokens couleur ajoutés dans `makeStyles.js`.

Pas de tests unitaires nécessaires sur le composant lui-même (animation visuelle). Vérifie juste qu'il rend sans erreur et que les 8 valeurs de `state` mappent à la bonne classe CSS.
