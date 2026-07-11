import { Router } from 'express';
import {
  getCourts,
  getCourtAvailability,
  adminCreateCourt,
  adminUpdateCourt,
  adminDeleteCourt,
} from '../controllers/courtController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createCourtSchema, updateCourtSchema } from '../schemas/courtSchema.js';

const router = Router();

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/courts', getCourts);
router.get('/courts/:id/availability', getCourtAvailability);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
router.post('/admin/courts', requireAuth, requireAdmin, validate(createCourtSchema), adminCreateCourt);
router.patch('/admin/courts/:id', requireAuth, requireAdmin, validate(updateCourtSchema), adminUpdateCourt);
router.delete('/admin/courts/:id', requireAuth, requireAdmin, adminDeleteCourt);

export default router;
