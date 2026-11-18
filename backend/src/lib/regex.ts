// Expressions régulières saisies dans l'administration (filtre de noms des projets Asana)

/**
 * Quantificateurs imbriqués (« (a+)+ », « (\w*x)* », « ((a+))+ »…) : sur un texte qui ne correspond presque pas,
 * l'expression peut demander un temps exponentiel et bloquer le serveur (ReDoS). Analyse de la structure des groupes :
 * un groupe qui contient un quantificateur (+, *, {n,}) ne doit pas lui-même être suivi d'un quantificateur.
 * Heuristique : elle ne détecte pas toutes les expressions lentes (alternatives qui se recouvrent, « (a|a)* »).
 */
export function hasNestedQuantifier(pattern: string) {
    const isQuantifier = (c: string | undefined) => c === '+' || c === '*' || c === '{';
    const stack: boolean[] = [];
    let quantifiedInside = false;
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === '\\') {
            i++;
            continue;
        }
        if (c === '[') {
            // Classe de caractères : contenu sans structure
            for (i++; i < pattern.length && pattern[i] !== ']'; i++) if (pattern[i] === '\\') i++;
            continue;
        }
        if (c === '(') {
            stack.push(quantifiedInside);
            quantifiedInside = false;
        } else if (c === ')') {
            if (quantifiedInside && isQuantifier(pattern[i + 1])) return true;
            quantifiedInside = (stack.pop() ?? false) || quantifiedInside;
        } else if (isQuantifier(c)) {
            quantifiedInside = true;
        }
    }
    return false;
}
