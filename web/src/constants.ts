// Centralized constants for political nuances, colors, and labels

export const NUANCE_COLORS: Record<string, string> = {
    // Extrême droite
    'RN': '#0D378A',      // Rassemblement National - Bleu marine
    'FN': '#0D378A',      // Front National (historique)
    'EXD': '#000033',     // Extrême droite
    'REC': '#182C4E',     // Reconquête!
    'UXD': '#0D378A',     // Union extrême droite

    // Droite
    'LR': '#0066CC',      // Les Républicains
    'UDI': '#00BFFF',     // Union des Démocrates et Indépendants
    'DVD': '#0099FF',     // Divers droite

    // Centre / Majorité présidentielle
    'ENS': '#F6B32D',     // Ensemble!
    'LREM': '#F6B32D',    // La République En Marche
    'MDM': '#E67E30',     // MoDem
    'HOR': '#00B0F0',     // Horizons
    'DVC': '#F6C35C',     // Divers centre

    // Gauche
    'SOC': '#FF3399',     // Parti Socialiste
    'UG': '#E60000',      // Union de la Gauche
    'NFP': '#E60000',     // Nouveau Front Populaire
    'RDG': '#FF99CC',     // Parti Radical de Gauche
    'DVG': '#FF6699',     // Divers gauche

    // Gauche radicale
    'FI': '#CC2443',      // La France Insoumise
    'LFI': '#CC2443',     // La France Insoumise (alternatif)
    'NUP': '#CC2443',     // NUPES
    'EXG': '#CC0000',     // Extrême gauche
    'DXG': '#AA0000',     // Divers extrême gauche
    'COM': '#DD0000',     // Parti Communiste

    // Écologistes
    'VEC': '#40C060',     // Les Écologistes
    'ECO': '#40C060',     // Écologistes

    // Divers
    'DSV': '#555555',     // Debout la France / Souverainistes
    'DIV': '#888888',     // Divers
    'AUT': '#888888',     // Autres
    'REG': '#777777',     // Régionalistes

    // Fallback
    'other': '#969696'
};

export const NUANCE_LABELS: Record<string, string> = {
    // Extrême droite
    'RN': 'Rassemblement National',
    'FN': 'Front National',
    'EXD': 'Extrême droite',
    'REC': 'Reconquête!',
    'UXD': 'Union extrême droite',

    // Droite
    'LR': 'Les Républicains',
    'UDI': 'UDI',
    'DVD': 'Divers droite',

    // Centre
    'ENS': 'Ensemble!',
    'LREM': 'Renaissance',
    'MDM': 'MoDem',
    'HOR': 'Horizons',
    'DVC': 'Divers centre',

    // Gauche
    'SOC': 'Parti Socialiste',
    'UG': 'Union de la Gauche',
    'NFP': 'Nouveau Front Populaire',
    'RDG': 'Radicaux de Gauche',
    'DVG': 'Divers gauche',

    // Gauche radicale
    'FI': 'La France Insoumise',
    'LFI': 'La France Insoumise',
    'NUP': 'NUPES',
    'EXG': 'Extrême gauche',
    'DXG': 'Extrême gauche',
    'COM': 'Parti Communiste',

    // Écologistes
    'VEC': 'Les Écologistes',
    'ECO': 'Écologistes',

    // Divers
    'DSV': 'Souverainistes',
    'DIV': 'Divers',
    'AUT': 'Autres',
    'REG': 'Régionalistes',

    'other': 'Autres'
};

// Couleurs pour le mode Abstention
export const ABSTENTION_COLORS = [
    { min: 0, max: 25, color: '#00B4D8', label: '< 25%' },
    { min: 25, max: 35, color: '#48CAE4', label: '25% - 35%' },
    { min: 35, max: 45, color: '#FFB703', label: '35% - 45%' },
    { min: 45, max: 55, color: '#FB8500', label: '45% - 55%' },
    { min: 55, max: 100, color: '#E63946', label: '> 55%' }
];

export const getColorForNuance = (nuance: string | undefined): string => {
    if (!nuance) return NUANCE_COLORS['other'];

    // Exact match
    if (NUANCE_COLORS[nuance]) return NUANCE_COLORS[nuance];

    // Partial matches for composite codes
    if (nuance.startsWith('UG')) return NUANCE_COLORS['UG'];
    if (nuance.startsWith('NFP')) return NUANCE_COLORS['NFP'];
    if (nuance.includes('RN')) return NUANCE_COLORS['RN'];
    if (nuance.includes('LR')) return NUANCE_COLORS['LR'];
    if (nuance.includes('SOC') || nuance.includes('PS')) return NUANCE_COLORS['SOC'];
    if (nuance.includes('FI') || nuance.includes('LFI')) return NUANCE_COLORS['FI'];
    if (nuance.includes('ECO') || nuance.includes('VEC')) return NUANCE_COLORS['ECO'];

    return NUANCE_COLORS['other'];
};

export const getLabelForNuance = (nuance: string | undefined): string => {
    if (!nuance) return NUANCE_LABELS['other'];
    if (NUANCE_LABELS[nuance]) return NUANCE_LABELS[nuance];
    return nuance; // Return the code itself if no label found
};

export const getColorForAbstention = (rate: number): string => {
    for (const bracket of ABSTENTION_COLORS) {
        if (rate >= bracket.min && rate < bracket.max) {
            return bracket.color;
        }
    }
    return ABSTENTION_COLORS[ABSTENTION_COLORS.length - 1].color;
};
