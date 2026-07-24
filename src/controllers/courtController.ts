import type { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// All hourly slots: 6AM–10PM
const ALL_SLOTS = [
  '06:00','07:00','08:00','09:00','10:00','11:00',
  '12:00','13:00','14:00','15:00','16:00','17:00',
  '18:00','19:00','20:00','21:00',
];

function toMinutes(slot: string): number {
  const [h, m] = slot.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ─── Get All Courts ───────────────────────────────────────────────────────────

export const getCourts = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('courts')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ courts: data });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Get All Courts Availability for a Date (grid view) ──────────────────────
// Returns all active courts with slot status per court for the given date.
// Status per slot: 'open' | 'pending' | 'booked'

export const getAllCourtsAvailability = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Query parameter "date" is required (YYYY-MM-DD).' });
    }

    const { data: courts, error: courtsError } = await supabase
      .from('courts')
      .select('id, name, display_name, hourly_rate')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (courtsError) return res.status(500).json({ error: courtsError.message });

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('court_id, start_slot, end_slot, status')
      .eq('date', date as string)
      .not('status', 'eq', 'cancelled');

    if (bookingsError) return res.status(500).json({ error: bookingsError.message });

    // Build slot map per court
    const courtSlotMap: Record<string, Record<string, string>> = {};
    for (const court of courts ?? []) {
      courtSlotMap[court.id] = {};
    }

    for (const b of bookings ?? []) {
      const start = toMinutes(b.start_slot as string);
      const end   = toMinutes(b.end_slot as string);
      const slotStatus = (b.status === 'pending') ? 'pending' : 'booked';
      for (let t = start; t < end; t += 60) {
        const hh = String(Math.floor(t / 60)).padStart(2, '0');
        const slot = `${hh}:00`;
        if (courtSlotMap[b.court_id as string]) {
          courtSlotMap[b.court_id as string]![slot] = slotStatus;
        }
      }
    }

    // Build response
    const grid = ALL_SLOTS.map((slot) => {
      const slotEnd = `${String(Number(slot.split(':')[0]) + 1).padStart(2, '0')}:00`;
      const label   = `${slot.replace(':00', '')}AM–${slotEnd.replace(':00', '')}AM`
        .replace('12AM', '12PM')
        .replace(/(\d+)AM/g, (_, h) => `${Number(h) < 12 ? h : h}${Number(h) < 12 ? 'AM' : 'PM'}`)
        .replace(/(\d+)PM/g, (_, h) => `${Number(h) > 12 ? Number(h) - 12 : h}PM`);

      const courts_status: Record<string, string> = {};
      for (const court of courts ?? []) {
        courts_status[court.name as string] = courtSlotMap[court.id as string]?.[slot] ?? 'open';
      }

      return { slot, label: `${slot}–${slotEnd}`, courts: courts_status };
    });

    return res.json({
      date,
      courts: courts?.map((c) => ({ id: c.id, name: c.name, displayName: c.display_name, hourlyRate: c.hourly_rate })),
      grid,
    });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Get Single Court Availability ───────────────────────────────────────────

export const getCourtAvailability = async (req: Request, res: Response) => {
  try {
    const { id }  = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Query parameter "date" is required (YYYY-MM-DD).' });
    }

    const { data: court, error: courtError } = await supabase
      .from('courts')
      .select('id, name, display_name, hourly_rate, location')
      .eq('id', id)
      .single();

    if (courtError || !court) return res.status(404).json({ error: 'Court not found.' });

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('start_slot, end_slot, status')
      .eq('court_id', id)
      .eq('date', date as string)
      .not('status', 'eq', 'cancelled');

    if (bookingsError) return res.status(500).json({ error: bookingsError.message });

    const slotStatusMap: Record<string, string> = {};
    for (const b of bookings ?? []) {
      const start = toMinutes(b.start_slot as string);
      const end   = toMinutes(b.end_slot as string);
      const s = b.status === 'pending' ? 'pending' : 'booked';
      for (let t = start; t < end; t += 60) {
        const hh = String(Math.floor(t / 60)).padStart(2, '0');
        slotStatusMap[`${hh}:00`] = s;
      }
    }

    const availability = ALL_SLOTS.map((slot) => ({
      slot,
      status: slotStatusMap[slot] ?? 'open',
    }));

    return res.json({
      courtId:     court.id,
      court,
      date,
      availability,
      availableCount: availability.filter((s) => s.status === 'open').length,
    });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Get GCash Settings (public) ─────────────────────────────────────────────

export const getGcashSettings = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('gcash_settings')
      .select('phone_number, account_name')
      .eq('is_active', true)
      .single();

    if (error || !data) return res.status(404).json({ error: 'GCash settings not configured.' });

    return res.json({ gcash: data });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Create Court ──────────────────────────────────────────────────────

export const adminCreateCourt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, displayName, sport, location, description, hourlyRate } = req.body as {
      name: string; displayName: string; sport: string;
      location: string; description?: string; hourlyRate: number;
    };

    const { data, error } = await supabase
      .from('courts')
      .insert([{ name, display_name: displayName, sport, location, description, hourly_rate: hourlyRate }])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.status(201).json({ message: 'Court created.', court: data });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Update Court ──────────────────────────────────────────────────────

export const adminUpdateCourt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, displayName, sport, location, description, hourlyRate, isActive } = req.body as {
      name?: string; displayName?: string; sport?: string; location?: string;
      description?: string; hourlyRate?: number; isActive?: boolean;
    };

    const payload: Record<string, unknown> = {};
    if (name        !== undefined) payload['name']         = name;
    if (displayName !== undefined) payload['display_name'] = displayName;
    if (sport       !== undefined) payload['sport']        = sport;
    if (location    !== undefined) payload['location']     = location;
    if (description !== undefined) payload['description']  = description;
    if (hourlyRate  !== undefined) payload['hourly_rate']  = hourlyRate;
    if (isActive    !== undefined) payload['is_active']    = isActive;

    const { data, error } = await supabase
      .from('courts').update(payload).eq('id', id).select().single();

    if (error || !data) return res.status(404).json({ error: 'Court not found or update failed.' });

    return res.json({ message: 'Court updated.', court: data });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Delete Court ──────────────────────────────────────────────────────

export const adminDeleteCourt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from('courts').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });

    return res.json({ message: 'Court deleted.' });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Update GCash Settings ────────────────────────────────────────────

export const adminUpdateGcashSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phoneNumber, accountName } = req.body as {
      phoneNumber: string; accountName: string;
    };

    // Upsert — update the active one or insert if none exists
    const { data: existing } = await supabase
      .from('gcash_settings').select('id').eq('is_active', true).single();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('gcash_settings')
        .update({ phone_number: phoneNumber, account_name: accountName, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      result = data;
    } else {
      const { data, error } = await supabase
        .from('gcash_settings')
        .insert([{ phone_number: phoneNumber, account_name: accountName }])
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      result = data;
    }

    return res.json({ message: 'GCash settings updated.', gcash: result });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
