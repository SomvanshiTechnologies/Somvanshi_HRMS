-- AlterTable
ALTER TABLE `bank_details` ADD COLUMN `upiId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `employee_documents` ADD COLUMN `isCurrent` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `parentId` VARCHAR(191) NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
    MODIFY `category` ENUM('AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'RESUME', 'DEGREE', 'ADDRESS_PROOF', 'IDENTITY', 'EDUCATION', 'EXPERIENCE', 'COMPENSATION', 'CONTRACT', 'POLICY', 'LETTER', 'MEDICAL', 'OTHER') NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE `employees` ADD COLUMN `careerInterests` TEXT NULL,
    ADD COLUMN `languages` JSON NULL,
    ADD COLUMN `linkedinUrl` VARCHAR(191) NULL,
    ADD COLUMN `portfolioUrl` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `profile_change_requests` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `changes` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `isDraft` BOOLEAN NOT NULL DEFAULT false,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewerRemarks` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `profile_change_requests_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `profile_change_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `employee_documents_employeeId_category_isCurrent_idx` ON `employee_documents`(`employeeId`, `category`, `isCurrent`);

-- AddForeignKey
ALTER TABLE `employee_documents` ADD CONSTRAINT `employee_documents_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `employee_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profile_change_requests` ADD CONSTRAINT `profile_change_requests_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
