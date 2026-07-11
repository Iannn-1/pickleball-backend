import type { Response } from 'express';
import { supabase } from '../config/supabase.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// ─── Create Booking ───────────────────────────────────────────────────────────

export const createBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courtId, date, timeSlot } = req.body as {
      courtId: string;
      date: string;
      timeSlot: string;
    };
    const userId = req.user?.id;

    // Check for an existing ACTIVE (non-cancelled) booking for this slot
    const { data: existingBooking, error: checkError } = await supabase
      .from('bookings')
      .select('id')
      .eq('court_id', courtId)
      .eq('date', date)
      .eq('time_slot', timeSlot)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (checkError) {
      return res.status(500).json({ error: checkError.message });
    }

    if (existingBooking) {
      return res.status(409).json({ error: 'This court slot has already been reserved.' });
    }

    const { data: newBooking, error: insertError } = await supabase
      .from('bookings')
      .insert([
        {
          user_id: userId,
          court_id: courtId,
          date,
          time_slot: timeSlot,
          status: 'confirmed',
        },
      ])
      .select('*, courts(name, location)')
      .single();

    if (insertError) {
      // Catch DB-level unique constraint violation as a fallback
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'This court slot has already been reserved.' });
      }
      return res.status(400).json({ error: insertError.message });
    }

    return res.status(201).json({
      message: 'Booking successfully confirmed!',
      booking: newBooking,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Get My Bookings ──────────────────────────────────────────────────────────

export const getMyBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('bookings')
      .select('*, courts(name, location)')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ bookings: data });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Get Single Booking ───────────────────────────────────────────────────────

export const getBookingById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    const query = supabase
      .from('bookings')
      .select('*, courts(name, location)')
      .eq('id', id)
      .single();

    const { data, error } = await query;

    if (error || !data) return res.status(404).json({ error: 'Booking not found.' });

    // Non-admins can only view their own bookings
    if (!isAdmin && data.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    return res.json({ booking: data });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Cancel Booking ───────────────────────────────────────────────────────────

export const cancelBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    // Fetch first to validate ownership
    const { data: existing, error: fetchError } = await supabase
      .from('bookings')
      .select('id, user_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    if (!isAdmin && existing.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    if (existing.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled.' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json({ message: 'Booking cancelled successfully.', booking: updated });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Get All Bookings ──────────────────────────────────────────────────

export const adminGetAllBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, date, courtId } = req.query;

    let query = supabase
      .from('bookings')
      .select('*, courts(name, location)')
      .order('date', { ascending: true });

    if (status) query = query.eq('status', status as string);
    if (date) query = query.eq('date', date as string);
    if (courtId) query = query.eq('court_id', courtId as string);

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ bookings: data });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Update Booking Status ─────────────────────────────────────────────

export const adminUpdateBookingStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };

    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: 'Booking not found or update failed.' });

    return res.json({ message: 'Booking status updated.', booking: data });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
