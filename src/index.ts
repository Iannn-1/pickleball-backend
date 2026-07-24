import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';

import bookingRoutes      from './routes/bookingRoutes.js';
import courtRoutes        from './routes/courtRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { errorHandler }   from './middleware/errorHandler.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT ?? 5000;

// ─── Global Middleware ────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Rate limiter: 100 requests / 15 min per IP
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  })
);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', bookingRoutes);
app.use('/api', courtRoutes);
app.use('/api', notificationRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'PicklePro API running!', timestamp: new Date().toISOString() });
});

// ─── 404 Fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ─── Centralized Error Handler ────────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`⚡️  PicklePro API running on http://localhost:${PORT}`);
});
