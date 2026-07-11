import { Router } from 'express';
import {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  adminGetAllBookings,
  adminUpdateBookingStatus,
} from '../controllers/bookingController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createBookingSchema,
  updateBookingStatusSchema,
} from '../schemas/bookingSchema.js';

const router = Router();

// ─── User Routes (authenticated) ─────────────────────────────────────────────
router.post('/bookings', requireAuth, validate(createBookingSchema), createBooking);
router.get('/bookings/me', requireAuth, getMyBookings);
router.get('/bookings/:id', requireAuth, getBookingById);
router.patch('/bookings/:id/cancel', requireAuth, cancelBooking);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
router.get('/admin/bookings', requireAuth, requireAdmin, adminGetAllBookings);
router.patch(
  '/admin/bookings/:id/status',
  requireAuth,
  requireAdmin,
  validate(updateBookingStatusSchema),
  adminUpdateBookingStatus
);

export default router;
