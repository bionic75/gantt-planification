// Document d'un CRA en cours (avant le visa N2), produit par le navigateur : page à imprimer ou enregistrer en PDF,
// ouverte dans une nouvelle fenêtre. Les CRA visés N2 ou diffusés ont un PDF signé enregistré sur le serveur.
import type { DetailCra } from '@/api/cra';
import { libelleMois, majuscule, typeLigne } from './calculs';
import { LOGO_ANS } from './logo';

/** Texte inséré dans la page : caractères HTML neutralisés */
const t = (v: unknown) =>
    String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const date = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

const STATUTS_DOCUMENT: Record<string, string> = {
    a_completer: 'À compléter',
    soumis: 'Soumis',
    vise_n1: 'Visé N1',
    vise_n2: 'Visé N2',
    diffuse: 'Diffusé'
};

const STYLE = `
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;font-size:11px;color:#2c3e50;padding:15mm;}
  @media print{body{padding:0;}@page{margin:15mm;}}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6a1b9a;padding-bottom:12px;margin-bottom:14px;}
  .header-logo{font-size:13px;font-weight:bold;color:#1D70B7;line-height:1.4;}
  .header-logo img{height:60px;width:auto;}
  .header-title{text-align:center;flex:1;padding:0 20px;}
  .header-title h1{font-size:16px;font-weight:bold;color:#6a1b9a;text-transform:uppercase;letter-spacing:1px;}
  .header-title h2{font-size:12px;color:#2c3e50;margin-top:4px;}
  .header-meta{font-size:9px;color:#888;text-align:right;}
  .info-table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10px;}
  .info-table td{padding:5px 8px;border:1px solid #d1b3e0;}
  .info-table tr{background:#f3e5f5;}
  .info-table td:first-child{font-weight:bold;width:100px;}
  .info-table td.label{font-weight:bold;width:80px;}
  .info-table td.statut{color:#6a1b9a;font-weight:bold;}
  .section-title{font-size:10px;font-weight:bold;color:#6a1b9a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;}
  table.activites{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10px;}
  table.activites th{background:#6a1b9a;color:white;padding:6px 8px;text-align:left;border:1px solid #4a0e7a;}
  table.activites td{padding:5px 8px;border:1px solid #ddd;}
  table.activites tr.odd td{background:#f9f4ff;}
  .type-astreinte{font-weight:bold;color:#e65100;}
  .type-hno{font-weight:bold;color:#1565c0;}
  .empty-row{text-align:center;color:#999;padding:12px;}
  .commentaire{background:#f3e5f5;border-left:4px solid #6a1b9a;padding:8px 12px;margin-bottom:14px;font-size:10px;}
  .commentaire strong{color:#6a1b9a;}
  .signatures{border-top:2px solid #6a1b9a;padding-top:12px;}
  .sigs{display:flex;gap:10px;margin-top:12px;}
  .sig-box{flex:1;border:1px solid #b39ddb;border-radius:5px;padding:10px;text-align:center;}
  .sig-box.done{border:2px solid #6a1b9a;background:#faf5ff;}
  .sig-label{font-size:9px;color:#6a1b9a;text-transform:uppercase;font-weight:bold;margin-bottom:6px;letter-spacing:0.5px;}
  .sig-line{height:28px;border-bottom:1px dashed #ccc;margin-bottom:6px;}
  .sig-pending{font-size:9px;color:#bbb;}
  .sig-name{font-weight:bold;font-size:11px;color:#2c3e50;margin-bottom:3px;}
  .sig-ok{font-size:9px;color:#27ae60;font-weight:bold;}
  .sig-date{font-size:9px;color:#888;margin-top:2px;}
  .sig-ip{font-size:8px;color:#bbb;margin-top:1px;}
  .footer-note{font-size:8px;color:#aaa;margin-top:10px;font-style:italic;border-top:1px solid #eee;padding-top:6px;}
  .print-btn{position:fixed;top:10px;right:10px;background:#6a1b9a;color:white;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;z-index:999;}
  @media print{.print-btn{display:none;}}`;

/** Page HTML du document */
export function pageDocument(cra: DetailCra, maintenant = new Date()): string {
    const mois = majuscule(libelleMois(Number(cra.mois), Number(cra.annee)));
    const produit = maintenant.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    const parRang = new Map((cra.signatures ?? []).map(s => [s.rang, s]));
    const signature = (rang: 1 | 2 | 3, libelle: string) => {
        const s = parRang.get(rang);
        if (!s)
            return `<div class="sig-box empty"><div class="sig-label">${libelle}</div><div class="sig-line"></div><div class="sig-pending">En attente</div></div>`;
        return `<div class="sig-box done"><div class="sig-label">${libelle}</div>
                        <div class="sig-name">${t(s.signer_name)}</div>
                        <div class="sig-ok">✅ Signé électroniquement</div>
                        <div class="sig-date">${new Date(s.signed_at).toLocaleString('fr-FR')}</div>
                        <div class="sig-ip">IP : ${t(s.ip_address || 'N/A')}</div></div>`;
    };
    const lignes = cra.astreintes_hno ?? [];
    const corps = lignes.length
        ? lignes
              .map(
                  (a, i) => `<tr class="${i % 2 ? 'odd' : ''}">
                        <td class="type-${t(a.type)}">${typeLigne(a.type).icone} ${typeLigne(a.type).libelle}</td>
                        <td>${date(a.date_debut)}</td>
                        <td>${date(a.date_fin)}</td>
                        <td>${t(a.heure_debut || '')} ${a.heure_fin ? '→ ' + t(a.heure_fin) : ''}</td>
                        <td>${t(a.samu || '')}</td>
                        <td>${t(a.objet || '')}</td>
                    </tr>`
              )
              .join('')
        : `<tr><td colspan="6" class="empty-row">Aucune activité enregistrée</td></tr>`;
    const statut = STATUTS_DOCUMENT[cra.statut] ?? cra.statut;

    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>CRA ${t(cra.expert_nom)} - ${mois}</title>
<style>${STYLE}
</style>
</head><body>
<button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button>

<div class="header">
  <div class="header-logo"><img src="${LOGO_ANS}" alt="ANS"></div>
  <div class="header-title">
    <h1>Compte-Rendu d'Activité</h1>
    <h2>${t(cra.expert_nom || '')} — ${mois}</h2>
  </div>
  <div class="header-meta">Produit le ${produit}</div>
</div>

<table class="info-table">
  <tr>
    <td>Expert</td><td>${t(cra.expert_nom || '')}</td>
    <td class="label">Période</td><td>${mois}</td>
  </tr>
  <tr>
    <td>Établissement</td><td>${t(cra.es_rattachement || '—')}</td>
    <td class="label">SAMU</td><td>${t(cra.expert_samu || '—')}</td>
  </tr>
  <tr>
    <td>Statut</td>
    <td colspan="3" class="statut">${t(statut)}</td>
  </tr>
</table>

<div class="section-title">📋 Activités Astreinte / HNO</div>
<table class="activites">
  <thead><tr>
    <th>Type</th><th>Date début</th><th>Date fin</th><th>Heures</th><th>SAMU</th><th>Objet</th>
  </tr></thead>
  <tbody>${corps}</tbody>
</table>

${cra.commentaire_expert ? `<div class="commentaire"><strong>Commentaire :</strong> ${t(cra.commentaire_expert)}</div>` : ''}

<div class="signatures">
  <div class="section-title">✍️ Signatures Électroniques</div>
  <div class="sigs">
    ${signature(1, 'Expert')}
    ${signature(2, 'Visa N+1')}
    ${signature(3, 'Visa N+2')}
  </div>
  <div class="footer-note">Document généré électroniquement via la Plateforme de Planification ANS. Signatures horodatées et enregistrées en base de données avec adresse IP et navigateur du signataire.</div>
</div>
</body></html>`;
}

/** Document ouvert dans une nouvelle fenêtre ; false si le navigateur a bloqué la fenêtre */
export function ouvrirDocument(cra: DetailCra): boolean {
    const fenetre = window.open('', '_blank');
    if (!fenetre) return false;
    fenetre.document.write(pageDocument(cra));
    fenetre.document.close();
    return true;
}
