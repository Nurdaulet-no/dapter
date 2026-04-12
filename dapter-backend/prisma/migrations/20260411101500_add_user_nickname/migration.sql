-- Add nickname to users with safe backfill
ALTER TABLE "User" ADD COLUMN "nickname" TEXT;

UPDATE "User"
SET "nickname" = SUBSTRING(MD5("id") FROM 1 FOR 6)
WHERE "nickname" IS NULL;

ALTER TABLE "User" ALTER COLUMN "nickname" SET NOT NULL;

CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");
