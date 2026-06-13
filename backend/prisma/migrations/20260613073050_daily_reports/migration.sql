-- AlterTable
ALTER TABLE `announcement_reactions` MODIFY `emoji` VARCHAR(191) NOT NULL DEFAULT '👍';

-- CreateTable
CREATE TABLE `daily_reports` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `project` VARCHAR(191) NULL,
    `tasksCompleted` TEXT NOT NULL,
    `workInProgress` TEXT NULL,
    `blockers` TEXT NULL,
    `tomorrowPlan` TEXT NULL,
    `hoursWorked` DOUBLE NOT NULL DEFAULT 0,
    `comments` TEXT NULL,
    `attachments` JSON NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'REVIEWED') NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `daily_reports_date_idx`(`date`),
    INDEX `daily_reports_employeeId_date_idx`(`employeeId`, `date`),
    UNIQUE INDEX `daily_reports_employeeId_date_key`(`employeeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `daily_reports` ADD CONSTRAINT `daily_reports_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

