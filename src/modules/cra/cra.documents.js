// Comptes rendus d'activité (CRA) : emails du circuit de validation, document signé (HTML) et PDF
import { env as appEnv } from '../../config/env.js';
import { puppeteer } from '../../lib/puppeteer.js';

export function buildCraEmailHtml({ title, expertNom, moisNom, craUrl, action }) {
    return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background-color:#6a1b9a;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h2 style="color:white;margin:0;">📝 Workflow CRA — ${title}</h2>
        </div>
        <div style="background-color:#f9f9f9;padding:20px;border:1px solid #e0e0e0;">
            <div style="background:white;border-left:4px solid #6a1b9a;padding:15px;margin:15px 0;border-radius:0 8px 8px 0;">
                <p style="margin:5px 0;"><strong>Expert :</strong> ${expertNom}</p>
                <p style="margin:5px 0;"><strong>Période :</strong> ${moisNom}</p>
            </div>
            <p>${action}</p>
            <div style="text-align:center;margin:20px 0;">
                <a href="${craUrl}" style="background-color:#6a1b9a;color:white;padding:12px 30px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Accéder au CRA</a>
            </div>
            <p style="color:#666;font-size:12px;">Ce lien vous connecte directement à l'application sur le CRA concerné.</p>
        </div>
    </div>`;
}

export const ANS_LOGO_B64 =
    'data:image/webp;base64,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';

// appUrl : accepté pour compatibilité des appels, non utilisé dans le document
export function buildCraDocumentHtml({
    cra,
    astreintes,
    signatures,
    moisNom,
    esRattachement,
    appUrl: _appUrl = '',
    logoSrc = ANS_LOGO_B64
}) {
    const lignes = astreintes
        .map(
            a => `<tr>
        <td style="padding:5px 8px;border:1px solid #ddd;white-space:nowrap;">${a.type === 'astreinte' ? 'Astreinte' : a.type === 'activite_courante' ? 'Activité courante' : 'HNO'}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;white-space:nowrap;">${a.date_debut}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;white-space:nowrap;">${a.date_fin}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;white-space:nowrap;">${a.heure_debut || ''} ${a.heure_fin ? '→ ' + a.heure_fin : ''}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;white-space:nowrap;">${a.samu || ''}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;">${a.objet || ''}</td>
    </tr>`
        )
        .join('');
    // Si la signature expert (rang=1) est absente mais le CRA a été soumis, l'injecter depuis les données CRA
    const effectiveSigs = [...signatures];
    if (!effectiveSigs.find(s => s.rang === 1) && cra.submitted_at) {
        effectiveSigs.unshift({
            rang: 1,
            signer_name: cra.expert_nom || '—',
            signed_at: cra.submitted_at,
            ip_address: null,
            _synthetic: true
        });
    }
    const sigsHtml = effectiveSigs
        .map(s => {
            const rang = s.rang === 1 ? 'Expert' : s.rang === 2 ? 'VISA N+1' : 'VISA N+2';
            return `<td style="width:33.33%;padding:14px;border:1px solid #6a1b9a;border-radius:6px;text-align:center;vertical-align:top;">
            <div style="font-size:11px;color:#666;margin-bottom:8px;">${rang}</div>
            <div style="font-weight:bold;color:#2c3e50;">${s.signer_name}</div>
            <div style="font-size:11px;color:#6a1b9a;margin-top:4px;">✅ Signé électroniquement</div>
            <div style="font-size:10px;color:#999;margin-top:4px;">${new Date(s.signed_at).toLocaleString('fr-FR')}</div>
            ${!s._synthetic ? `<div style="font-size:9px;color:#ccc;margin-top:2px;">IP : ${s.ip_address || 'N/A'}</div>` : ''}
        </td>`;
        })
        .join('');

    const esInfo = esRattachement
        ? `<p style="color:#444;font-size:13px;margin:4px 0 0 0;">Établissement de rattachement : <strong>${esRattachement}</strong></p>`
        : '';

    return `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;">

        <!-- EN-TÊTE ANS -->
        <div style="background:#1a237e;padding:16px 24px;border-radius:6px 6px 0 0;display:flex;align-items:center;gap:18px;margin-bottom:0;">
            <div style="flex:0 0 auto;">
                <img src="${logoSrc}" alt="ANS" height="48" style="display:block;">
            </div>
            <div>
                <div style="color:white;font-size:15px;font-weight:bold;letter-spacing:0.5px;">AGENCE DU NUMÉRIQUE EN SANTÉ</div>
                <div style="color:#90caf9;font-size:11px;margin-top:2px;">Programme SI-SAMU</div>
            </div>
        </div>

        <!-- TITRE DU DOCUMENT -->
        <div style="text-align:center;border:1px solid #1a237e;border-top:none;padding:18px 15px 14px;margin-bottom:20px;">
            <h1 style="color:#1a237e;margin:0;font-size:19px;letter-spacing:1px;">COMPTE-RENDU D'ACTIVITÉ</h1>
            <div style="color:#1a237e;font-size:12px;font-style:italic;margin:4px 0 6px;">Activités exceptionnelles, astreintes et interventions en heures ou jours non ouvrés</div>
            <h2 style="color:#2c3e50;margin:6px 0 4px;font-size:16px;">${cra.expert_nom} — ${moisNom}</h2>
            ${esInfo}
        </div>

        <!-- MESSAGE CONVENTION -->
        <div style="background:#e8eaf6;border-left:4px solid #1a237e;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;font-size:12px;color:#333;">
            Ce document est transmis dans le cadre de la <strong>convention liant l'Agence du Numérique en Santé (ANS) et ${esRattachement || "l'établissement de santé de rattachement de l'expert"}</strong>, relative à la mise à disposition d'un expert dans le cadre du programme SI-SAMU.<br>
            Il atteste de l'activité réalisée par l'expert pour la période concernée et a été signé électroniquement par les parties habilitées.
            <br><br>
            <strong>Pour rappel, le cadre de la convention tripartite relative à ces activités est le suivant :</strong><br><br>
            Sont dénommées « activités exceptionnelles » les prestations que l'agent mis à disposition peut être amené à réaliser, pour les besoins de l'ANS, en dehors de ses horaires habituels de travail, dans le cadre des missions suivantes et de façon non exhaustives :
            <ul style="margin:6px 0 6px 16px;padding:0;">
                <li>Les maintenances programmées des infrastructures et applications ;</li>
                <li>L'accompagnement des SAMU-SAS dans les phases de post-démarrage des outils SI-SAMU ;</li>
                <li>Le renfort capacitaire et organisationnel des équipes du support SI-SAMU.</li>
            </ul>
            Ces activités exceptionnelles peuvent relever :
            <ul style="margin:6px 0 0 16px;padding:0;">
                <li>Soit d'un régime d'astreinte, entendu comme une période durant laquelle l'agent, sans être sur son lieu de travail ni à la disposition permanente et immédiate de l'Agence, a l'obligation d'être en mesure d'intervenir pour effectuer un travail au service des missions visées à l'article 2 ;</li>
                <li>Soit d'interventions ponctuelles réalisées en heures ou jours non ouvrés, notamment en soirée, la nuit, les samedis, dimanches ou jours fériés, que l'agent soit placé ou non en situation d'astreinte préalable.</li>
            </ul>
        </div>

        <!-- TABLEAU DES ACTIVITÉS -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px;">
            <thead><tr style="background:#1a237e;color:white;">
                <th style="padding:5px 8px;border:1px solid #0d1757;text-align:left;white-space:nowrap;">Type</th>
                <th style="padding:5px 8px;border:1px solid #0d1757;text-align:left;white-space:nowrap;">Date début</th>
                <th style="padding:5px 8px;border:1px solid #0d1757;text-align:left;white-space:nowrap;">Date fin</th>
                <th style="padding:5px 8px;border:1px solid #0d1757;text-align:left;white-space:nowrap;">Heures</th>
                <th style="padding:5px 8px;border:1px solid #0d1757;text-align:left;white-space:nowrap;">SAMU</th>
                <th style="padding:5px 8px;border:1px solid #0d1757;text-align:left;white-space:nowrap;">Objet</th>
            </tr></thead>
            <tbody>${lignes || '<tr><td colspan="6" style="padding:15px;color:#999;text-align:center;">Aucune activité enregistrée</td></tr>'}</tbody>
        </table>
        ${cra.commentaire_expert ? `<div style="background:#f3e5f5;padding:12px 15px;border-radius:6px;margin-bottom:20px;border-left:3px solid #6a1b9a;"><strong style="font-size:12px;color:#6a1b9a;">Commentaire de l'expert :</strong><p style="margin:5px 0 0 0;font-size:13px;">${cra.commentaire_expert}</p></div>` : ''}

        <!-- SIGNATURES -->
        <div style="border-top:2px solid #1a237e;padding-top:20px;">
            <h3 style="color:#1a237e;font-size:13px;letter-spacing:0.5px;margin-bottom:15px;">SIGNATURES ÉLECTRONIQUES</h3>
            <table style="width:100%;border-collapse:separate;border-spacing:12px 0;table-layout:fixed;"><tr>${sigsHtml}</tr></table>
            <p style="font-size:10px;color:#999;margin-top:15px;font-style:italic;">Document généré électroniquement via la Plateforme de Planification ANS. Les signatures sont horodatées et enregistrées en base de données.</p>
        </div>
    </div>`;
}

export async function generateCraPdf(cra, astreintes, signatures, moisNom) {
    if (!puppeteer) throw new Error('Puppeteer non installé. Exécutez : npm install puppeteer');
    const html = buildCraPdfHtml({ cra, astreintes, signatures, moisNom });
    const browser = await puppeteer.launch({
        executablePath: appEnv.PUPPETEER_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        headless: 'new',
        protocolTimeout: 120000
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const pdf = await page.pdf({
            format: 'A4',
            margin: { top: '15mm', right: '15mm', bottom: '20mm', left: '15mm' },
            printBackground: true
        });
        // Puppeteer ≥ 22 renvoie un Uint8Array : res.send() le sérialiserait en JSON
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
}

export function buildCraPdfHtml({ cra, astreintes, signatures, moisNom }) {
    const now = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    const lignesHtml = astreintes.length
        ? astreintes
              .map(
                  (a, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9f4ff'};">
            <td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;color:${a.type === 'astreinte' ? '#e65100' : a.type === 'activite_courante' ? '#2e7d32' : '#1565c0'};">${a.type === 'astreinte' ? 'Astreinte' : a.type === 'activite_courante' ? 'Activité courante' : 'HNO'}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${a.date_debut ? new Date(a.date_debut).toLocaleDateString('fr-FR') : ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${a.date_fin ? new Date(a.date_fin).toLocaleDateString('fr-FR') : ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${a.heure_debut || ''} ${a.heure_fin ? '→ ' + a.heure_fin : ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${a.samu || ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${a.objet || ''}</td>
        </tr>`
              )
              .join('')
        : `<tr><td colspan="6" style="padding:15px;text-align:center;color:#999;border:1px solid #ddd;">Aucune activité enregistrée</td></tr>`;

    const sigsMap = { 1: null, 2: null, 3: null };
    signatures.forEach(s => {
        sigsMap[s.rang] = s;
    });
    const sigBlock = (rang, label) => {
        const s = sigsMap[rang];
        if (!s)
            return `<td style="border:1px solid #b39ddb;border-radius:6px;padding:12px;text-align:center;width:33%;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${label}</div>
            <div style="height:32px;border-bottom:1px dashed #ccc;margin-bottom:8px;"></div>
            <div style="font-size:10px;color:#bbb;">En attente</div></td>`;
        return `<td style="border:2px solid #6a1b9a;border-radius:6px;padding:12px;text-align:center;width:33%;background:#faf5ff;">
            <div style="font-size:10px;color:#6a1b9a;text-transform:uppercase;font-weight:bold;letter-spacing:0.5px;margin-bottom:6px;">${label}</div>
            <div style="font-weight:bold;font-size:12px;color:#2c3e50;margin-bottom:3px;">${s.signer_name}</div>
            <div style="font-size:10px;color:#27ae60;font-weight:bold;">Signé electroniquement</div>
            <div style="font-size:9px;color:#888;margin-top:3px;">${new Date(s.signed_at).toLocaleString('fr-FR')}</div>
            <div style="font-size:8px;color:#bbb;margin-top:2px;">IP : ${s.ip_address || 'N/A'}</div></td>`;
    };
    const moisCapitalize = moisNom.charAt(0).toUpperCase() + moisNom.slice(1);
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<style>* {box-sizing:border-box;margin:0;padding:0;} body{font-family:Arial,sans-serif;font-size:12px;color:#2c3e50;}</style>
</head><body style="padding:0;">
  <table style="width:100%;border-bottom:3px solid #6a1b9a;padding-bottom:12px;margin-bottom:16px;">
    <tr>
      <td style="width:200px;vertical-align:middle;">
        <div style="font-size:10px;font-weight:bold;color:#1D70B7;">AGENCE DU NUMÉRIQUE EN SANTÉ</div>
        <div style="font-size:8px;color:#888;">Programme SI-SAMU</div>
      </td>
      <td style="text-align:center;vertical-align:middle;">
        <div style="font-size:17px;font-weight:bold;color:#6a1b9a;text-transform:uppercase;letter-spacing:1px;">Compte-Rendu d'Activité</div>
        <div style="font-size:13px;color:#2c3e50;margin-top:4px;">${cra.expert_nom} — ${moisCapitalize}</div>
      </td>
      <td style="width:160px;text-align:right;vertical-align:top;font-size:9px;color:#888;">
        <div>Produit le ${now}</div>
      </td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
    <tr style="background:#f3e5f5;">
      <td style="padding:6px 10px;border:1px solid #d1b3e0;font-weight:bold;width:120px;">Expert</td>
      <td style="padding:6px 10px;border:1px solid #d1b3e0;">${cra.expert_nom}</td>
      <td style="padding:6px 10px;border:1px solid #d1b3e0;font-weight:bold;width:80px;">Période</td>
      <td style="padding:6px 10px;border:1px solid #d1b3e0;">${moisCapitalize}</td>
    </tr>
  </table>
  <div style="font-size:11px;font-weight:bold;color:#6a1b9a;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Activités Astreinte / HNO</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px;">
    <thead><tr style="background:#6a1b9a;color:white;">
      <th style="padding:7px 10px;border:1px solid #4a0e7a;text-align:left;">Type</th>
      <th style="padding:7px 10px;border:1px solid #4a0e7a;text-align:left;">Date début</th>
      <th style="padding:7px 10px;border:1px solid #4a0e7a;text-align:left;">Date fin</th>
      <th style="padding:7px 10px;border:1px solid #4a0e7a;text-align:left;">Heures</th>
      <th style="padding:7px 10px;border:1px solid #4a0e7a;text-align:left;">SAMU</th>
      <th style="padding:7px 10px;border:1px solid #4a0e7a;text-align:left;">Objet</th>
    </tr></thead>
    <tbody>${lignesHtml}</tbody>
  </table>
  ${cra.commentaire_expert ? `<div style="background:#f3e5f5;border-left:4px solid #6a1b9a;padding:10px 14px;margin-bottom:20px;font-size:11px;"><strong style="color:#6a1b9a;">Commentaire :</strong> ${cra.commentaire_expert}</div>` : ''}
  <div style="border-top:2px solid #6a1b9a;padding-top:14px;">
    <div style="font-size:11px;font-weight:bold;color:#6a1b9a;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Signatures Electroniques</div>
    <table style="width:100%;border-collapse:separate;border-spacing:8px;">
      <tr>${sigBlock(1, 'Expert')}${sigBlock(2, 'Visa N+1')}${sigBlock(3, 'Visa N+2')}</tr>
    </table>
    <p style="font-size:8px;color:#aaa;margin-top:10px;font-style:italic;">Document généré electroniquement via la Plateforme de Planification ANS. Signatures horodatées, enregistrées en base de données avec adresse IP et navigateur du signataire.</p>
  </div>
</body></html>`;
}
