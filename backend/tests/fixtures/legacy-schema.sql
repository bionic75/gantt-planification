-- Schéma de la base créé par l'ancienne version (initDB, avant les migrations Prisma), utilisé pour tester
-- l'adoption des bases existantes (scripts/db-adopt.mjs). Ne pas modifier.

CREATE TABLE action_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action_type TEXT NOT NULL,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

CREATE TABLE affectation_assignments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    stage_key TEXT NOT NULL,
                    resource_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(project_id, stage_key, resource_id)
                );

CREATE TABLE affectation_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    samu_name TEXT,
                    user_id INTEGER,
                    user_name TEXT,
                    action TEXT NOT NULL,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

CREATE TABLE affectation_projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    samu_name TEXT NOT NULL,
                    location_id INTEGER,
                    chef_projet_id INTEGER,
                    date_debut TEXT NOT NULL,
                    date_mise_en_service TEXT,
                    date_mise_en_production TEXT,
                    periods TEXT NOT NULL DEFAULT '{}',
                    created_by INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

CREATE TABLE api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            key_prefix TEXT NOT NULL,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used_at DATETIME,
            revoked INTEGER DEFAULT 0
        );

CREATE TABLE app_user_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_key TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(app_key, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

CREATE TABLE astreinte_disponibilites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            type_creneau TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            UNIQUE(resource_id, date)
        );

CREATE TABLE astreinte_indisponibilites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            type_creneau TEXT NOT NULL,
            motif TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            UNIQUE(resource_id, date, type_creneau)
        );

CREATE TABLE astreinte_planning (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            type_creneau TEXT NOT NULL,
            resource_id INTEGER,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            UNIQUE(date, type_creneau)
        );

CREATE TABLE astreintes_hno (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('astreinte', 'hno', 'activite_courante')),
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            heure_debut TIME,
            heure_fin TIME,
            samu TEXT,
            tous_samu INTEGER DEFAULT 0,
            objet TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

CREATE TABLE automation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            automation_id INTEGER NOT NULL,
            expert_id INTEGER,
            expert_name TEXT,
            expert_email TEXT,
            target_month TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            recipients_list TEXT,
            file_content TEXT,
            filename TEXT
        );

CREATE TABLE bons_commande (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intitule TEXT NOT NULL,
            titulaire TEXT,
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            nb_uo INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            actif INTEGER DEFAULT 1, solde INTEGER DEFAULT 0, regularisation_cible_bdc_id INTEGER,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

CREATE TABLE connection_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT NOT NULL,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL,
            profile TEXT NOT NULL,
            login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            modifications TEXT DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

CREATE TABLE cra (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            resource_id INTEGER,
            mois INTEGER NOT NULL,
            annee INTEGER NOT NULL,
            statut TEXT NOT NULL DEFAULT 'a_completer',
            commentaire_expert TEXT,
            submitted_at DATETIME,
            vise_n1_at DATETIME,
            vise_n1_by INTEGER,
            vise_n2_at DATETIME,
            vise_n2_by INTEGER,
            diffuse_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, rien_a_declarer INTEGER DEFAULT 0, commentaire_refus TEXT, refuse_by INTEGER, refuse_at DATETIME, deleted INTEGER DEFAULT 0, pre_delete_statut TEXT, pre_delete_archived INTEGER, modifie_admin_at TEXT, modifie_admin_nom TEXT, archived INTEGER DEFAULT 0, pdf_filename TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, mois, annee)
        );

CREATE TABLE cra_diffusion_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cra_id INTEGER NOT NULL,
            recipient_email TEXT NOT NULL,
            recipient_name TEXT,
            recipient_type TEXT DEFAULT 'rh_es',
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            email_batch_id TEXT,
            FOREIGN KEY (cra_id) REFERENCES cra(id) ON DELETE CASCADE
        );

CREATE TABLE cra_rh_recipients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            email TEXT NOT NULL,
            nom TEXT,
            UNIQUE(resource_id, email),
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        );

CREATE TABLE cra_signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cra_id INTEGER NOT NULL,
            rang INTEGER NOT NULL,
            signer_user_id INTEGER,
            signer_name TEXT NOT NULL,
            signer_email TEXT NOT NULL,
            signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            user_agent TEXT,
            token TEXT UNIQUE,
            token_used INTEGER DEFAULT 0,
            token_expires_at DATETIME,
            FOREIGN KEY (cra_id) REFERENCES cra(id) ON DELETE CASCADE
        );

CREATE TABLE custom_event_external_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        nom TEXT,
        prenom TEXT,
        email TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES custom_events(id) ON DELETE CASCADE
    );

CREATE TABLE custom_event_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES custom_events(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(event_id, user_id)
    );

CREATE TABLE custom_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        config TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    , needs_resources INTEGER DEFAULT 0, resources_count INTEGER DEFAULT 1, type_id INTEGER, grist INTEGER DEFAULT 0, location_id INTEGER, period TEXT DEFAULT 'FULL');

CREATE TABLE deplacements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amoa_ced_id INTEGER,
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            samu TEXT NOT NULL,
            ville TEXT NOT NULL,
            bon_commande_id INTEGER,
            nb_uo INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, a_regulariser INTEGER DEFAULT 0, regularisation_source_bdc_id INTEGER, commentaire TEXT, regularisation_cible_bdc_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (amoa_ced_id) REFERENCES resources(id),
            FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id)
        );

CREATE TABLE email_config (
            id INTEGER PRIMARY KEY,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            secure INTEGER DEFAULT 0,
            user TEXT NOT NULL,
            password TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE email_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id TEXT NOT NULL,
            recipient_email TEXT NOT NULL,
            recipient_name TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            sender_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            html_body TEXT NOT NULL,
            ics_content TEXT,
            ics_method TEXT,
            ics_filename TEXT,
            pdf_attachment TEXT,
            pdf_filename TEXT,
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 3,
            error_message TEXT,
            action_type TEXT,
            resource_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME,
            next_retry_at DATETIME
        , cc_emails TEXT);

CREATE TABLE event_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        label_long TEXT NOT NULL,
        label_short TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'tag',
        bg_color TEXT NOT NULL DEFAULT '#ffeb3b',
        text_color TEXT NOT NULL DEFAULT '#000000',
        border_color TEXT NOT NULL DEFAULT '#000000',
        is_other INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE expert_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expert_id INTEGER NOT NULL,
            date DATE NOT NULL,
            period TEXT NOT NULL,
            activity_name TEXT NOT NULL,
            requester_name TEXT NOT NULL,
            action_type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_read INTEGER DEFAULT 0,
            FOREIGN KEY (expert_id) REFERENCES users(id)
        );

CREATE TABLE ics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            event_date TEXT NOT NULL,
            event_end_date TEXT,
            summary TEXT,
            zone TEXT,
            FOREIGN KEY (file_id) REFERENCES ics_files(id) ON DELETE CASCADE
        );

CREATE TABLE ics_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            filename TEXT NOT NULL,
            content TEXT,
            config TEXT,
            imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            libelle_long TEXT NOT NULL UNIQUE,
            libelle_court TEXT NOT NULL,
            adresse TEXT,
            latitude REAL,
            longitude REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE mfa_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            code TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE mfa_validations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            validated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

CREATE TABLE pending_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            resource_id INTEGER NOT NULL,
            expert_id INTEGER NOT NULL,
            assignment_data TEXT NOT NULL,
            created_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            FOREIGN KEY (expert_id) REFERENCES users(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

CREATE TABLE pending_push_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            to_user_id INTEGER NOT NULL,
            from_user_id INTEGER NOT NULL,
            from_name TEXT,
            from_photo TEXT,
            message TEXT NOT NULL,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (to_user_id) REFERENCES users(id),
            FOREIGN KEY (from_user_id) REFERENCES users(id)
        );

CREATE TABLE poi (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            location_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            latitude REAL,
            longitude REAL,
            comment TEXT,
            website TEXT,
            phone TEXT,
            osm_ref TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE poi_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poi_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE poi_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poi_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            rating INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (poi_id, user_id)
        );

CREATE TABLE resource_mad_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            taux REAL NOT NULL,
            date_debut TEXT NOT NULL,
            date_fin TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

CREATE TABLE resource_mad_particularites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            mad_history_id INTEGER NOT NULL,
            taux REAL NOT NULL,
            date_debut TEXT NOT NULL,
            date_fin TEXT NOT NULL,
            motif TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            FOREIGN KEY (mad_history_id) REFERENCES resource_mad_history(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

CREATE TABLE resource_samu_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            samu TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('principal','secondaire')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(resource_id, samu),
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        );

CREATE TABLE resources (
        id INTEGER PRIMARY KEY,
        nom TEXT NOT NULL,
        prenom TEXT NOT NULL,
        trigramme TEXT NOT NULL,
        email TEXT,
        telephone TEXT,
        taux REAL NOT NULL,
        samu TEXT NOT NULL,
        actif INTEGER DEFAULT 1,
        date_debut TEXT,
        date_fin TEXT,
        es_rattachement TEXT,
        fonction TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    , astreinte_volontaire INTEGER DEFAULT 0, date_fin_mad TEXT, jours_max_mad INTEGER, is_mad_volante INTEGER DEFAULT 0, contacts_rh TEXT, astreinte_date_activation TEXT);

CREATE TABLE schedule_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            date_key TEXT NOT NULL,
            type TEXT NOT NULL,
            value TEXT NOT NULL,
            notification TEXT DEFAULT '0',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(resource_id, date_key, type)
        );

CREATE TABLE settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL
        );

CREATE TABLE system_config (
            id INTEGER PRIMARY KEY,
            version TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL,
            email TEXT NOT NULL,
            telephone TEXT,
            is_admin INTEGER DEFAULT 0,
            is_expert INTEGER DEFAULT 0,
            is_user INTEGER DEFAULT 0,
            resource_id INTEGER,
            actif INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        , totp_secret TEXT, default_tab TEXT DEFAULT 'planning', profile_photo TEXT, trigramme TEXT, has_reporting_access INTEGER DEFAULT 0, amoa_ced INTEGER DEFAULT 0, is_rh INTEGER DEFAULT 0);

CREATE INDEX idx_aff_hist_project ON affectation_history (project_id, id);

CREATE INDEX idx_poi_comments_poi ON poi_comments(poi_id);

CREATE INDEX idx_poi_location ON poi(location_id);
