-- AlterTable
ALTER TABLE "resource_mad_history" ADD COLUMN "astreinte_apd" INTEGER DEFAULT 0;
ALTER TABLE "resource_mad_history" ADD COLUMN "astreinte_hno" INTEGER DEFAULT 0;
ALTER TABLE "resource_mad_history" ADD COLUMN "astreinte_ho" INTEGER DEFAULT 0;


-- Données : chaque période reprend les astreintes actuelles de sa ressource
UPDATE "resource_mad_history" SET
    astreinte_ho = (SELECT r.astreinte_ho FROM "resources" r WHERE r.id = "resource_mad_history".resource_id),
    astreinte_hno = (SELECT r.astreinte_volontaire FROM "resources" r WHERE r.id = "resource_mad_history".resource_id),
    astreinte_apd = (SELECT r.astreinte_apd FROM "resources" r WHERE r.id = "resource_mad_history".resource_id);
