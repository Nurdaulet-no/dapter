-- CreateEnum
CREATE TYPE "ArtifactStageStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Document"
ADD COLUMN "notebookStatus" "ArtifactStageStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "notebookError" TEXT,
ADD COLUMN "flashcardsStatus" "ArtifactStageStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "flashcardsError" TEXT,
ADD COLUMN "quizzesStatus" "ArtifactStageStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "quizzesError" TEXT;
