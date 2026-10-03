import { verifyToken, COOKIE_NAME } from '../utils/jwt.js';

export function requireAuth(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });

    req.user = payload;
    next();
}

export function requireOperator(req, res, next) {
    if (req.user?.role !== 'operator') {
        return res.status(403).json({ error: 'SBA access required' });
    }
    next();
}

export function requireViewer(req, res, next) {
    if (req.user?.role !== 'viewer') {
        return res.status(403).json({ error: 'Viewer access required' });
    }
    next();
}

export function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

export function requireAdminOrOperator(req, res, next) {
    if (!['admin', 'operator'].includes(req.user?.role)) {
        return res.status(403).json({ error: 'Admin or SBA access required' });
    }
    next();
}

export function requireAnyRole(req, res, next) {
    if (!['admin', 'operator', 'viewer'].includes(req.user?.role)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}