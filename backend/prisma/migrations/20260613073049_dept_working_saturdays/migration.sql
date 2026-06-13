-- AlterTable
ALTER TABLE `announcement_reactions` MODIFY `emoji` VARCHAR(191) NOT NULL DEFAULT '👍';

-- AlterTable
ALTER TABLE `departments` ADD COLUMN `workingSaturdays` JSON NULL;

