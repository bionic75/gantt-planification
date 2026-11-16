-- AlterTable
ALTER TABLE `affectation_projects` ADD COLUMN `status_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `deployment_statuses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `label` VARCHAR(191) NOT NULL,
    `color` LONGTEXT NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `is_service` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `deployment_statuses_label_key`(`label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;


-- Statut par défaut
INSERT INTO `deployment_statuses` (`label`, `color`, `position`, `is_service`) VALUES ('En service', '#2e7d32', 0, 1);
