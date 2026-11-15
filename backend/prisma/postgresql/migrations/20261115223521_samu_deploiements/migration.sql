-- AlterTable
ALTER TABLE "affectation_projects" DROP COLUMN "status_id";

-- CreateTable
CREATE TABLE "deployment_samus" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "status_id" INTEGER,
    "date_mise_en_service" TEXT,

    CONSTRAINT "deployment_samus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deployment_samus_location_id_key" ON "deployment_samus"("location_id");

