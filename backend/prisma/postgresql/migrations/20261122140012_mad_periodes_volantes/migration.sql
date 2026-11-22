-- AlterTable
ALTER TABLE "resource_mad_history" ADD COLUMN     "jours_max" INTEGER,
ADD COLUMN     "volante" INTEGER DEFAULT 0;


-- Données : la MAD volante en cours d'une ressource devient une période de l'historique (type, dates, quota)
UPDATE "resource_mad_history" SET
    volante = 1,
    jours_max = (SELECT r.jours_max_mad FROM "resources" r WHERE r.id = "resource_mad_history".resource_id),
    date_fin = (SELECT r.date_fin_mad FROM "resources" r WHERE r.id = "resource_mad_history".resource_id)
WHERE date_fin IS NULL
  AND resource_id IN (SELECT r.id FROM "resources" r WHERE r.is_mad_volante = 1);
