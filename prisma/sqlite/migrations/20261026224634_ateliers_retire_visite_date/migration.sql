-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_atelier_retroplannings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "samu_name" TEXT NOT NULL,
    "project_id" INTEGER,
    "zone" TEXT NOT NULL,
    "mep_date" TEXT NOT NULL,
    "nb_ateliers" INTEGER NOT NULL,
    "delai_visite_atelier" INTEGER NOT NULL DEFAULT 14,
    "delai_mep" INTEGER NOT NULL DEFAULT 28,
    "lignes" TEXT,
    "created_by" INTEGER,
    "created_by_name" TEXT,
    "last_sent_at" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_atelier_retroplannings" ("created_at", "created_by", "created_by_name", "delai_mep", "delai_visite_atelier", "id", "last_sent_at", "lignes", "mep_date", "nb_ateliers", "project_id", "samu_name", "updated_at", "zone") SELECT "created_at", "created_by", "created_by_name", "delai_mep", "delai_visite_atelier", "id", "last_sent_at", "lignes", "mep_date", "nb_ateliers", "project_id", "samu_name", "updated_at", "zone" FROM "atelier_retroplannings";
DROP TABLE "atelier_retroplannings";
ALTER TABLE "new_atelier_retroplannings" RENAME TO "atelier_retroplannings";
CREATE UNIQUE INDEX "atelier_retroplannings_samu_name_key" ON "atelier_retroplannings"("samu_name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

