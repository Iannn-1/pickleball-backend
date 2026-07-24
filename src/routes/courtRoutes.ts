import { Router } from 'express';
import {
  getCourts,
  getAllCourtsAvailability,
  getCourtAvailability,
  getGcashSettings,
  adminCreateCourt,
  adminUpdateCourt,
  adminDeleteCourt,
  adminUpdateGcashSettings,
} from '../controllers/courtController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createCourtSchema, updateCourtSchema, gcashSettingsSchema } from '../schemas/courtSchema.js';

const router = Router();

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/courts',                    getCourts);
router.get('/courts/availability',       getAllCourtsAvailability);  // ?date=YYYY-MM-DD
router.get('/courts/:id/availability',   getCourtAvailability);       // ?date=YYYY-MM-DD
router.get('/gcash',                     getGcashSettings);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
router.post  ('/admin/courts',           requireAuth, requireAdmin, validate(createCourtSchema),    adminCreateCourt);
router.patch ('/admin/courts/:id',       requireAuth, requireAdmin, validate(updateCourtSchema),    adminUpdateCourt);
router.delete('/admin/courts/:id',       requireAuth, requireAdmin, adminDeleteCourt);
router.put   ('/admin/gcash',            requireAuth, requireAdmin, validate(gcashSettingsSchema),  adminUpdateGcashSettings);

export default router;
