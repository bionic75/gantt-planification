-- AlterTable
ALTER TABLE "affectation_projects" ADD COLUMN     "status_id" INTEGER;

-- CreateTable
CREATE TABLE "deployment_statuses" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_service" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "deployment_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deployment_statuses_label_key" ON "deployment_statuses"("label");


-- Statut par défaut
INSERT INTO "deployment_statuses" ("label", "color", "position", "is_service") VALUES ('En service', '#2e7d32', 0, 1);
