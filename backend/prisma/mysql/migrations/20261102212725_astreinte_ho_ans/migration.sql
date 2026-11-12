-- AlterTable
ALTER TABLE `users` ADD COLUMN `astreinte_ho_ans` INTEGER NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `astreinte_ho_ans_slots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_by` INTEGER NULL,
    `created_at` VARCHAR(32) NULL DEFAULT (date_format(utc_timestamp(),'%Y-%m-%d %H:%i:%s')),

    INDEX `idx_astreinte_ho_ans_user`(`user_id`),
    UNIQUE INDEX `astreinte_ho_ans_slots_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

