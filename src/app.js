import './config/env.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { connectDB } from './config/db.js';
import { notFound, globalError } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import userRoutes from './routes/user.routes.js';
import publicRoutes from './routes/public.routes.js';
import loadRoutes from './routes/load.routes.js';

const app = express();

// Trust proxy (required on Vercel for secure cookies + correct client IP)
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

// Ensure MongoDB is connected before any request (works for both local + serverless)
let dbReady = null;
async function ensureDB() {
  if (!dbReady) {
    dbReady = connectDB().catch((err) => {
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}

app.use(async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error('DB connection failed:', err);
    res.status(503).json({ error: 'Database unavailable' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ name: 'WZPDCL Load Monitor API', status: 'running' });
});

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/users', userRoutes);
app.use('/public', publicRoutes);
app.use('/load', loadRoutes);

app.use(notFound);
app.use(globalError);

// Local development only — never call listen() on Vercel
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
if (!isVercel) {
  const PORT = process.env.PORT || 5000;
  (async () => {
    try {
      await ensureDB();
      app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  })();
}

export default app;
