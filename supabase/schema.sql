-- ─── Courts Table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  location    text        NOT NULL,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Bookings Table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  court_id    uuid        NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  time_slot   text        NOT NULL,
  status      text        NOT NULL DEFAULT 'confirmed'
                          CHECK (status IN ('confirmed', 'cancelled', 'pending')),
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Prevents double booking: same court + date + time_slot can only have ONE confirmed booking
  CONSTRAINT unique_active_booking
    UNIQUE (court_id, date, time_slot)
    DEFERRABLE INITIALLY IMMEDIATE
);

-- Index for fast availability lookups
CREATE INDEX IF NOT EXISTS idx_bookings_court_date
  ON bookings (court_id, date)
  WHERE status != 'cancelled';

-- Index for fast user booking lookups
CREATE INDEX IF NOT EXISTS idx_bookings_user
  ON bookings (user_id);

-- ─── Profiles Table (auto-created on signup) ──────────────────────────────────
-- Stores extra user info synced from Supabase Auth
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile when a new user signs up (works for both email and Google)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
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

-- ─── Row Level Security (RLS) ─────────────────────────────────────────────────

-- Courts: anyone can read, only service role (admin) can write
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Courts are viewable by everyone"
  ON courts FOR SELECT
  USING (true);

CREATE POLICY "Only service role can modify courts"
  ON courts FOR ALL
  USING (auth.role() = 'service_role');

-- Bookings: users can only see and manage their own bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own bookings"
  ON bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can cancel own bookings"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id);

-- Profiles: users can only see and update their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ─── Seed: Sample Courts ──────────────────────────────────────────────────────
INSERT INTO courts (name, location, description) VALUES
  ('Court A', 'Building 1 - Ground Floor', 'Indoor court with wooden flooring'),
  ('Court B', 'Building 1 - Ground Floor', 'Indoor court with wooden flooring'),
  ('Court C', 'Building 2 - Outdoor', 'Outdoor court with lighting'),
  ('Court D', 'Building 2 - Outdoor', 'Outdoor court with lighting')
ON CONFLICT DO NOTHING;
