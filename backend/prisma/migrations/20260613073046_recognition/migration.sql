-- CreateTable
CREATE TABLE `recognitions` (
    `id` VARCHAR(191) NOT NULL,
    `fromEmployeeId` VARCHAR(191) NOT NULL,
    `toEmployeeId` VARCHAR(191) NOT NULL,
    `badge` ENUM('KUDOS', 'TEAM_PLAYER', 'INNOVATION', 'LEADERSHIP', 'CUSTOMER_FIRST', 'ABOVE_AND_BEYOND', 'MILESTONE', 'WELCOME') NOT NULL DEFAULT 'KUDOS',
    `message` TEXT NOT NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `recognitions_toEmployeeId_idx`(`toEmployeeId`),
    INDEX `recognitions_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recognition_cheers` (
    `recognitionId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`recognitionId`, `employeeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `recognitions` ADD CONSTRAINT `recognitions_fromEmployeeId_fkey` FOREIGN KEY (`fromEmployeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recognitions` ADD CONSTRAINT `recognitions_toEmployeeId_fkey` FOREIGN KEY (`toEmployeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recognition_cheers` ADD CONSTRAINT `recognition_cheers_recognitionId_fkey` FOREIGN KEY (`recognitionId`) REFERENCES `recognitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recognition_cheers` ADD CONSTRAINT `recognition_cheers_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

