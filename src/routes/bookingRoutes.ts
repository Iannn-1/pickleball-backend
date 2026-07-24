import { Router } from 'express';
import {
  createBooking,
  submitPayment,
  getMyBookings,
  getBookingById,
  getQRTicket,
  cancelBooking,
  adminGetAllBookings,
  adminUpdateBookingStatus,
} from '../controllers/bookingController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createBookingSchema,
  submitPaymentSchema,
  updateBookingStatusSchema,
} from '../schemas/bookingSchema.js';

const router = Router();

// ─── User Routes ──────────────────────────────────────────────────────────────
router.post('/bookings',                  requireAuth, validate(createBookingSchema), createBooking);
router.post('/bookings/:id/pay',          requireAuth, validate(submitPaymentSchema), submitPayment);
router.get ('/bookings/me',               requireAuth, getMyBookings);
router.get ('/bookings/:id',              requireAuth, getBookingById);
router.get ('/bookings/:id/qr',           requireAuth, getQRTicket);
router.patch('/bookings/:id/cancel',      requireAuth, cancelBooking);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
router.get  ('/admin/bookings',           requireAuth, requireAdmin, adminGetAllBookings);
router.patch('/admin/bookings/:id/status',requireAuth, requireAdmin, validate(updateBookingStatusSchema), adminUpdateBookingStatus);

export default router;
