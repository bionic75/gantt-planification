-- Historiques ne correspondant à aucun déploiement existant : déploiements supprimés, et identifiants réattribués après
-- la reconstruction de la table (migration samu_deploiements) dont le nouveau déploiement héritait de l'historique de
-- l'ancien (entrées antérieures à sa création)
DELETE FROM `affectation_history` WHERE NOT EXISTS (
    SELECT 1 FROM `affectation_projects` p
    WHERE p.`id` = `affectation_history`.`project_id`
      AND (p.`created_at` IS NULL OR `affectation_history`.`created_at` IS NULL OR `affectation_history`.`created_at` >= p.`created_at`)
);
