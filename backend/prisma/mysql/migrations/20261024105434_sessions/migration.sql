-- CreateTable
CREATE TABLE `sessions` (
    `sid` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NULL,
    `data` LONGTEXT NOT NULL,
    `expires_at` VARCHAR(191) NOT NULL,

    INDEX `sessions_user_id_idx`(`user_id`),
    INDEX `sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`sid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

