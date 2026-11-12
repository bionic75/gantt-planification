-- CreateTable
CREATE TABLE `atelier_retroplannings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `samu_name` VARCHAR(191) NOT NULL,
    `project_id` INTEGER NULL,
    `zone` LONGTEXT NOT NULL,
    `mep_date` LONGTEXT NOT NULL,
    `nb_ateliers` INTEGER NOT NULL,
    `visite_date` LONGTEXT NULL,
    `delai_visite_atelier` INTEGER NOT NULL DEFAULT 14,
    `delai_mep` INTEGER NOT NULL DEFAULT 28,
    `lignes` LONGTEXT NULL,
    `created_by` INTEGER NULL,
    `created_by_name` LONGTEXT NULL,
    `last_sent_at` LONGTEXT NULL,
    `created_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),
    `updated_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `atelier_retroplannings_samu_name_key`(`samu_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

