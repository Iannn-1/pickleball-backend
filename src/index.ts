import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import bookingRoutes from './routes/bookingRoutes.js';
import courtRoutes from './routes/courtRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 5000;

// ─── Global Middleware ────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Rate limiter: max 100 requests per 15 minutes per IP
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

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'Pickleball API running successfully!' });
});

// ─── 404 Fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ─── Centralized Error Handler ────────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`⚡️ Server running on http://localhost:${PORT}`);
});
