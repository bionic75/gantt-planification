// Aide à l'affectation : modèle PowerPoint et export PDF / PPTX du planning des déploiements
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { env as appEnv } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';
import { isolatePage, puppeteer } from '../../lib/puppeteer.js';
import { getJsonSetting } from '../../services/settings.js';

// Le modèle (.pptx) fournit titre, logo, pied de page… ; le planning est inséré en image centrée dans la zone libre de la diapositive « Titre et contenu ».
export const AFF_TPL_KEY = 'aff_ppt_template';

export const AFF_TPL_MAX = 25 * 1024 * 1024;

export const xmlEsc = v =>
    String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Modèle PowerPoint enregistré (nom, taille, analyse, contenu en base64) ; null si absent */
export const affTplLoad = () => getJsonSetting(AFF_TPL_KEY);

export const affTplMeta = t =>
    t
        ? { exists: true, name: t.name, size: t.size, uploadedAt: t.uploadedAt, uploadedBy: t.uploadedBy, info: t.info }
        : { exists: false };

export function affTplBoxOf(xml) {
    const m = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(xml);
    return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null;
}

// Formes d'un calque XML : placeholders (type, idx) et autres formes, avec leur position si elle est définie
export function affTplShapes(xml) {
    const out = [];
    for (const m of xml.matchAll(/<p:(sp|pic|graphicFrame)>[\s\S]*?<\/p:\1>/g)) {
        const sh = m[0],
            ph = /<p:ph([^>]*)\/?>/.exec(sh);
        const attr = (n, d) => {
            const a = ph && new RegExp(n + '="([^"]*)"').exec(ph[1]);
            return a ? a[1] : d;
        };
        out.push({ ph: ph ? { type: attr('type', 'body'), idx: attr('idx', '0') } : null, box: affTplBoxOf(sh) });
    }
    return out;
}

export const AFF_NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export async function affTplAnalyze(zip) {
    const pres = zip.file('ppt/presentation.xml');
    if (!pres) throw new HttpError(400, 'Fichier PowerPoint invalide (presentation.xml absent)');
    const presXml = await pres.async('string');
    const sz = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(presXml);
    if (!sz) throw new HttpError(400, 'Taille de diapositive introuvable');
    const W = +sz[1],
        H = +sz[2];
    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    const relTarget = {};
    for (const m of relsXml.matchAll(/<Relationship [^>]*>/g)) {
        const id = /Id="([^"]+)"/.exec(m[0]),
            tg = /Target="([^"]+)"/.exec(m[0]),
            ty = /Type="([^"]+)"/.exec(m[0]);
        if (id && tg && ty && /\/slide$/.test(ty[1])) relTarget[id[1]] = 'ppt/' + tg[1].replace(/^\/?(ppt\/)?/, '');
    }
    const slidePaths = [...presXml.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map(m => relTarget[m[1]]).filter(Boolean);
    if (!slidePaths.length) throw new HttpError(400, 'Le modèle ne contient aucune diapositive');
    // Diapositive de référence : la première qui porte un vrai titre (pas la page de garde) = « Titre et contenu »
    let base = null;
    for (const sp of slidePaths) {
        const xml = await zip.file(sp).async('string');
        if (/<p:ph type="title"/.test(xml)) {
            base = { path: sp, xml };
            break;
        }
    }
    if (!base)
        throw new HttpError(
            400,
            'Aucune diapositive « Titre et contenu » (avec un titre) dans le modèle : ajoutez-en une'
        );
    const relPath = base.path.replace('slides/', 'slides/_rels/') + '.rels';
    const slideRels = await zip.file(relPath).async('string');
    const lay = /Target="\.\.\/slideLayouts\/([^"]+)"/.exec(slideRels);
    const layoutXml = lay ? await zip.file('ppt/slideLayouts/' + lay[1]).async('string') : '';
    let masterXml = '';
    if (lay) {
        const lrels = zip.file('ppt/slideLayouts/_rels/' + lay[1] + '.rels');
        const mm = lrels && /Target="\.\.\/slideMasters\/([^"]+)"/.exec(await lrels.async('string'));
        if (mm) masterXml = await zip.file('ppt/slideMasters/' + mm[1]).async('string');
    }
    const layoutName = (/<p:cSld name="([^"]*)"/.exec(layoutXml) || [])[1] || '';
    // Page de garde (titre centré) et page de fin : première et dernière diapositives du modèle si ce ne sont pas la diapositive de référence
    let coverPath = null,
        endPath = null;
    if (slidePaths[0] !== base.path && /<p:ph type="ctrTitle"/.test(await zip.file(slidePaths[0]).async('string')))
        coverPath = slidePaths[0];
    const lastP = slidePaths[slidePaths.length - 1];
    if (lastP !== base.path && lastP !== coverPath) endPath = lastP;
    const sSh = affTplShapes(base.xml),
        lSh = affTplShapes(layoutXml),
        mSh = affTplShapes(masterXml);
    const resolve = ph => {
        const own = sSh.find(x => x.ph && x.ph.type === ph.type && x.ph.idx === ph.idx && x.box);
        if (own) return own.box;
        const l = lSh.find(
            x => x.ph && (x.ph.idx === ph.idx || x.ph.type === ph.type) && x.box && x.ph.type === ph.type
        );
        if (l) return l.box;
        const m = mSh.find(x => x.ph && x.ph.type === ph.type && x.box);
        return m ? m.box : null;
    };
    let top = 0,
        bottom = H;
    const phs = sSh.filter(x => x.ph).map(x => x.ph);
    lSh.filter(x => x.ph).forEach(x => {
        if (!phs.some(p => p.type === x.ph.type && p.idx === x.ph.idx)) phs.push(x.ph);
    });
    for (const ph of phs) {
        const b = resolve(ph);
        if (!b) continue;
        if (['title', 'body', 'subTitle', 'ctrTitle'].includes(ph.type) && b.y < H * 0.4)
            top = Math.max(top, b.y + b.h);
        if (['ftr', 'sldNum', 'dt'].includes(ph.type) && b.y > H * 0.6) bottom = Math.min(bottom, b.y);
    }
    // Autres formes (logo, pictogramme…) dans les bandes haute et basse
    for (const sh of [...sSh, ...lSh, ...mSh]) {
        if (sh.ph || !sh.box) continue;
        const b = sh.box;
        if (b.w >= W * 0.9 && b.h >= H * 0.9) continue; // fond plein écran
        if (b.y + b.h < H * 0.35) top = Math.max(top, b.y + b.h);
        else if (b.y > H * 0.7) bottom = Math.min(bottom, b.y);
    }
    // Repères de la diapositive (guides) : marges gauche / droite et haut
    const gv = [],
        gh = [];
    for (const m of presXml.matchAll(/<p15:guide id="\d+"([^>]*)>/g)) {
        const pos = /pos="(\d+)"/.exec(m[1]);
        if (!pos) continue;
        (/orient="horz"/.test(m[1]) ? gh : gv).push(+pos[1] * 1587.5);
    }
    let left = Math.round(W * 0.03),
        right = Math.round(W * 0.97);
    if (gv.length >= 2) {
        left = Math.round(Math.min(...gv));
        right = Math.round(Math.max(...gv));
    }
    const ghTop = gh.filter(g => g < H * 0.4);
    if (ghTop.length) top = Math.max(top, Math.round(Math.max(...ghTop)));
    top += 90000;
    bottom -= 60000;
    const zone = { x: left, y: top, w: right - left, h: bottom - top };
    if (zone.w < W * 0.3 || zone.h < H * 0.25)
        throw new HttpError(400, 'Zone libre trop petite sur la diapositive « Titre et contenu » du modèle');
    return { W, H, slidePaths, base, relPath, slideRels, zone, layoutName, coverPath, endPath };
}

export async function affTplBuild(tpl, pages, opt) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(Buffer.from(tpl.b64, 'base64'));
    const A = await affTplAnalyze(zip);
    const ct = 'ppt/presentation.xml';
    let presXml = await zip.file(ct).async('string');
    let relsXml = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    let ctXml = await zip.file('[Content_Types].xml').async('string');
    const readSlide = async sp => ({
        xml: await zip.file(sp).async('string'),
        rels: await zip.file(sp.replace('slides/', 'slides/_rels/') + '.rels').async('string')
    });
    const cover = opt.cover && A.coverPath ? await readSlide(A.coverPath) : null;
    const end = opt.end && A.endPath ? await readSlide(A.endPath) : null;
    // Retrait des diapositives d'origine et des parties d'historique de révision (qui référencent ces diapositives)
    for (const sp of A.slidePaths) {
        zip.remove(sp);
        zip.remove(sp.replace('slides/', 'slides/_rels/') + '.rels');
    }
    relsXml = relsXml.replace(/<Relationship [^>]*>/g, m =>
        /Type="[^"]*\/slide"/.test(m) || /(changesInfo|revisionInfo)/.test(m) ? '' : m
    );
    for (const f of ['ppt/changesInfos/changesInfo1.xml', 'ppt/revisionInfo.xml']) zip.remove(f);
    ctXml = ctXml
        .replace(/<Override PartName="\/ppt\/slides\/[^"]*"[^>]*\/>/g, '')
        .replace(/<Override PartName="\/ppt\/(changesInfos|revisionInfo)[^"]*"[^>]*\/>/g, '');
    const ids = [],
        rels = [],
        overrides = [];
    const z = A.zone;
    const setText = (xml, phMatch, text) =>
        xml.replace(
            new RegExp(
                '(<p:sp>(?:(?!</p:sp>)[\\s\\S])*?' +
                    phMatch +
                    '(?:(?!</p:sp>)[\\s\\S])*?<p:txBody>(?:(?!</p:txBody>)[\\s\\S])*?<a:lstStyle/>)[\\s\\S]*?(</p:txBody></p:sp>)'
            ),
            (m, a, b) => `${a}<a:p><a:r><a:rPr lang="fr-FR" dirty="0"/><a:t>${xmlEsc(text)}</a:t></a:r></a:p>${b}`
        );
    const finish = (xml, n) =>
        xml
            .replace(/JJ-MM-AAAA/g, opt.dateStr)
            .replace(/(<a:fld [^>]*type="slidenum"[^>]*>(?:(?!<\/a:fld>)[\s\S])*?<a:t>)\d+(<\/a:t>)/, `$1${n}$2`);
    let n = 0;
    const add = (xml, relXml, extraRel, media) => {
        n++;
        zip.file(`ppt/slides/slide${n}.xml`, xml);
        zip.file(
            `ppt/slides/_rels/slide${n}.xml.rels`,
            extraRel ? relXml.replace('</Relationships>', extraRel(n) + '</Relationships>') : relXml
        );
        if (media) zip.file(`ppt/media/planning_${n}.png`, media);
        ids.push(`<p:sldId id="${300 + n}" r:id="rIdPlanSld${n}"/>`);
        rels.push(`<Relationship Id="rIdPlanSld${n}" Type="${AFF_NS_REL}/slide" Target="slides/slide${n}.xml"/>`);
        overrides.push(
            `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
        );
    };
    if (cover) add(finish(setText(cover.xml, '<p:ph type="ctrTitle"/>', opt.title), n + 1), cover.rels);
    for (let i = 0; i < pages.length; i++) {
        let xml = A.base.xml;
        xml = setText(xml, '<p:ph type="title"/>', opt.title);
        xml = setText(xml, '<p:ph type="body"[^>]*idx="13"', (opt.subtitles && opt.subtitles[i]) || opt.subtitle || '');
        const pic = `<p:pic><p:nvPicPr><p:cNvPr id="900" name="Planning" descr="Planning des déploiements"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdPlanImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${z.x}" y="${z.y}"/><a:ext cx="${z.w}" cy="${z.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
        xml = finish(xml.replace('</p:spTree>', pic + '</p:spTree>'), n + 1);
        add(
            xml,
            A.slideRels,
            k => `<Relationship Id="rIdPlanImg" Type="${AFF_NS_REL}/image" Target="../media/planning_${k}.png"/>`,
            Buffer.from(pages[i], 'base64')
        );
    }
    if (end) add(finish(end.xml, n + 1), end.rels);
    presXml = presXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${ids.join('')}</p:sldIdLst>`);
    relsXml = relsXml.replace('</Relationships>', rels.join('') + '</Relationships>');
    ctXml = ctXml.replace('</Types>', overrides.join('') + '</Types>');
    zip.file(ct, presXml);
    zip.file('ppt/_rels/presentation.xml.rels', relsXml);
    zip.file('[Content_Types].xml', ctXml);
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Aperçu des diapositives du modèle (éléments positionnés : images, aplats, textes) pour la fenêtre d'export
export const AFF_MIME = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml'
};

export async function affTplPreview(tpl) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(Buffer.from(tpl.b64, 'base64'));
    const A = await affTplAnalyze(zip);
    const themeXml = zip.file('ppt/theme/theme1.xml') ? await zip.file('ppt/theme/theme1.xml').async('string') : '';
    const clr = {};
    for (const m of themeXml.matchAll(
        /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>\s*<a:(?:srgbClr val|sysClr val="[^"]*" lastClr)="([0-9A-Fa-f]{6})"/g
    ))
        clr[m[1]] = '#' + m[2];
    const alias = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
    const fonts = {
        major: (/<a:majorFont>\s*<a:latin typeface="([^"]*)"/.exec(themeXml) || [])[1],
        minor: (/<a:minorFont>\s*<a:latin typeface="([^"]*)"/.exec(themeXml) || [])[1]
    };
    const colorOf = frag => {
        if (!frag) return null;
        const m = /<a:solidFill>\s*<a:(srgbClr|schemeClr) val="([^"]+)"/.exec(frag);
        if (!m) return null;
        return m[1] === 'srgbClr' ? '#' + m[2] : clr[alias[m[2]] || m[2]] || null;
    };
    const attr = (str, n) => {
        const m = new RegExp('\\b' + n + '="([^"]*)"').exec(str || '');
        return m ? m[1] : null;
    };
    const relMap = async part => {
        const f = zip.file(part.replace(/([^/]+)$/, '_rels/$1.rels'));
        const out = {};
        if (f)
            for (const m of (await f.async('string')).matchAll(/<Relationship [^>]*>/g)) {
                const id = attr(m[0], 'Id'),
                    tg = attr(m[0], 'Target');
                if (id && tg) out[id] = tg;
            }
        return out;
    };
    const mediaUri = async (part, target) => {
        const full = path.posix.normalize(path.posix.join(path.posix.dirname(part), target));
        const ext = full.split('.').pop().toLowerCase(),
            f = zip.file(full);
        if (!f || !AFF_MIME[ext]) return null;
        return `data:${AFF_MIME[ext]};base64,` + (await f.async('nodebuffer')).toString('base64');
    };
    const txtStyles = async () => {
        const f = zip.file('ppt/slideMasters/slideMaster1.xml');
        return f ? await f.async('string') : '';
    };
    const masterXml = await txtStyles();
    const rpr = frag => {
        const m = /<a:(?:defRPr|rPr)([^>]*?)(?:\/>|>([\s\S]*?)<\/a:(?:defRPr|rPr)>)/.exec(frag || '');
        return m ? { a: m[1], i: m[2] || '' } : null;
    };
    const lvl1 = frag => {
        const m = /<a:lvl1pPr([^>]*)>([\s\S]*?)<\/a:lvl1pPr>/.exec(frag || '');
        return m ? { a: m[1], i: m[2] } : null;
    };
    const shapesOf = xml => [...xml.matchAll(/<p:(sp|pic)>[\s\S]*?<\/p:\1>/g)].map(m => ({ kind: m[1], xml: m[0] }));
    const phOf = sh => {
        const m = /<p:ph([^>]*)\/?>/.exec(sh);
        return m ? { type: attr(m[1], 'type') || 'body', idx: attr(m[1], 'idx') || '0' } : null;
    };
    const slideItems = async slidePath => {
        const slideXml = await zip.file(slidePath).async('string');
        const lay = /Target="\.\.\/slideLayouts\/([^"]+)"/.exec(
            await zip.file(slidePath.replace('slides/', 'slides/_rels/') + '.rels').async('string')
        );
        const layPath = 'ppt/slideLayouts/' + lay[1],
            layoutXml = await zip.file(layPath).async('string');
        const mp = 'ppt/slideMasters/slideMaster1.xml';
        const lSh = shapesOf(layoutXml),
            mSh = shapesOf(masterXml),
            sSh = shapesOf(slideXml);
        const items = [];
        const place = async (part, xml, listOnlyDecor) => {
            const rels = await relMap(part);
            for (const sh of shapesOf(xml)) {
                const ph = phOf(sh.xml),
                    box = affTplBoxOf(sh.xml);
                if (listOnlyDecor && ph) continue;
                if (!box && !ph) continue;
                if (sh.kind === 'pic') {
                    const rid =
                        attr((/<a:blip[^>]*>/.exec(sh.xml) || [])[0], 'r:embed') ||
                        (/svgBlip[^>]*r:embed="([^"]+)"/.exec(sh.xml) || [])[1];
                    const uri = rid && rels[rid] ? await mediaUri(part, rels[rid]) : null;
                    if (uri && box) items.push({ t: 'img', src: uri, ...box });
                    continue;
                }
                const fill = colorOf(
                    (/<p:spPr>[\s\S]*?<\/p:spPr>/.exec(sh.xml) || [''])[0].replace(/<a:ln[\s\S]*?<\/a:ln>/g, '')
                );
                const hasText = /<a:t>[^<]+<\/a:t>/.test(sh.xml);
                if (!ph && fill && box && !hasText) {
                    items.push({ t: 'rect', color: fill, ...box });
                    continue;
                }
                if (!hasText || (!box && !ph)) continue;
                items.push({ t: 'text', ph, sh: sh.xml, box });
            }
        };
        await place(mp, masterXml, true);
        await place(layPath, layoutXml, true);
        const slidePart = slidePath;
        const rels = await relMap(slidePart);
        for (const sh of sSh) {
            const ph = phOf(sh.xml),
                own = affTplBoxOf(sh.xml);
            if (sh.kind === 'pic') {
                const rid =
                    attr((/<a:blip[^>]*>/.exec(sh.xml) || [])[0], 'r:embed') ||
                    (/svgBlip[^>]*r:embed="([^"]+)"/.exec(sh.xml) || [])[1];
                const uri = rid && rels[rid] ? await mediaUri(slidePart, rels[rid]) : null;
                if (uri && own) items.push({ t: 'img', src: uri, ...own });
                continue;
            }
            let box = own;
            if (!box && ph) {
                const l =
                    lSh.find(x => {
                        const p = phOf(x.xml);
                        return (
                            p &&
                            p.type === ph.type &&
                            (p.idx === ph.idx || ph.type === 'title' || ph.type === 'ctrTitle') &&
                            affTplBoxOf(x.xml)
                        );
                    }) ||
                    lSh.find(x => {
                        const p = phOf(x.xml);
                        return p && p.type === ph.type && affTplBoxOf(x.xml);
                    });
                const m = mSh.find(x => {
                    const p = phOf(x.xml);
                    return p && p.type === ph.type && affTplBoxOf(x.xml);
                });
                box = affTplBoxOf((l || m || {}).xml || '');
            }
            if (!box) continue;
            // texte : paragraphes (retours à la ligne = <a:br/>), champ numéro de diapositive = {n}
            const paras = [...sh.xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map(p =>
                [
                    ...p[1]
                        .replace(/<a:fld [^>]*type="slidenum"[\s\S]*?<\/a:fld>/g, '<a:t>{n}</a:t>')
                        .matchAll(/<a:t>([^<]*)<\/a:t>|<a:br[ />]|<a:fld [^>]*type="slidenum"/g)
                ]
                    .map(t =>
                        t[0].startsWith('<a:br')
                            ? '\n'
                            : t[0].startsWith('<a:fld')
                              ? '{n}'
                              : t[1]
                                    .replace(/&amp;/g, '&')
                                    .replace(/&lt;/g, '<')
                                    .replace(/&gt;/g, '>')
                                    .replace(/&quot;/g, '"')
                    )
                    .join('')
            );
            const text = paras.join('\n');
            if (!text.trim() && !(ph && ['title', 'ctrTitle', 'body', 'subTitle'].includes(ph.type))) continue;
            // style : exécution de la diapositive, puis liste de styles du calque, puis du masque
            const lyr =
                ph &&
                lSh.find(x => {
                    const p = phOf(x.xml);
                    return p && p.type === ph.type && (p.idx === ph.idx || ph.type === 'title');
                });
            const msr =
                ph &&
                mSh.find(x => {
                    const p = phOf(x.xml);
                    return p && p.type === ph.type;
                });
            const stKey =
                ph && ['title', 'ctrTitle'].includes(ph.type)
                    ? 'titleStyle'
                    : ph && ['body', 'subTitle'].includes(ph.type)
                      ? 'bodyStyle'
                      : 'otherStyle';
            const stBlock = (new RegExp('<p:' + stKey + '>[\\s\\S]*?</p:' + stKey + '>').exec(masterXml) || [''])[0];
            const cands = [
                rpr(sh.xml.replace(/<a:lstStyle[\s\S]*?(<\/a:lstStyle>|\/>)/, '')),
                rpr(lvl1(sh.xml) && lvl1(sh.xml).i),
                rpr(lyr && lvl1(lyr.xml) && lvl1(lyr.xml).i),
                rpr(msr && lvl1(msr.xml) && lvl1(msr.xml).i),
                rpr(lvl1(stBlock) && lvl1(stBlock).i)
            ].filter(Boolean);
            const pick = f => {
                for (const c of cands) {
                    const v = f(c);
                    if (v != null) return v;
                }
                return null;
            };
            const lvls = [lvl1(sh.xml), lyr && lvl1(lyr.xml), msr && lvl1(msr.xml), lvl1(stBlock)].filter(Boolean);
            let font = pick(c => (/<a:latin typeface="([^"]*)"/.exec(c.i) || [])[1] || null);
            if (font === '+mj-lt') font = fonts.major;
            else if (font === '+mn-lt') font = fonts.minor;
            const bodyPr = [sh.xml, lyr && lyr.xml, msr && msr.xml]
                .map(x => /<a:bodyPr([^>]*)/.exec(x || ''))
                .find(m => m && attr(m[1], 'anchor'));
            items.push({
                t: 'text',
                role: ph ? (ph.type === 'body' && ph.idx === '13' ? 'subtitle13' : ph.type) : 'box',
                ...box,
                text,
                sz: +(pick(c => attr(c.a, 'sz')) || 1800),
                b: pick(c => attr(c.a, 'b')) === '1',
                color: pick(c => colorOf(c.i)) || clr.dk1 || '#222',
                font,
                algn: lvls.map(l => attr(l.a, 'algn')).find(Boolean) || 'l',
                anchor: bodyPr ? attr(bodyPr[1], 'anchor') : 't'
            });
        }
        return items.filter(x => x.t !== 'text' || x.role !== undefined);
    };
    const role = (path0, kind) => (path0 ? slideItems(path0).then(items => ({ kind, items })) : null);
    const slides = [];
    for (const sl of [await role(A.coverPath, 'cover'), await role(A.base.path, 'plan'), await role(A.endPath, 'end')])
        if (sl) slides.push(sl);
    return { W: A.W, H: A.H, zone: A.zone, slides };
}

// Conversion PowerPoint → PDF (nécessite LibreOffice sur le serveur)
export function affSofficePath() {
    if (appEnv.SOFFICE_PATH && fs.existsSync(appEnv.SOFFICE_PATH)) return appEnv.SOFFICE_PATH;
    return [
        '/usr/bin/soffice',
        '/usr/bin/libreoffice',
        '/usr/local/bin/soffice',
        '/opt/homebrew/bin/soffice',
        '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    ].find(x => fs.existsSync(x));
}

export async function affPptxToPdf(buf) {
    const exe = affSofficePath();
    if (!exe)
        throw new HttpError(
            501,
            "Export PDF avec modèle PowerPoint indisponible : LibreOffice n'est pas installé sur le serveur. Exportez en PowerPoint, ou décochez « Utiliser le modèle »."
        );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aff-tpl-'));
    try {
        fs.writeFileSync(path.join(dir, 'planning.pptx'), buf);
        await new Promise((resolve, reject) =>
            execFile(
                exe,
                [
                    '--headless',
                    '--norestore',
                    `-env:UserInstallation=file://${dir}/profile`,
                    '--convert-to',
                    'pdf',
                    '--outdir',
                    dir,
                    path.join(dir, 'planning.pptx')
                ],
                { timeout: 180000 },
                (e, so, se) =>
                    e
                        ? reject(
                              new HttpError(
                                  501,
                                  /No such file|ENOENT|not found/i.test(String(se) + e.message)
                                      ? "Export PDF avec modèle PowerPoint indisponible : LibreOffice n'est pas installé sur le serveur. Exportez en PowerPoint, ou décochez « Utiliser le modèle »."
                                      : 'Conversion PDF impossible : ' + String(se || e.message).slice(0, 200)
                              )
                          )
                        : resolve()
            )
        );
        return fs.readFileSync(path.join(dir, 'planning.pdf'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// Modèle de nom des fichiers exportés (PDF / PowerPoint) : jetons {AAAAMMJJ} {HHMM} {AAAA} {MM} {JJ} {HH} {MN} {DEBUT} {FIN} {ECHELLE} {TITRE}
export const AFF_NAME_KEY = 'aff_export_filename';

export const AFF_NAME_DEFAULT = 'SI-SAMU_Planning_Déploiement_{AAAAMMJJ}_{HHMM}';

// Chemin du navigateur : variable d'environnement (Docker), sinon Chrome / Chromium installé sur le poste (développement local)
export function affBrowserPath() {
    if (appEnv.PUPPETEER_EXECUTABLE_PATH) return appEnv.PUPPETEER_EXECUTABLE_PATH;
    return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome'
    ].find(x => fs.existsSync(x));
}

export async function affRenderPages(html, wPx, hPx, mode, wMm, hMm, transparent) {
    if (!puppeteer) throw new HttpError(503, 'Puppeteer non disponible sur ce serveur');
    const browser = await puppeteer.launch({
        executablePath: affBrowserPath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        headless: 'new',
        protocolTimeout: 180000
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({
            width: Math.ceil(wPx),
            height: Math.ceil(hPx),
            deviceScaleFactor: mode === 'pptx' ? 2 : 1
        });
        // HTML envoyé par le navigateur : ni JavaScript ni accès réseau (adresses internes, fichiers du serveur)
        await isolatePage(page);
        await page.setContent(html, { waitUntil: 'load' });
        // Puppeteer ≥ 22 renvoie des Uint8Array : conversion en Buffer (envoi HTTP et encodage base64)
        if (mode === 'pdf')
            return Buffer.from(
                await page.pdf({
                    width: `${wMm}mm`,
                    height: `${hMm}mm`,
                    printBackground: true,
                    margin: { top: 0, right: 0, bottom: 0, left: 0 },
                    preferCSSPageSize: true
                })
            );
        const shots = [];
        for (const el of await page.$$('.pg'))
            shots.push(
                Buffer.from(await el.screenshot({ type: 'png', omitBackground: !!transparent })).toString('base64')
            );
        return shots;
    } finally {
        await browser.close();
    }
}

export function affExportParams(req) {
    const b = req.body || {};
    const html = String(b.html || '');
    const wMm = Number(b.wMm),
        hMm = Number(b.hMm);
    if (!html || html.length > 45 * 1024 * 1024 || !(wMm >= 100 && wMm <= 1000) || !(hMm >= 100 && hMm <= 1000))
        throw new HttpError(400, "Paramètres d'export invalides");
    return {
        html,
        wMm,
        hMm,
        wPx: (wMm / 25.4) * 96,
        hPx: (hMm / 25.4) * 96,
        name: String(b.name || 'planning-deploiements')
            .replace(/[^\w\-]+/g, '_')
            .slice(0, 60)
    };
}

// Export avec modèle PowerPoint : les pages (planning + légende, fond transparent) sont insérées dans la diapositive « Titre et contenu » du modèle
export async function affExportWithTemplate(req, x) {
    const tpl = await affTplLoad();
    if (!tpl)
        throw new HttpError(
            400,
            "Aucun modèle PowerPoint n'est configuré (Administration › Modèle PowerPoint d'export)"
        );
    const t = (req.body && req.body.tpl) || {};
    const shots = await affRenderPages(x.html, x.wPx, x.hPx, 'pptx', x.wMm, x.hMm, true);
    const d = new Date(),
        pad = n => String(n).padStart(2, '0');
    const buf = await affTplBuild(tpl, shots, {
        title: String(t.title || 'Planning des déploiements des SAMU').slice(0, 200),
        subtitles: Array.isArray(t.subtitles) ? t.subtitles.map(v => String(v).slice(0, 300)) : [],
        dateStr: `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`,
        cover: !!t.cover,
        end: !!t.end
    });
    return { buf, pages: shots.length };
}
