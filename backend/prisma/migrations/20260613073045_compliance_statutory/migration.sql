-- CreateTable
CREATE TABLE `employee_statutory` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `aadhaarNumber` VARCHAR(191) NULL,
    `panNumber` VARCHAR(191) NULL,
    `uanNumber` VARCHAR(191) NULL,
    `pfNumber` VARCHAR(191) NULL,
    `esicNumber` VARCHAR(191) NULL,
    `nationalId` VARCHAR(191) NULL,
    `taxRegime` ENUM('OLD', 'NEW') NOT NULL DEFAULT 'NEW',
    `pfOptedIn` BOOLEAN NOT NULL DEFAULT true,
    `esiApplicable` BOOLEAN NOT NULL DEFAULT false,
    `verifiedAt` DATETIME(3) NULL,
    `verifiedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employee_statutory_employeeId_key`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compliance_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('PF_ECR', 'PT_RETURN', 'ESI_RETURN', 'TDS_PAYMENT', 'TDS_RETURN', 'GRATUITY', 'LWF', 'SHOPS_ACT', 'OTHER') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `authority` VARCHAR(191) NULL,
    `period` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'FILED', 'OVERDUE', 'WAIVED') NOT NULL DEFAULT 'PENDING',
    `amount` DECIMAL(16, 2) NULL,
    `filedAt` DATETIME(3) NULL,
    `filedBy` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `compliance_tasks_status_dueDate_idx`(`status`, `dueDate`),
    UNIQUE INDEX `compliance_tasks_type_period_key`(`type`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `employee_statutory` ADD CONSTRAINT `employee_statutory_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

