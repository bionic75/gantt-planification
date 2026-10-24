-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "action_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affectation_assignments" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "stage_key" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "affectation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affectation_history" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "samu_name" TEXT,
    "user_id" INTEGER,
    "user_name" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "affectation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affectation_projects" (
    "id" SERIAL NOT NULL,
    "samu_name" TEXT NOT NULL,
    "location_id" INTEGER,
    "chef_projet_id" INTEGER,
    "date_debut" TEXT NOT NULL,
    "date_mise_en_service" TEXT,
    "date_mise_en_production" TEXT,
    "periods" TEXT NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "updated_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "affectation_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "last_used_at" TEXT,
    "revoked" INTEGER DEFAULT 0,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_access" (
    "id" SERIAL NOT NULL,
    "app_key" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "app_user_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "astreinte_disponibilites" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "type_creneau" TEXT NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "astreinte_disponibilites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "astreinte_indisponibilites" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "type_creneau" TEXT NOT NULL,
    "motif" TEXT,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "astreinte_indisponibilites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "astreinte_planning" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "type_creneau" TEXT NOT NULL,
    "resource_id" INTEGER,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "astreinte_planning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "astreintes_hno" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT NOT NULL,
    "heure_debut" TEXT,
    "heure_fin" TEXT,
    "samu" TEXT,
    "tous_samu" INTEGER DEFAULT 0,
    "objet" TEXT NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "updated_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "astreintes_hno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_logs" (
    "id" SERIAL NOT NULL,
    "automation_id" INTEGER NOT NULL,
    "expert_id" INTEGER,
    "expert_name" TEXT,
    "expert_email" TEXT,
    "target_month" TEXT,
    "sent_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "recipients_list" TEXT,
    "file_content" TEXT,
    "filename" TEXT,

    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bons_commande" (
    "id" SERIAL NOT NULL,
    "intitule" TEXT NOT NULL,
    "titulaire" TEXT,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT NOT NULL,
    "nb_uo" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "created_by" INTEGER,
    "actif" INTEGER DEFAULT 1,
    "solde" INTEGER DEFAULT 0,
    "regularisation_cible_bdc_id" INTEGER,

    CONSTRAINT "bons_commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "username" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "login_time" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "modifications" TEXT DEFAULT '',

    CONSTRAINT "connection_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cra" (
    "id" SERIAL NOT NULL,
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
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
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
    "pdf_filename" TEXT,

    CONSTRAINT "cra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cra_diffusion_log" (
    "id" SERIAL NOT NULL,
    "cra_id" INTEGER NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_name" TEXT,
    "recipient_type" TEXT DEFAULT 'rh_es',
    "sent_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "email_batch_id" TEXT,

    CONSTRAINT "cra_diffusion_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cra_rh_recipients" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT,

    CONSTRAINT "cra_rh_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cra_signatures" (
    "id" SERIAL NOT NULL,
    "cra_id" INTEGER NOT NULL,
    "rang" INTEGER NOT NULL,
    "signer_user_id" INTEGER,
    "signer_name" TEXT NOT NULL,
    "signer_email" TEXT NOT NULL,
    "signed_at" TEXT NOT NULL DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "token" TEXT,
    "token_used" INTEGER DEFAULT 0,
    "token_expires_at" TEXT,

    CONSTRAINT "cra_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_event_external_participants" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "nom" TEXT,
    "prenom" TEXT,
    "email" TEXT,
    "added_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "custom_event_external_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_event_participants" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "added_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "custom_event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_events" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "config" TEXT,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "needs_resources" INTEGER DEFAULT 0,
    "resources_count" INTEGER DEFAULT 1,
    "type_id" INTEGER,
    "grist" INTEGER DEFAULT 0,
    "location_id" INTEGER,
    "period" TEXT DEFAULT 'FULL',

    CONSTRAINT "custom_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deplacements" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amoa_ced_id" INTEGER,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT NOT NULL,
    "samu" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "bon_commande_id" INTEGER,
    "nb_uo" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "a_regulariser" INTEGER DEFAULT 0,
    "regularisation_source_bdc_id" INTEGER,
    "commentaire" TEXT,
    "regularisation_cible_bdc_id" INTEGER,

    CONSTRAINT "deplacements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_config" (
    "id" SERIAL NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" INTEGER DEFAULT 0,
    "user" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "updated_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "email_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_queue" (
    "id" SERIAL NOT NULL,
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
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "processed_at" TEXT,
    "next_retry_at" TEXT,
    "cc_emails" TEXT,

    CONSTRAINT "email_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "label_long" TEXT NOT NULL,
    "label_short" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'tag',
    "bg_color" TEXT NOT NULL DEFAULT '#ffeb3b',
    "text_color" TEXT NOT NULL DEFAULT '#000000',
    "border_color" TEXT NOT NULL DEFAULT '#000000',
    "is_other" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expert_notifications" (
    "id" SERIAL NOT NULL,
    "expert_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "activity_name" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "is_read" INTEGER DEFAULT 0,

    CONSTRAINT "expert_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ics_events" (
    "id" SERIAL NOT NULL,
    "file_id" INTEGER NOT NULL,
    "event_date" TEXT NOT NULL,
    "event_end_date" TEXT,
    "summary" TEXT,
    "zone" TEXT,

    CONSTRAINT "ics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ics_files" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content" TEXT,
    "config" TEXT,
    "imported_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "ics_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" SERIAL NOT NULL,
    "libelle_long" TEXT NOT NULL,
    "libelle_court" TEXT NOT NULL,
    "adresse" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "updated_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "mfa_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_validations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "validated_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "mfa_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "used_at" TEXT,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_notifications" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "expert_id" INTEGER NOT NULL,
    "assignment_data" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "pending_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_push_messages" (
    "id" SERIAL NOT NULL,
    "to_user_id" INTEGER NOT NULL,
    "from_user_id" INTEGER NOT NULL,
    "from_name" TEXT,
    "from_photo" TEXT,
    "message" TEXT NOT NULL,
    "sent_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "pending_push_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poi" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "comment" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "osm_ref" TEXT,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "updated_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "poi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poi_comments" (
    "id" SERIAL NOT NULL,
    "poi_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "updated_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "poi_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poi_ratings" (
    "id" SERIAL NOT NULL,
    "poi_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "updated_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "poi_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_mad_history" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "taux" DOUBLE PRECISION NOT NULL,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "created_by" INTEGER,

    CONSTRAINT "resource_mad_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_mad_particularites" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "mad_history_id" INTEGER NOT NULL,
    "taux" DOUBLE PRECISION NOT NULL,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT NOT NULL,
    "motif" TEXT,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "created_by" INTEGER,

    CONSTRAINT "resource_mad_particularites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_samu_assignments" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "samu" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "resource_samu_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "trigramme" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "taux" DOUBLE PRECISION NOT NULL,
    "samu" TEXT NOT NULL,
    "actif" INTEGER DEFAULT 1,
    "date_debut" TEXT,
    "date_fin" TEXT,
    "es_rattachement" TEXT,
    "fonction" TEXT,
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "astreinte_volontaire" INTEGER DEFAULT 0,
    "date_fin_mad" TEXT,
    "jours_max_mad" INTEGER,
    "is_mad_volante" INTEGER DEFAULT 0,
    "contacts_rh" TEXT,
    "astreinte_date_activation" TEXT,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_data" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "date_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "notification" TEXT DEFAULT '0',
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "schedule_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "updated_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
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
    "created_at" TEXT DEFAULT to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'),
    "totp_secret" TEXT,
    "default_tab" TEXT DEFAULT 'planning',
    "profile_photo" TEXT,
    "trigramme" TEXT,
    "has_reporting_access" INTEGER DEFAULT 0,
    "amoa_ced" INTEGER DEFAULT 0,
    "is_rh" INTEGER DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
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
