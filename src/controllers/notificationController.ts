import type { Response } from 'express';
import { supabase } from '../config/supabase.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// ─── Get My Notifications ─────────────────────────────────────────────────────

export const getMyNotifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });

    const unreadCount = (data ?? []).filter((n) => !n.is_read).length;

    return res.json({ notifications: data, unreadCount });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Mark Notification as Read ───────────────────────────────────────────────

export const markNotificationRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id }   = req.params;
    const userId   = req.user?.id;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ message: 'Notification marked as read.' });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Mark All Notifications as Read ──────────────────────────────────────────

export const markAllNotificationsRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ message: 'All notifications marked as read.' });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
