import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';
import { comparePassword } from '../utils/bcrypt.js';
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from '../utils/jwt.js';

// ---------------- OPERATOR LOGIN ----------------
// Body: { circleId, substationId, password }
export async function operatorLogin(req, res) {
    try {
        const { circleId, substationId, password } = req.body;
        if (!circleId || !substationId || !password) {
            return res.status(400).json({ error: 'circleId, substationId and password are required' });
        }
        if (!ObjectId.isValid(circleId) || !ObjectId.isValid(substationId)) {
            return res.status(400).json({ error: 'Invalid circle or substation id' });
        }

        const db = getDB();
        const user = await db.collection('users').findOne({
            role: 'operator',
            circleId: new ObjectId(circleId),
            substationId: new ObjectId(substationId),
            active: true,
        });

        if (!user) return res.status(401).json({ error: 'Operator account not found' });

        const ok = await comparePassword(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'Incorrect password' });

        const token = signToken({
            role: 'operator',
            userId: user._id.toString(),
            circleId: user.circleId.toString(),
            substationId: user.substationId.toString(),
        });

        res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
        return res.json({
            message: 'Logged in',
            user: {
                role: 'operator',
                userId: user._id.toString(),
                name: user.name,
                circleId: user.circleId.toString(),
                substationId: user.substationId.toString(),
            },
        });
    } catch (err) {
        console.error('operatorLogin error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
}

// ---------------- VIEWER LOGIN ----------------
export async function viewerLogin(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'email and password required' });

        const db = getDB();
        const user = await db.collection('users').findOne({
            role: 'viewer',
            email: email.toLowerCase(),
            active: true,
        });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const ok = await comparePassword(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

        const token = signToken({
            role: 'viewer',
            userId: user._id.toString(),
            email: user.email,
        });

        res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
        return res.json({
            message: 'Logged in',
            user: { role: 'viewer', userId: user._id.toString(), name: user.name, email: user.email },
        });
    } catch (err) {
        console.error('viewerLogin error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
}

// ---------------- ADMIN LOGIN ----------------
export async function adminLogin(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'email and password required' });

        const db = getDB();
        const user = await db.collection('users').findOne({
            role: 'admin',
            email: email.toLowerCase(),
            active: true,
        });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const ok = await comparePassword(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

        const token = signToken({
            role: 'admin',
            userId: user._id.toString(),
            email: user.email,
        });

        res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
        return res.json({
            message: 'Logged in',
            user: { role: 'admin', userId: user._id.toString(), name: user.name, email: user.email },
        });
    } catch (err) {
        console.error('adminLogin error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
}

// ---------------- LOGOUT ----------------
export function logout(req, res) {
    res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: 0 });
    res.json({ message: 'Logged out' });
}

// ---------------- ME ----------------
export async function me(req, res) {
    const db = getDB();
    const user = { ...req.user };

    if (user.role === 'operator') {
        const ss = await db.collection('substations').findOne({ _id: new ObjectId(user.substationId) });
        const circle = await db.collection('circles').findOne({ _id: new ObjectId(user.circleId) });
        if (ss) user.substationName = ss.name;
        if (circle) user.circleName = circle.name;
    }

    res.json({ user });
}