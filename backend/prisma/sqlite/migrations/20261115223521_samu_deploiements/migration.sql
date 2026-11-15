-- CreateTable
CREATE TABLE "deployment_samus" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "location_id" INTEGER NOT NULL,
    "status_id" INTEGER,
    "date_mise_en_service" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_affectation_projects" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "samu_name" TEXT NOT NULL,
    "location_id" INTEGER,
    "chef_projet_id" INTEGER,
    "date_debut" TEXT NOT NULL,
    "date_mise_en_service" TEXT,
    "date_mise_en_production" TEXT,
    "periods" TEXT NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_affectation_projects" ("chef_projet_id", "created_at", "created_by", "date_debut", "date_mise_en_production", "date_mise_en_service", "id", "location_id", "periods", "samu_name", "updated_at") SELECT "chef_projet_id", "created_at", "created_by", "date_debut", "date_mise_en_production", "date_mise_en_service", "id", "location_id", "periods", "samu_name", "updated_at" FROM "affectation_projects";
DROP TABLE "affectation_projects";
ALTER TABLE "new_affectation_projects" RENAME TO "affectation_projects";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "deployment_samus_location_id_key" ON "deployment_samus"("location_id");

