import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema } from 'zod';

/**
 * Returns an Express middleware that validates req.body against a Zod schema.
 * Responds 422 with formatted errors on failure.
 */
export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(422).json({ error: 'Validation failed', details: errors });
    }
    req.body = result.data;
    return next();
  };
