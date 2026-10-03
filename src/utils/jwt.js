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

const isProd =
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL === '1' ||
  process.env.VERCEL === 'true';

// sameSite=lax works with Next.js same-origin rewrites.
// sameSite=none kept available if CLIENT_ORIGIN forces true cross-site.
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'lax' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};
