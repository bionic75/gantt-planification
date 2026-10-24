// @ts-check
// Export du planning des déploiements (PDF, PowerPoint), modèle PowerPoint et modèle de nom des fichiers
import { badRequest } from '../../lib/http-error.js';
import { logUserAction } from '../../services/action-log.js';
import { deleteSettings, getSetting, setSetting } from '../../services/settings.js';
import {
    AFF_NAME_DEFAULT,
    AFF_NAME_KEY,
    AFF_TPL_KEY,
    AFF_TPL_MAX,
    affExportParams,
    affExportWithTemplate,
    affPptxToPdf,
    affRenderPages,
    affTplAnalyze,
    affTplLoad,
    affTplMeta,
    affTplPreview
} from './export.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

// ---------- Modèle PowerPoint ----------

export async function getTemplate(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(affTplMeta(await affTplLoad()));
}

export async function templatePreview(/** @type {Request} */ req, /** @type {Response} */ res) {
    const t = await affTplLoad();
    if (!t) return res.json({ exists: false });
    if (!t.preview) t.preview = await affTplPreview(t);
    res.json({ exists: true, ...t.preview });
}

/** Import du modèle (.pptx en base64) : analysé (diapositive de base, zone libre) puis enregistré */
export async function saveTemplate(/** @type {Request} */ req, /** @type {Response} */ res) {
    const name = String((req.body || {}).name || 'modele.pptx')
        .replace(/[^\w.\- ()[\]éèêàùçôîï]+/gi, '_')
        .slice(0, 120);
    const b64 = String((req.body || {}).data || '').replace(/^data:[^,]*,/, '');
    if (!/\.pptx$/i.test(name)) throw badRequest('Le modèle doit être un fichier PowerPoint (.pptx)');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 1000 || buf.length > AFF_TPL_MAX)
        throw badRequest('Fichier vide ou trop volumineux (25 Mo maximum)');
    const { default: JSZip } = await import('jszip');
    let zip;
    try {
        zip = await JSZip.loadAsync(buf);
    } catch {
        throw badRequest('Fichier PowerPoint illisible');
    }
    const A = await affTplAnalyze(zip);
    const mm = (/** @type {number} */ emu) => Math.round(emu / 360) / 100;
    const rec = {
        name,
        size: buf.length,
        uploadedAt: new Date().toISOString(),
        uploadedBy: (req.session && req.session.username) || null,
        info: {
            slideWidthMm: mm(A.W),
            slideHeightMm: mm(A.H),
            slides: A.slidePaths.length,
            baseSlide: A.slidePaths.indexOf(A.base.path) + 1,
            layout: A.layoutName,
            cover: !!A.coverPath,
            end: !!A.endPath,
            zone: { wMm: mm(A.zone.w), hMm: mm(A.zone.h), xMm: mm(A.zone.x), yMm: mm(A.zone.y) }
        },
        b64: buf.toString('base64')
    };
    await setSetting(AFF_TPL_KEY, JSON.stringify(rec));
    logUserAction(req, "Import du modèle PowerPoint d'export du planning", { name, size: buf.length });
    res.json(affTplMeta(rec));
}

export async function deleteTemplate(/** @type {Request} */ req, /** @type {Response} */ res) {
    await deleteSettings([AFF_TPL_KEY]);
    logUserAction(req, "Suppression du modèle PowerPoint d'export du planning", {});
    res.json({ exists: false });
}

// ---------- Modèle de nom des fichiers exportés ----------

export async function getNameConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ pattern: (await getSetting(AFF_NAME_KEY)) || AFF_NAME_DEFAULT, defaultPattern: AFF_NAME_DEFAULT });
}

export async function saveNameConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    const pattern = String((req.body || {}).pattern || '')
        .trim()
        .slice(0, 150);
    if (pattern) await setSetting(AFF_NAME_KEY, pattern);
    else await deleteSettings([AFF_NAME_KEY]);
    logUserAction(req, 'Modèle de nom des fichiers exportés du planning', { pattern: pattern || '(défaut)' });
    res.json({ pattern: pattern || AFF_NAME_DEFAULT, defaultPattern: AFF_NAME_DEFAULT });
}

// ---------- Exports ----------

const useTemplate = (/** @type {Request} */ req) => !!(req.body && req.body.tpl && req.body.tpl.use);

/** PDF : rendu des pages, ou modèle PowerPoint converti par LibreOffice */
export async function exportPdf(/** @type {Request} */ req, /** @type {Response} */ res) {
    const x = affExportParams(req);
    const pdf = useTemplate(req)
        ? await affPptxToPdf((await affExportWithTemplate(req, x)).buf)
        : await affRenderPages(x.html, x.wPx, x.hPx, 'pdf', x.wMm, x.hMm);
    logUserAction(req, 'Export PDF du planning des déploiements', { modele: useTemplate(req) });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${x.name}.pdf"`);
    res.send(Buffer.from(/** @type {any} */ (pdf)));
}

/** PowerPoint : pages insérées dans le modèle, ou une diapositive (image) par page */
export async function exportPptx(/** @type {Request} */ req, /** @type {Response} */ res) {
    const x = affExportParams(req);
    let buf;
    let pages;
    if (useTemplate(req)) ({ buf, pages } = await affExportWithTemplate(req, x));
    else {
        const shots = /** @type {string[]} */ (await affRenderPages(x.html, x.wPx, x.hPx, 'pptx', x.wMm, x.hMm));
        const { default: PptxGenJS } = await import('pptxgenjs');
        const pptx = new PptxGenJS();
        pptx.defineLayout({ name: 'PAGE', width: x.wMm / 25.4, height: x.hMm / 25.4 });
        pptx.layout = 'PAGE';
        pptx.title = 'Planning des déploiements';
        for (const b64 of shots) {
            pptx.addSlide().addImage({ data: 'image/png;base64,' + b64, x: 0, y: 0, w: x.wMm / 25.4, h: x.hMm / 25.4 });
        }
        buf = await pptx.write({ outputType: 'nodebuffer' });
        pages = shots.length;
    }
    logUserAction(req, 'Export PowerPoint du planning des déploiements', { pages, modele: useTemplate(req) });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${x.name}.pptx"`);
    res.send(Buffer.from(/** @type {any} */ (buf)));
}
