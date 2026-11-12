-- AlterTable
ALTER TABLE `resources` ADD COLUMN `astreinte_apd` INTEGER NULL DEFAULT 0,
    ADD COLUMN `astreinte_ho` INTEGER NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `astreinte_ho_slots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `created_by` INTEGER NULL,
    `created_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),

    INDEX `idx_astreinte_ho_slots_date`(`date`),
    UNIQUE INDEX `astreinte_ho_slots_date_period_resource_id_key`(`date`, `period`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

-- CreateTable
CREATE TABLE `astreinte_ho_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slot_date` LONGTEXT NOT NULL,
    `period` LONGTEXT NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `resource_name` LONGTEXT NULL,
    `action` LONGTEXT NOT NULL,
    `week_start` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NULL,
    `user_name` LONGTEXT NULL,
    `created_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),

    INDEX `idx_astreinte_ho_log_week`(`week_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

