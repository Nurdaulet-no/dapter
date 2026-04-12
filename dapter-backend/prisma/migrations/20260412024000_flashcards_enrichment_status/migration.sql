-- AlterTable
ALTER TABLE "Document"
ADD COLUMN "flashcardsEnrichmentStatus" "ArtifactStageStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "flashcardsEnrichmentError" TEXT;
