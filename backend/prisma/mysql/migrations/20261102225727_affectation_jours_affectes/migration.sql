-- CreateTable
CREATE TABLE `affectation_assignment_days` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `stage_key` VARCHAR(191) NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `created_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),

    INDEX `idx_aff_assign_days_stage`(`project_id`, `stage_key`),
    UNIQUE INDEX `affectation_assignment_days_project_id_stage_key_resource_id_key`(`project_id`, `stage_key`, `resource_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

