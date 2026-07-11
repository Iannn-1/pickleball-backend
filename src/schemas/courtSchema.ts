import { z } from 'zod';

export const createCourtSchema = z.object({
  name: z.string().min(1, 'name is required.'),
  location: z.string().min(1, 'location is required.'),
  description: z.string().optional(),
});

export const updateCourtSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  description: z.string().optional(),
});
