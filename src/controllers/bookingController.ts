import type { Response } from 'express';
import QRCode from 'qrcode';
import { supabase } from '../config/supabase.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SERVICE_FEE_RATE = 0.05; // 5%

/** Generate a human-readable booking reference like BKG-MRYT6LLJ */
function generateBookingRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BKG-';
  for (let i = 0; i < 8; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

/** Parse "HH:MM" into minutes since midnight */
function toMinutes(slot: string): number {
  const [h, m] = slot.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Get all hourly slots that are blocked by active bookings for a court+date */
async function getBlockedSlots(courtId: string, date: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('bookings')
    .select('start_slot, end_slot')
    .eq('court_id', courtId)
    .eq('date', date)
    .not('status', 'in', '("cancelled")');

  const blocked = new Set<string>();
  for (const b of data ?? []) {
    const start = toMinutes(b.start_slot as string);
    const end   = toMinutes(b.end_slot as string);
    for (let t = start; t < end; t += 60) {
      const hh = String(Math.floor(t / 60)).padStart(2, '0');
      blocked.add(`${hh}:00`);
    }
  }
  return blocked;
}

// ─── Create Booking (sets status = pending) ───────────────────────────────────

export const createBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courtId, date, startSlot, endSlot, players } = req.body as {
      courtId:   string;
      date:      string;
      startSlot: string;
      endSlot:   string;
      players:   number;
    };
    const userId = req.user?.id;

    const startMin = toMinutes(startSlot);
    const endMin   = toMinutes(endSlot);

    if (endMin <= startMin) {
      return res.status(400).json({ error: 'endSlot must be after startSlot.' });
    }

    const durationHours = (endMin - startMin) / 60;
    if (!Number.isInteger(durationHours) || durationHours < 1) {
      return res.status(400).json({ error: 'Slots must be in whole-hour increments.' });
    }

    // Fetch court for hourly rate
    const { data: court, error: courtError } = await supabase
      .from('courts')
      .select('id, display_name, hourly_rate, is_active')
      .eq('id', courtId)
      .single();

    if (courtError || !court) {
      return res.status(404).json({ error: 'Court not found.' });
    }
    if (!court.is_active) {
      return res.status(400).json({ error: 'This court is currently unavailable.' });
    }

    // Check slot availability
    const blocked = await getBlockedSlots(courtId, date);
    for (let t = startMin; t < endMin; t += 60) {
      const hh = String(Math.floor(t / 60)).padStart(2, '0');
      if (blocked.has(`${hh}:00`)) {
        return res.status(409).json({
          error: `Slot ${hh}:00–${String(Math.floor(t / 60) + 1).padStart(2, '0')}:00 is already taken.`,
        });
      }
    }

    // Calculate pricing
    const hourlyRate  = Number(court.hourly_rate);
    const subtotal    = hourlyRate * durationHours;
    const serviceFee  = Math.round(subtotal * SERVICE_FEE_RATE * 100) / 100;
    const totalAmount = subtotal + serviceFee;

    // Generate unique booking ref
    let bookingRef = generateBookingRef();
    // Ensure uniqueness (retry once on collision)
    const { data: existing } = await supabase
      .from('bookings').select('id').eq('booking_ref', bookingRef).maybeSingle();
    if (existing) bookingRef = generateBookingRef();

    // Insert booking as pending
    const { data: newBooking, error: insertError } = await supabase
      .from('bookings')
      .insert([{
        booking_ref:    bookingRef,
        user_id:        userId,
        court_id:       courtId,
        date,
        start_slot:     startSlot,
        end_slot:       endSlot,
        duration_hours: durationHours,
        players,
        hourly_rate:    hourlyRate,
        subtotal,
        service_fee:    serviceFee,
        total_amount:   totalAmount,
        payment_method: 'gcash',
        status:         'pending',
      }])
      .select('*, courts(name, display_name, location)')
      .single();

    if (insertError) {
      return res.status(400).json({ error: insertError.message });
    }

    // Create a notification for the user
    await supabase.from('notifications').insert([{
      user_id:    userId,
      title:      'Booking Pending',
      message:    `Your booking ${bookingRef} is pending payment. Complete payment to confirm.`,
      type:       'info',
      booking_id: newBooking.id,
    }]);

    // Fetch GCash details to include in response
    const { data: gcash } = await supabase
      .from('gcash_settings')
      .select('phone_number, account_name')
      .eq('is_active', true)
      .single();

    return res.status(201).json({
      message:  'Booking created. Complete GCash payment to confirm.',
      booking:  newBooking,
      gcash,
    });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Submit Payment (user marks "I've Sent Payment") ─────────────────────────

export const submitPayment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentNote } = req.body as { paymentNote: string };
    const userId = req.user?.id;

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, user_id, status, booking_ref')
      .eq('id', id)
      .single();

    if (error || !booking) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });
    if (booking.status !== 'pending') {
      return res.status(400).json({ error: `Cannot submit payment for a booking with status: ${booking.status}` });
    }

    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update({ payment_note: paymentNote })
      .eq('id', id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    // Notify admins (stored as a notification without user_id for admin panel consumption)
    // Also notify the user
    await supabase.from('notifications').insert([{
      user_id:    userId,
      title:      'Payment Submitted',
      message:    `Payment for ${booking.booking_ref} has been submitted. Awaiting admin confirmation.`,
      type:       'info',
      booking_id: id,
    }]);

    return res.json({ message: 'Payment submitted. Awaiting admin confirmation.', booking: updated });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Get My Bookings ──────────────────────────────────────────────────────────

export const getMyBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('bookings')
      .select('*, courts(name, display_name, location)')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ bookings: data });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Get Single Booking ───────────────────────────────────────────────────────

export const getBookingById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId  = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    const { data, error } = await supabase
      .from('bookings')
      .select('*, courts(name, display_name, location)')
      .eq('id', id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Booking not found.' });
    if (!isAdmin && data.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });

    return res.json({ booking: data });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Get QR Ticket ────────────────────────────────────────────────────────────

export const getQRTicket = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId  = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, booking_ref, user_id, status, qr_code, courts(display_name), date, start_slot, end_slot')
      .eq('id', id)
      .single();

    if (error || !booking) return res.status(404).json({ error: 'Booking not found.' });
    if (!isAdmin && booking.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });
    if (booking.status !== 'confirmed') {
      return res.status(400).json({ error: 'QR ticket is only available for confirmed bookings.' });
    }

    // Generate or return cached QR code
    let qrCode = booking.qr_code as string | null;
    if (!qrCode) {
      const qrData = JSON.stringify({
        ref:    booking.booking_ref,
        id:     booking.id,
        court:  (booking.courts as unknown as { display_name: string } | null)?.display_name,
        date:   booking.date,
        start:  booking.start_slot,
        end:    booking.end_slot,
      });
      qrCode = await QRCode.toDataURL(qrData);

      await supabase.from('bookings').update({ qr_code: qrCode }).eq('id', id);
    }

    return res.json({ bookingRef: booking.booking_ref, qrCode });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Cancel Booking ───────────────────────────────────────────────────────────

export const cancelBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId  = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    const { data: existing, error: fetchError } = await supabase
      .from('bookings')
      .select('id, user_id, status, booking_ref')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Booking not found.' });
    if (!isAdmin && existing.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });
    if (existing.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled.' });

    const { data: updated, error: updateError } = await supabase
      .from('bookings').update({ status: 'cancelled' }).eq('id', id).select().single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    await supabase.from('notifications').insert([{
      user_id:    existing.user_id,
      title:      'Booking Cancelled',
      message:    `Your booking ${existing.booking_ref} has been cancelled.`,
      type:       'warning',
      booking_id: id,
    }]);

    return res.json({ message: 'Booking cancelled.', booking: updated });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Get All Bookings ──────────────────────────────────────────────────

export const adminGetAllBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, date, courtId } = req.query;

    let query = supabase
      .from('bookings')
      .select('*, courts(name, display_name), profiles(display_name)')
      .order('created_at', { ascending: false });

    if (status)  query = query.eq('status', status as string);
    if (date)    query = query.eq('date', date as string);
    if (courtId) query = query.eq('court_id', courtId as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ bookings: data });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── Admin: Confirm or Update Booking Status ──────────────────────────────────

export const adminUpdateBookingStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id }    = req.params;
    const { status } = req.body as { status: string };

    // Fetch booking before updating
    const { data: existing, error: fetchError } = await supabase
      .from('bookings')
      .select('id, user_id, booking_ref, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Booking not found.' });

    let qrCode: string | undefined;

    // Generate QR code when confirming
    if (status === 'confirmed') {
      const { data: bookingFull } = await supabase
        .from('bookings')
        .select('*, courts(display_name)')
        .eq('id', id)
        .single();

      if (bookingFull) {
        const qrData = JSON.stringify({
          ref:   bookingFull.booking_ref,
          id:    bookingFull.id,
          court: (bookingFull.courts as { display_name: string } | null)?.display_name,
          date:  bookingFull.date,
          start: bookingFull.start_slot,
          end:   bookingFull.end_slot,
        });
        qrCode = await QRCode.toDataURL(qrData);
      }
    }

    const updatePayload: Record<string, unknown> = { status };
    if (qrCode) updatePayload['qr_code'] = qrCode;

    const { data: updated, error: updateError } = await supabase
      .from('bookings').update(updatePayload).eq('id', id).select().single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    // Notify user
    const notifMap: Record<string, { title: string; message: string; type: string }> = {
      confirmed:  { title: 'Booking Confirmed!', message: `Your booking ${existing.booking_ref} has been confirmed. Enjoy your game!`, type: 'success' },
      cancelled:  { title: 'Booking Cancelled',  message: `Your booking ${existing.booking_ref} was cancelled by admin.`, type: 'error' },
      completed:  { title: 'Booking Completed',  message: `Your session for ${existing.booking_ref} is complete. Thanks for playing!`, type: 'info' },
    };
    const notif = notifMap[status];
    if (notif) {
      await supabase.from('notifications').insert([{
        user_id:    existing.user_id,
        title:      notif.title,
        message:    notif.message,
        type:       notif.type,
        booking_id: id,
      }]);
    }

    return res.json({ message: `Booking status updated to ${status}.`, booking: updated });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
