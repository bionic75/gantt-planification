-- AlterTable
ALTER TABLE "affectation_projects" ADD COLUMN "status_id" INTEGER;

-- CreateTable
CREATE TABLE "deployment_statuses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_service" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "deployment_statuses_label_key" ON "deployment_statuses"("label");


-- Statut par défaut
INSERT INTO "deployment_statuses" ("label", "color", "position", "is_service") VALUES ('En service', '#2e7d32', 0, 1);
