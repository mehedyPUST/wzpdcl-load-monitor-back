import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';
import { hashPassword } from '../utils/bcrypt.js';

// List users with optional filters
export async function listUsers(req, res) {
    const { role, circleId } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (circleId && ObjectId.isValid(circleId)) filter.circleId = new ObjectId(circleId);

    const db = getDB();
    const users = await db
        .collection('users')
        .find(filter)
        .project({ passwordHash: 0 })
        .sort({ createdAt: -1 })
        .toArray();
    res.json({ users });
}

export async function getUser(req, res) {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const db = getDB();
    const user = await db.collection('users').findOne(
        { _id: new ObjectId(id) },
        { projection: { passwordHash: 0 } }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
}

// Create admin / operator / viewer
export async function createUser(req, res) {
    const { role, name, email, password, circleId, substationId, viewerCircles = [] } = req.body;

    if (!role || !['admin', 'operator', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    if (!name || !password) return res.status(400).json({ error: 'name and password required' });

    if ((role === 'admin' || role === 'viewer') && !email) {
        return res.status(400).json({ error: 'email required' });
    }
    if (role === 'operator' && (!circleId || !substationId)) {
        return res.status(400).json({ error: 'circleId and substationId required for operator' });
    }

    const db = getDB();

    // Uniqueness for email
    if (email) {
        const dup = await db.collection('users').findOne({ email: email.toLowerCase() });
        if (dup) return res.status(409).json({ error: 'Email already in use' });
    }

    // Validate operator assignments
    if (role === 'operator') {
        if (!ObjectId.isValid(circleId) || !ObjectId.isValid(substationId)) {
            return res.status(400).json({ error: 'Invalid circle or substation id' });
        }
        const ss = await db.collection('substations').findOne({
            _id: new ObjectId(substationId),
            circleId: new ObjectId(circleId),
        });
        if (!ss) return res.status(404).json({ error: 'Substation not found in that circle' });
    }

    const passwordHash = await hashPassword(password);

    const doc = {
        role,
        name,
        email: email ? email.toLowerCase() : null,
        passwordHash,
        circleId: role === 'operator' ? new ObjectId(circleId) : null,
        substationId: role === 'operator' ? new ObjectId(substationId) : null,
        viewerCircles:
            role === 'viewer' && Array.isArray(viewerCircles)
                ? viewerCircles.filter(ObjectId.isValid).map(id => new ObjectId(id))
                : [],
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: req.user?.userId ? new ObjectId(req.user.userId) : null,
    };

    const result = await db.collection('users').insertOne(doc);
    const { passwordHash: _, ...safe } = doc;
    res.status(201).json({ user: { _id: result.insertedId, ...safe } });
}

export async function updateUser(req, res) {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const { name, email, circleId, substationId, viewerCircles, active } = req.body;
    const update = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email ? email.toLowerCase() : null;
    if (active !== undefined) update.active = active;
    if (circleId !== undefined && ObjectId.isValid(circleId)) update.circleId = new ObjectId(circleId);
    if (substationId !== undefined && ObjectId.isValid(substationId)) update.substationId = new ObjectId(substationId);
    if (Array.isArray(viewerCircles)) {
        update.viewerCircles = viewerCircles.filter(ObjectId.isValid).map(id => new ObjectId(id));
    }

    const db = getDB();
    const result = await db.collection('users').findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: update },
        { returnDocument: 'after', projection: { passwordHash: 0 } }
    );
    if (!result.value) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.value });
}

export async function resetPassword(req, res) {
    const { id } = req.params;
    const { password } = req.body;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!password || password.length < 4) return res.status(400).json({ error: 'Password too short' });

    const passwordHash = await hashPassword(password);
    const db = getDB();
    const result = await db.collection('users').updateOne(
        { _id: new ObjectId(id) },
        { $set: { passwordHash, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Password updated' });
}

export async function deleteUser(req, res) {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    // Prevent deleting self
    if (req.user?.userId === id) {
        return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const db = getDB();
    const result = await db.collection('users').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
}