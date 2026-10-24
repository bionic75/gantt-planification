// Génère prisma/<fournisseur>/schema.prisma (sqlite, postgresql, mysql) depuis prisma/schema.base.prisma.
// Usage : npm run db:schemas
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = fs.readFileSync(path.join(ROOT, 'prisma/schema.base.prisma'), 'utf8');

// Horodatage par défaut au format historique « AAAA-MM-JJ HH:MM:SS » (UTC)
const TIMESTAMP_DEFAULT = {
    sqlite: 'CURRENT_TIMESTAMP',
    postgresql: "to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')",
    mysql: "(date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s'))"
};
// Colonnes texte à valeur par défaut pouvant contenir de longs contenus (JSON, journaux)
const LARGE_WITH_DEFAULT = new Set(['periods', 'modifications']);

const header =
    provider => `// FICHIER GÉNÉRÉ par « npm run db:schemas » depuis prisma/schema.base.prisma : ne pas modifier.

generator client {
  provider            = "prisma-client"
  output              = "../../src/generated/prisma"
  moduleFormat        = "esm"
  importFileExtension = "ts"
}

datasource db {
  provider     = "${provider}"
  relationMode = "prisma"
}
`;

/** Champs String utilisés par un index ou une contrainte d'unicité (longueur bornée sous MySQL) */
function indexedFields(modelBody) {
    const fields = new Set();
    for (const m of modelBody.matchAll(/@@(?:unique|index)\(\[([^\]]+)\]/g)) {
        for (const f of m[1].split(',')) fields.add(f.trim());
    }
    for (const m of modelBody.matchAll(/^\s+(\w+)\s+String\??[^\n]*@unique/gm)) fields.add(m[1]);
    return fields;
}

function transform(provider) {
    const models = base.replace(/^(?:\/\/[^\n]*\n)+\n?/, ''); // retire l'en-tête de commentaires
    return models.replace(/^model \w+ \{\n[\s\S]*?\n\}/gm, model => {
        const indexed = indexedFields(model);
        return model
            .split('\n')
            .map(line => {
                const m = /^(\s+)(\w+)(\s+)String(\??)(\s+.*)?$/.exec(line);
                if (!m) return line;
                const [, indent, name, sp, opt] = m;
                let attrs = (m[5] || '').replace(/\s*\/\/\/ @timestamp/, '');
                const isTimestamp = line.includes('/// @timestamp');
                if (isTimestamp) {
                    attrs = attrs.replace(
                        /@default\(dbgenerated\("CURRENT_TIMESTAMP"\)\)/,
                        `@default(dbgenerated(${JSON.stringify(TIMESTAMP_DEFAULT[provider])}))`
                    );
                }
                if (provider === 'mysql') {
                    const literal = /@default\("([^"]*)"\)/.exec(attrs);
                    if (isTimestamp) attrs = ` @db.VarChar(19)${attrs}`;
                    else if (indexed.has(name)) attrs = ` @db.VarChar(191)${attrs}`;
                    else if (literal && LARGE_WITH_DEFAULT.has(name)) {
                        // MySQL / MariaDB : valeur par défaut d'une colonne TEXT sous forme d'expression
                        attrs = ` @db.LongText${attrs.replace(literal[0], `@default(dbgenerated("('${literal[1]}')"))`)}`;
                    } else if (literal) attrs = ` @db.VarChar(191)${attrs}`;
                    else attrs = ` @db.LongText${attrs}`;
                }
                return `${indent}${name}${sp}String${opt}${attrs.replace(/\s+$/, '')}`;
            })
            .join('\n');
    });
}

for (const provider of ['sqlite', 'postgresql', 'mysql']) {
    const file = path.join(ROOT, 'prisma', provider, 'schema.prisma');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, header(provider) + '\n' + transform(provider));
    console.log(`prisma/${provider}/schema.prisma`);
}
