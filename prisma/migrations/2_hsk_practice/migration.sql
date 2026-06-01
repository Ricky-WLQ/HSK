-- CreateTable
CREATE TABLE "HskAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'practice',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER,
    "answers" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "HskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HskMistake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionContext" TEXT,
    "options" TEXT,
    "userAnswer" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "analysis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HskMistake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HskAttempt_userId_level_section_idx" ON "HskAttempt"("userId", "level", "section");

-- CreateIndex
CREATE INDEX "HskAttempt_userId_status_idx" ON "HskAttempt"("userId", "status");

-- CreateIndex
CREATE INDEX "HskMistake_userId_level_section_status_idx" ON "HskMistake"("userId", "level", "section", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HskMistake_userId_level_section_contentId_questionId_key" ON "HskMistake"("userId", "level", "section", "contentId", "questionId");

-- AddForeignKey
ALTER TABLE "HskAttempt" ADD CONSTRAINT "HskAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HskMistake" ADD CONSTRAINT "HskMistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

