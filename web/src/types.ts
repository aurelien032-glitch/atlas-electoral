export interface Election {
    id: string;
    label: string;
    type: string;
    round: string;
    available_levels: string[];
}

export interface SearchResult {
    level: string;
    label: string;
    code: string;
}

export interface HoverInfo {
    x: number;
    y: number;
    name: string;
    result?: ResultItem;
    winner?: WinnerItem;
}

export interface ChartHistoryItem {
    year: string | number;
    abstention: number;
    participation: number;
    Inscrits?: number;
    Abstentions?: number;
    Votants?: number;
}

export interface NuanceItem {
    Nuance: string;
    voix: number;
    percent?: string;
    fullName?: string;
    nom?: string;
    prenom?: string;
}

export interface ResultItem {
    code: string | number;
    Inscrits: number;
    Abstentions: number;
    Votants: number;
    Blancs: number;
    Nuls: number;
    [key: string]: unknown;
}

export interface WinnerItem {
    code: string | number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}
