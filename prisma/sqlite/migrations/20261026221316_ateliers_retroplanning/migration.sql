-- CreateTable
CREATE TABLE "atelier_retroplannings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "samu_name" TEXT NOT NULL,
    "project_id" INTEGER,
    "zone" TEXT NOT NULL,
    "mep_date" TEXT NOT NULL,
    "nb_ateliers" INTEGER NOT NULL,
    "visite_date" TEXT,
    "delai_visite_atelier" INTEGER NOT NULL DEFAULT 14,
    "delai_mep" INTEGER NOT NULL DEFAULT 28,
    "lignes" TEXT,
    "created_by" INTEGER,
    "created_by_name" TEXT,
    "last_sent_at" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "atelier_retroplannings_samu_name_key" ON "atelier_retroplannings"("samu_name");

