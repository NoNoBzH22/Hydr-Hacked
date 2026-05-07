export type MediaType = 'movie' | 'series' | 'anime';

export interface SearchResult {
    title: string;
    year: string | null;
    image: string | null;
    hrefPath: string; // The identifier or path for the source
    type: MediaType;
    source: string; // 'zt' | 'hydracker'
    dwId?: string;  // Specific to DarkiWorld
}

export interface VideoLink {
    id: string | number;
    host: string;
    label?: string;
    url: string | null; // Final direct URL if available
    size?: string;
    sizeBytes?: number;
    quality?: string;
    langs?: string[];
    episode?: string | null;
}

export interface ContentLinks {
    links: VideoLink[];
    releaseNames?: string[];
    relatedSeasons?: { href: string; label: string }[];
}

export interface SeasonOption {
    label: string;
    value: string | number;
}

export interface SelectionData {
    links: VideoLink[];
    seasons: SeasonOption[];
    isSeries: boolean;
}

export interface ISource {
    name: string;
    search(query: string, mediaType?: MediaType): Promise<SearchResult[]>;
    getTrending(mediaType: MediaType): Promise<SearchResult[]>;
    getContentLinks(identifier: string, season?: number): Promise<ContentLinks>;

    /**
     * Vérifie si la source est utilisable (config valide + connectivité).
     * Appelé au démarrage par le registry. Seules les sources qui retournent true sont activées.
     */
    healthCheck(): Promise<boolean>;
    
    // Unified selection method
    getSelection(identifier: string, type?: string, seasonValue?: string | number): Promise<SelectionData>;
    
    /**
     * Résout un lien vers son URL finale téléchargeable.
     * Implémenté par les sources qui nécessitent une résolution en 2 étapes
     * (ex: Hydracker où l'ID doit être résolu via une API premium).
     * Les sources avec des URLs directes (ex: ZT) n'ont pas besoin de l'implémenter.
     */
    resolveLink?(linkId: string): Promise<string | null>;

    // Optional methods that might be source-specific but useful to standardize
    getSeasons?(identifier: string): Promise<number[]>;
    getEpisodes?(identifier: string, season: number): Promise<any[]>;
}
