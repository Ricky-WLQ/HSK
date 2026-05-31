-- CreateTable
CREATE TABLE "VocabProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "hanzi" TEXT NOT NULL,
    "mastery" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VocabProgress_userId_wordId_key" ON "VocabProgress"("userId", "wordId");

-- CreateIndex
CREATE INDEX "VocabProgress_userId_level_idx" ON "VocabProgress"("userId", "level");

-- AddForeignKey
ALTER TABLE "VocabProgress" ADD CONSTRAINT "VocabProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
