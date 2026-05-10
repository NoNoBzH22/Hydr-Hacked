import { Request, Response, NextFunction } from 'express';

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if ((req.session as any).isLoggedIn) {
        next();
    } else {
        res.status(401).json({ error: "Non autorisé. Veuillez vous connecter." });
    }
};

export default authMiddleware;
