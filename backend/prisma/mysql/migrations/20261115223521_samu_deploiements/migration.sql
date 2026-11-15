-- AlterTable
ALTER TABLE `affectation_projects` DROP COLUMN `status_id`;

-- CreateTable
CREATE TABLE `deployment_samus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `location_id` INTEGER NOT NULL,
    `status_id` INTEGER NULL,
    `date_mise_en_service` LONGTEXT NULL,

    UNIQUE INDEX `deployment_samus_location_id_key`(`location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

