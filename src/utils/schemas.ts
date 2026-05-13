import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const SelectContentSchema = z.object({
    hrefPath: z.string().min(1).max(500),
    title: z.string().min(1).max(300),
    type: z.string().max(50).optional(),
    source: z.string().min(1).max(50),
});

export const GetLinkSchema = z.object({
    chosenId: z.union([z.string().min(1).max(100), z.number()]),
    useJD: z.boolean().optional(),
});

export const SetSourcesSchema = z.object({
    sources: z.array(z.string().min(1).max(50)).max(50),
});

export const SelectSeasonSchema = z.object({
    seasonValue: z.string().min(1).max(100),
});

export const validate = (schema: z.ZodSchema) =>
    (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ error: 'Données invalides', issues: result.error.issues });
        }
        req.body = result.data;
        next();
    };
