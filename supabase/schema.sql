-- ═══════════════════════════════════════════════════════════════════
-- PicklePro Database Schema
-- ═══════════════════════════════════════════════════════════════════

-- ─── Profiles Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url   text,
  phone        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile on signup (email or Google OAuth)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Courts Table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,            -- e.g. "CRT1"
  display_name    text        NOT NULL,            -- e.g. "CRT1 – Pickleball Court"
  sport           text        NOT NULL DEFAULT 'Pickleball',
  location        text        NOT NULL,
  description     text,
  hourly_rate     numeric     NOT NULL DEFAULT 500, -- PHP per hour
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── GCash Settings Table ─────────────────────────────────────────────────────
-- Stores the GCash number/account name shown to users at payment step
CREATE TABLE IF NOT EXISTS gcash_settings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number   text        NOT NULL,
  account_name   text        NOT NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── Bookings Table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref     text        NOT NULL UNIQUE,     -- human-readable e.g. BKG-MRYT6LLJ
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  court_id        uuid        NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  start_slot      text        NOT NULL,            -- e.g. "06:00"
  end_slot        text        NOT NULL,            -- e.g. "11:00" (exclusive end)
  duration_hours  integer     NOT NULL,
  players         integer     NOT NULL DEFAULT 1 CHECK (players BETWEEN 1 AND 10),
  hourly_rate     numeric     NOT NULL,            -- snapshot of rate at time of booking
  subtotal        numeric     NOT NULL,            -- hourly_rate * duration_hours
  service_fee     numeric     NOT NULL,            -- 5% of subtotal
  total_amount    numeric     NOT NULL,            -- subtotal + service_fee
  payment_method  text        NOT NULL DEFAULT 'gcash',
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  qr_code         text,                           -- base64 QR data URL
  payment_note    text,                           -- e.g. reference number user sent
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast availability lookups
CREATE INDEX IF NOT EXISTS idx_bookings_court_date
  ON bookings (court_id, date)
  WHERE status NOT IN ('cancelled');

-- Index for fast user booking lookups
CREATE INDEX IF NOT EXISTS idx_bookings_user
  ON bookings (user_id);

-- Index on booking_ref for quick QR lookups
CREATE INDEX IF NOT EXISTS idx_bookings_ref
  ON bookings (booking_ref);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Notifications Table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  message     text        NOT NULL,
  type        text        NOT NULL DEFAULT 'info'
                          CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read     boolean     NOT NULL DEFAULT false,
  booking_id  uuid        REFERENCES bookings(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, is_read, created_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────

-- Courts: public read
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Courts are viewable by everyone"
  ON courts FOR SELECT USING (true);
CREATE POLICY "Only service role can modify courts"
  ON courts FOR ALL USING (auth.role() = 'service_role');

-- GCash settings: public read
ALTER TABLE gcash_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "GCash settings are viewable by everyone"
  ON gcash_settings FOR SELECT USING (true);
CREATE POLICY "Only service role can modify gcash settings"
  ON gcash_settings FOR ALL USING (auth.role() = 'service_role');

-- Bookings: users see and manage their own
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own bookings"
  ON bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookings"
  ON bookings FOR UPDATE USING (auth.uid() = user_id);

-- Profiles: users see and update their own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Notifications: users see their own
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ─── Seed Data ────────────────────────────────────────────────────────────────
INSERT INTO courts (name, display_name, sport, location, description, hourly_rate) VALUES
  ('CRT1', 'CRT1 – Pickleball Court', 'Pickleball', 'Building 1', 'Indoor court with wooden flooring', 500),
  ('CRT2', 'CRT2 – Pickleball Court', 'Pickleball', 'Building 1', 'Indoor court with wooden flooring', 500),
  ('CRT3', 'CRT3 – Pickleball Court', 'Pickleball', 'Building 2 - Outdoor', 'Outdoor court with lighting', 500)
ON CONFLICT DO NOTHING;

INSERT INTO gcash_settings (phone_number, account_name) VALUES
  ('0917 123 4567', 'PicklePro Courts')
ON CONFLICT DO NOTHING;
