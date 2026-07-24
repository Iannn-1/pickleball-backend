import { z } from 'zod';

const TIME_SLOT_REGEX = /^\d{2}:\d{2}$/;

export const createBookingSchema = z.object({
  courtId: z.string().uuid('courtId must be a valid UUID.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD.'),
  startSlot: z.string().regex(TIME_SLOT_REGEX, 'startSlot must be HH:MM.'),
  endSlot:   z.string().regex(TIME_SLOT_REGEX, 'endSlot must be HH:MM.'),
  players:   z.number().int().min(1).max(10).default(1),
});

export const submitPaymentSchema = z.object({
  paymentNote: z.string().min(1, 'paymentNote (reference) is required.'),
});

export const updateBookingStatusSchema = z.object({
  status: z.string().refine(
    (v) => ['pending', 'confirmed', 'cancelled', 'completed'].includes(v),
    { message: 'status must be pending, confirmed, cancelled, or completed.' }
  ),
});
