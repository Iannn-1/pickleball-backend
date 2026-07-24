import { Router } from 'express';
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.get  ('/notifications',         requireAuth, getMyNotifications);
router.patch('/notifications/:id/read',requireAuth, markNotificationRead);
router.patch('/notifications/read-all',requireAuth, markAllNotificationsRead);

export default router;
