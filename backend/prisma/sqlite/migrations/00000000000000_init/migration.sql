-- CreateTable
CREATE TABLE "action_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "affectation_assignments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_id" INTEGER NOT NULL,
    "stage_key" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "affectation_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_id" INTEGER NOT NULL,
    "samu_name" TEXT,
    "user_id" INTEGER,
    "user_name" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "affectation_projects" (
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

-- CreateTable
CREATE TABLE "api_keys" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TEXT,
    "revoked" INTEGER DEFAULT 0
);

-- CreateTable
CREATE TABLE "app_user_access" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "app_key" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "astreinte_disponibilites" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resource_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "type_creneau" TEXT NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "astreinte_indisponibilites" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resource_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "type_creneau" TEXT NOT NULL,
    "motif" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "astreinte_planning" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "type_creneau" TEXT NOT NULL,
    "resource_id" INTEGER,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "astreintes_hno" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT NOT NULL,
    "heure_debut" TEXT,
    "heure_fin" TEXT,
    "samu" TEXT,
    "tous_samu" INTEGER DEFAULT 0,
    "objet" TEXT NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "automation_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "automation_id" INTEGER NOT NULL,
    "expert_id" INTEGER,
    "expert_name" TEXT,
    "expert_email" TEXT,
    "target_month" TEXT,
    "sent_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "recipients_list" TEXT,
    "file_content" TEXT,
    "filename" TEXT
);

-- CreateTable
CREATE TABLE "bons_commande" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "intitule" TEXT NOT NULL,
    "titulaire" TEXT,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT NOT NULL,
    "nb_uo" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "actif" INTEGER DEFAULT 1,
    "solde" INTEGER DEFAULT 0,
    "regularisation_cible_bdc_id" INTEGER
);

-- CreateTable
CREATE TABLE "connection_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER,
    "username" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "login_time" TEXT DEFAULT CURRENT_TIMESTAMP,
    "modifications" TEXT DEFAULT ''
);

-- CreateTable
CREATE TABLE "cra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "resource_id" INTEGER,
    "mois" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'a_completer',
    "commentaire_expert" TEXT,
    "submitted_at" TEXT,
    "vise_n1_at" TEXT,
    "vise_n1_by" INTEGER,
    "vise_n2_at" TEXT,
    "vise_n2_by" INTEGER,
    "diffuse_at" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "rien_a_declarer" INTEGER DEFAULT 0,
    "commentaire_refus" TEXT,
    "refuse_by" INTEGER,
    "refuse_at" TEXT,
    "deleted" INTEGER DEFAULT 0,
    "pre_delete_statut" TEXT,
    "pre_delete_archived" INTEGER,
    "modifie_admin_at" TEXT,
    "modifie_admin_nom" TEXT,
    "archived" INTEGER DEFAULT 0,
    "pdf_filename" TEXT
);

-- CreateTable
CREATE TABLE "cra_diffusion_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cra_id" INTEGER NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_name" TEXT,
    "recipient_type" TEXT DEFAULT 'rh_es',
    "sent_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "email_batch_id" TEXT
);

-- CreateTable
CREATE TABLE "cra_rh_recipients" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resource_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT
);

-- CreateTable
CREATE TABLE "cra_signatures" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cra_id" INTEGER NOT NULL,
    "rang" INTEGER NOT NULL,
    "signer_user_id" INTEGER,
    "signer_name" TEXT NOT NULL,
    "signer_email" TEXT NOT NULL,
    "signed_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "token" TEXT,
    "token_used" INTEGER DEFAULT 0,
    "token_expires_at" TEXT
);

-- CreateTable
CREATE TABLE "custom_event_external_participants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "event_id" INTEGER NOT NULL,
    "nom" TEXT,
    "prenom" TEXT,
    "email" TEXT,
    "added_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "custom_event_participants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "event_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "added_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "custom_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "config" TEXT,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "needs_resources" INTEGER DEFAULT 0,
    "resources_count" INTEGER DEFAULT 1,
    "type_id" INTEGER,
    "grist" INTEGER DEFAULT 0,
    "location_id" INTEGER,
    "period" TEXT DEFAULT 'FULL'
);

-- CreateTable
CREATE TABLE "deplacements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "amoa_ced_id" INTEGER,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT NOT NULL,
    "samu" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "bon_commande_id" INTEGER,
    "nb_uo" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "a_regulariser" INTEGER DEFAULT 0,
    "regularisation_source_bdc_id" INTEGER,
    "commentaire" TEXT,
    "regularisation_cible_bdc_id" INTEGER
);

-- CreateTable
CREATE TABLE "email_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" INTEGER DEFAULT 0,
    "user" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "email_queue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "sender_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html_body" TEXT NOT NULL,
    "ics_content" TEXT,
    "ics_method" TEXT,
    "ics_filename" TEXT,
    "pdf_attachment" TEXT,
    "pdf_filename" TEXT,
    "status" TEXT DEFAULT 'pending',
    "attempts" INTEGER DEFAULT 0,
    "max_attempts" INTEGER DEFAULT 3,
    "error_message" TEXT,
    "action_type" TEXT,
    "resource_id" INTEGER,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TEXT,
    "next_retry_at" TEXT,
    "cc_emails" TEXT
);

-- CreateTable
CREATE TABLE "event_types" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT,
    "label_long" TEXT NOT NULL,
    "label_short" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'tag',
    "bg_color" TEXT NOT NULL DEFAULT '#ffeb3b',
    "text_color" TEXT NOT NULL DEFAULT '#000000',
    "border_color" TEXT NOT NULL DEFAULT '#000000',
    "is_other" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "expert_notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "expert_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "activity_name" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "is_read" INTEGER DEFAULT 0
);

-- CreateTable
CREATE TABLE "ics_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "file_id" INTEGER NOT NULL,
    "event_date" TEXT NOT NULL,
    "event_end_date" TEXT,
    "summary" TEXT,
    "zone" TEXT
);

-- CreateTable
CREATE TABLE "ics_files" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content" TEXT,
    "config" TEXT,
    "imported_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "locations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle_long" TEXT NOT NULL,
    "libelle_court" TEXT NOT NULL,
    "adresse" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "mfa_codes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "mfa_validations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "validated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "used_at" TEXT
);

-- CreateTable
CREATE TABLE "pending_notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "session_id" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "expert_id" INTEGER NOT NULL,
    "assignment_data" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "pending_push_messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "to_user_id" INTEGER NOT NULL,
    "from_user_id" INTEGER NOT NULL,
    "from_name" TEXT,
    "from_photo" TEXT,
    "message" TEXT NOT NULL,
    "sent_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "poi" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "location_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "comment" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "osm_ref" TEXT,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "poi_comments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "poi_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "poi_ratings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "poi_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "resource_mad_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resource_id" INTEGER NOT NULL,
    "taux" REAL NOT NULL,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER
);

-- CreateTable
CREATE TABLE "resource_mad_particularites" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resource_id" INTEGER NOT NULL,
    "mad_history_id" INTEGER NOT NULL,
    "taux" REAL NOT NULL,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT NOT NULL,
    "motif" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER
);

-- CreateTable
CREATE TABLE "resource_samu_assignments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resource_id" INTEGER NOT NULL,
    "samu" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "resources" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "trigramme" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "taux" REAL NOT NULL,
    "samu" TEXT NOT NULL,
    "actif" INTEGER DEFAULT 1,
    "date_debut" TEXT,
    "date_fin" TEXT,
    "es_rattachement" TEXT,
    "fonction" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "astreinte_volontaire" INTEGER DEFAULT 0,
    "date_fin_mad" TEXT,
    "jours_max_mad" INTEGER,
    "is_mad_volante" INTEGER DEFAULT 0,
    "contacts_rh" TEXT,
    "astreinte_date_activation" TEXT
);

-- CreateTable
CREATE TABLE "schedule_data" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resource_id" INTEGER NOT NULL,
    "date_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "notification" TEXT DEFAULT '0',
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" TEXT NOT NULL,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT,
    "is_admin" INTEGER DEFAULT 0,
    "is_expert" INTEGER DEFAULT 0,
    "is_user" INTEGER DEFAULT 0,
    "resource_id" INTEGER,
    "actif" INTEGER DEFAULT 1,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "totp_secret" TEXT,
    "default_tab" TEXT DEFAULT 'planning',
    "profile_photo" TEXT,
    "trigramme" TEXT,
    "has_reporting_access" INTEGER DEFAULT 0,
    "amoa_ced" INTEGER DEFAULT 0,
    "is_rh" INTEGER DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "affectation_assignments_project_id_stage_key_resource_id_key" ON "affectation_assignments"("project_id", "stage_key", "resource_id");

-- CreateIndex
CREATE INDEX "idx_aff_hist_project" ON "affectation_history"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_access_app_key_user_id_key" ON "app_user_access"("app_key", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "astreinte_disponibilites_resource_id_date_key" ON "astreinte_disponibilites"("resource_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "astreinte_indisponibilites_resource_id_date_type_creneau_key" ON "astreinte_indisponibilites"("resource_id", "date", "type_creneau");

-- CreateIndex
CREATE UNIQUE INDEX "astreinte_planning_date_type_creneau_key" ON "astreinte_planning"("date", "type_creneau");

-- CreateIndex
CREATE UNIQUE INDEX "cra_user_id_mois_annee_key" ON "cra"("user_id", "mois", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "cra_rh_recipients_resource_id_email_key" ON "cra_rh_recipients"("resource_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "cra_signatures_token_key" ON "cra_signatures"("token");

-- CreateIndex
CREATE UNIQUE INDEX "custom_event_participants_event_id_user_id_key" ON "custom_event_participants"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_types_code_key" ON "event_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_libelle_long_key" ON "locations"("libelle_long");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_codes_user_id_key" ON "mfa_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_poi_location" ON "poi"("location_id");

-- CreateIndex
CREATE INDEX "idx_poi_comments_poi" ON "poi_comments"("poi_id");

-- CreateIndex
CREATE UNIQUE INDEX "poi_ratings_poi_id_user_id_key" ON "poi_ratings"("poi_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_samu_assignments_resource_id_samu_key" ON "resource_samu_assignments"("resource_id", "samu");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_data_resource_id_date_key_type_key" ON "schedule_data"("resource_id", "date_key", "type");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
