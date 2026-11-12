-- AlterTable
ALTER TABLE `users` MODIFY `default_tab` VARCHAR(191) NULL DEFAULT 'accueil';


-- Onglet d'ouverture : Accueil pour tous (la valeur « planning » était l'ancien défaut, indiscernable d'un choix)
UPDATE `users` SET `default_tab` = 'accueil' WHERE `default_tab` = 'planning' OR `default_tab` IS NULL;
