# Scripts SQL historiques

Ces trois fichiers vivaient à la racine du repo, avant l'adoption de
`supabase/migrations/`. Ils sont conservés — pas supprimés — parce qu'ils ne
sont pas tous redondants.

| Fichier | Statut |
|---|---|
| `supabase-coach-athletes.sql` | Remplacé par `../migrations/20260313_coach_athletes.sql` (puis `20260715_notifications_coach_invites.sql` pour le consentement mutuel). Conservé pour référence. |
| `supabase-sessions-catalog.sql` | Remplacé par `../migrations/20260513_shared_sessions_catalog.sql`. Conservé pour référence. |
| `supabase-community-sessions.sql` | **Toujours d'actualité** : seule définition de la table `community_sessions`, utilisée par `src/hooks/useCommunitySessionsSync.js`. Aucune migration ne la recouvre. |

Toute nouvelle évolution de schéma va dans `../migrations/`, pas ici.
