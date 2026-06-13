-- AlterTable
ALTER TABLE `leave_requests` ADD COLUMN `currentStep` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `moreInfoNote` TEXT NULL;

-- CreateTable
CREATE TABLE `leave_approval_steps` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `approverType` VARCHAR(191) NOT NULL,
    `roleName` VARCHAR(191) NULL,
    `approverEmployeeId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `actedBy` VARCHAR(191) NULL,
    `actedAt` DATETIME(3) NULL,
    `remarks` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leave_approval_steps_status_approverEmployeeId_idx`(`status`, `approverEmployeeId`),
    UNIQUE INDEX `leave_approval_steps_requestId_sequence_key`(`requestId`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_configs` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `steps` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workflow_configs_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `leave_approval_steps` ADD CONSTRAINT `leave_approval_steps_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `leave_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
