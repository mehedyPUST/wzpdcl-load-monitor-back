import jwt from 'jsonwebtoken';

const EXPIRES_IN = '7d';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set in .env');
  return s;
}

export function signToken(payload) {
  return jwt.sign(payload, secret(), { expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}

export const COOKIE_NAME = 'wzpdcl_token';

// Detect production reliably (Vercel sets VERCEL=1)
const isProd =
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL === '1' ||
  process.env.VERCEL === 'true';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,                          // required for HTTPS
  sameSite: isProd ? 'none' : 'lax',       // none required for cross-origin
  maxAge: 7 * 24 * 60 * 60 * 1000,         // 7 days
  path: '/',
};
