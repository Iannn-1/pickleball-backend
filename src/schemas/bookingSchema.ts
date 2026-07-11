import { z } from 'zod';

export const createBookingSchema = z.object({
  courtId: z.string().uuid('courtId must be a valid UUID.'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.'),
  timeSlot: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'timeSlot must be in HH:MM format.'),
});

export const updateBookingStatusSchema = z.object({
  status: z
    .string()
    .refine((v) => ['confirmed', 'cancelled', 'pending'].includes(v), {
      message: 'status must be confirmed, cancelled, or pending.',
    }),
});
