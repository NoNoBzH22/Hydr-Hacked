import { ISource } from '../types/source.js';

/**
 * Les fichiers sources s'auto-enregistrent via `register()` au chargement du module
 * `initialize()` lance les health checks et ne garde que les sources fonctionnelles
 * Les routes et le state n'interagissent qu'avec les sources actives
 */
class SourceRegistry {
    private pending: ISource[] = [];
    private active = new Map<string, ISource>();

    /**
     * Enregistre une source dans la file d'attente.
     * Appelé automatiquement par chaque fichier source au chargement.
     */
    register(source: ISource) {
        this.pending.push(source);
    }

    /**
     * Lance les health checks sur toutes les sources en attente (en parallèle)
     * Seules les sources qui passent le check sont dites"active"
     */
    async initialize(): Promise<void> {
        console.log(`[Registry] ${this.pending.length} source(s) détectée(s), lancement des health checks...`);

        const results = await Promise.allSettled(
            this.pending.map(async (source) => {
                const healthy = await source.healthCheck();
                return { source, healthy };
            })
        );

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { source, healthy } = result.value;
                if (healthy) {
                    this.active.set(source.name, source);
                    console.log(`[Registry] ✅ ${source.name.toUpperCase()} — opérationnelle`);
                } else {
                    console.warn(`[Registry] ❌ ${source.name.toUpperCase()} — non disponible`);
                }
            } else {
                console.error(`[Registry] ❌ Health check crash:`, result.reason);
            }
        }

        this.pending = [];
        const names = this.getAvailableNames();
        console.log(`[Registry] ${this.active.size} source(s) active(s): ${names.length ? names.map(n => n.toUpperCase()).join(', ') : 'Aucune'}`);
    }

    get(name: string): ISource | null {
        return this.active.get(name) || null;
    }

    getAll(): ISource[] {
        return Array.from(this.active.values());
    }

    getAvailableNames(): string[] {
        return Array.from(this.active.keys());
    }

    getDefault(): ISource | null {
        const first = this.active.values().next();
        return first.done ? null : first.value;
    }

    has(name: string): boolean {
        return this.active.has(name);
    }
}

export const sourceRegistry = new SourceRegistry();
