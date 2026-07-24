import { z } from 'zod';

export const createCourtSchema = z.object({
  name:        z.string().min(1, 'name is required.'),
  displayName: z.string().min(1, 'displayName is required.'),
  sport:       z.string().min(1).default('Pickleball'),
  location:    z.string().min(1, 'location is required.'),
  description: z.string().optional(),
  hourlyRate:  z.number().positive('hourlyRate must be a positive number.'),
});

export const updateCourtSchema = z.object({
  name:        z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  sport:       z.string().min(1).optional(),
  location:    z.string().min(1).optional(),
  description: z.string().optional(),
  hourlyRate:  z.number().positive().optional(),
  isActive:    z.boolean().optional(),
});

export const gcashSettingsSchema = z.object({
  phoneNumber:  z.string().min(1, 'phoneNumber is required.'),
  accountName:  z.string().min(1, 'accountName is required.'),
});
