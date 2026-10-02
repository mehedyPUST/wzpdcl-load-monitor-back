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

export const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
};