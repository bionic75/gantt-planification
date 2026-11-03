-- CreateTable
CREATE TABLE `atelier_sondages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `retroplanning_id` INTEGER NOT NULL,
    `ligne` VARCHAR(191) NOT NULL,
    `nom` LONGTEXT NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `statut` VARCHAR(191) NOT NULL DEFAULT 'brouillon',
    `organisateur_id` INTEGER NULL,
    `destinataires` LONGTEXT NULL,
    `cc_user_ids` LONGTEXT NULL,
    `message` LONGTEXT NULL,
    `created_by` INTEGER NULL,
    `sent_at` LONGTEXT NULL,
    `created_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),
    `updated_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `atelier_sondages_token_key`(`token`),
    UNIQUE INDEX `atelier_sondages_retroplanning_id_ligne_key`(`retroplanning_id`, `ligne`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

-- CreateTable
CREATE TABLE `atelier_sondage_options` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sondage_id` INTEGER NOT NULL,
    `date` LONGTEXT NOT NULL,
    `heure` LONGTEXT NULL,
    `heure_fin` LONGTEXT NULL,
    `ordre` INTEGER NOT NULL DEFAULT 0,

    INDEX `atelier_sondage_options_sondage_id_idx`(`sondage_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

-- CreateTable
CREATE TABLE `atelier_sondage_reponses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sondage_id` INTEGER NOT NULL,
    `nom` LONGTEXT NOT NULL,
    `options` LONGTEXT NOT NULL,
    `created_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),
    `updated_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),

    INDEX `atelier_sondage_reponses_sondage_id_idx`(`sondage_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

