import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string | undefined;
    role?: string | undefined;
  };
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Session invalid or expired.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      // Role stored in Supabase user_metadata: { role: 'admin' } or app_metadata
      role: (user.app_metadata?.['role'] as string | undefined) ??
            (user.user_metadata?.['role'] as string | undefined) ??
            'user',
    };

    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Internal authentication failure.' });
  }
};

/**
 * Middleware that runs AFTER requireAuth.
 * Blocks the request if the user does not have the 'admin' role.
 */
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  return next();
};
