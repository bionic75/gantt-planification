-- CreateTable
CREATE TABLE "sessions" (
    "sid" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER,
    "data" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

