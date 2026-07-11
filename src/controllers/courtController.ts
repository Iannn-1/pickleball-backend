import type { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// ─── Get All Courts ───────────────────────────────────────────────────────────

export const getCourts = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('courts')
      .select('*')
      .order('name', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ courts: data });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Get Court Availability ───────────────────────────────────────────────────

export const getCourtAvailability = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Query parameter "date" is required (YYYY-MM-DD).' });
    }

    // All defined slots for a day
    const ALL_SLOTS = [
      '07:00', '08:00', '09:00', '10:00', '11:00',
      '12:00', '13:00', '14:00', '15:00', '16:00',
      '17:00', '18:00', '19:00', '20:00',
    ];

    const { data: booked, error } = await supabase
      .from('bookings')
      .select('time_slot')
      .eq('court_id', id)
      .eq('date', date as string)
      .neq('status', 'cancelled');

    if (error) return res.status(500).json({ error: error.message });

    // Also fetch court info
    const { data: court, error: courtError } = await supabase
      .from('courts')
      .select('name, location')
      .eq('id', id)
      .single();

    if (courtError || !court) {
      return res.status(404).json({ error: 'Court not found.' });
    }

    const bookedSlots = new Set((booked ?? []).map((b) => b.time_slot as string));
    const availability = ALL_SLOTS.map((slot) => ({
      slot,
      available: !bookedSlots.has(slot),
    }));

    return res.json({
      courtId: id,
      court,
      date,
      availability,
      totalSlots: ALL_SLOTS.length,
      availableCount: availability.filter((s) => s.available).length,
      bookedCount: bookedSlots.size,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Create Court ──────────────────────────────────────────────────────

export const adminCreateCourt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, location, description } = req.body as {
      name: string;
      location: string;
      description?: string;
    };

    const { data, error } = await supabase
      .from('courts')
      .insert([{ name, location, description }])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.status(201).json({ message: 'Court created.', court: data });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Update Court ──────────────────────────────────────────────────────

export const adminUpdateCourt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, location, description } = req.body as {
      name?: string;
      location?: string;
      description?: string;
    };

    const { data, error } = await supabase
      .from('courts')
      .update({ name, location, description })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: 'Court not found or update failed.' });

    return res.json({ message: 'Court updated.', court: data });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Delete Court ──────────────────────────────────────────────────────

export const adminDeleteCourt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('courts')
      .delete()
      .eq('id', id);

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ message: 'Court deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
