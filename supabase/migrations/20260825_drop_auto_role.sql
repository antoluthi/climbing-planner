-- ─── Retrait du rôle « autonome » ───────────────────────────────────────────
-- 'auto' était décrit comme « athlète autonome, même accès que coach ». Dans
-- l'app, c'était littéralement vrai : aucun chemin de code ne le distinguait de
-- 'coach'. L'option a donc été retirée de l'interface.
--
-- Les comptes restés à cette valeur deviennent coach. L'app le fait déjà à la
-- lecture (`roleFromStatus` dans `DataProvider`), donc rien ne change pour eux :
-- cette migration aligne la base sur ce qui est affiché.
--
-- La contrainte CHECK continue d'accepter 'auto' à dessein — la resserrer
-- casserait toute mise à jour d'une ligne qui aurait échappé à cet UPDATE.
--
-- Idempotent.

UPDATE public.climbing_plans SET status = 'coach' WHERE status = 'auto';
