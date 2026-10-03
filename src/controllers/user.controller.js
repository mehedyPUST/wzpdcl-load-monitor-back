import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';
import { hashPassword } from '../utils/bcrypt.js';

export async function listUsers(req, res) {
    try {
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
    } catch (err) {
        console.error('listUsers error:', err);
        res.status(500).json({ error: 'Failed to list users' });
    }
}

export async function getUser(req, res) {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
        const db = getDB();
        const user = await db.collection('users').findOne(
            { _id: new ObjectId(id) },
            { projection: { passwordHash: 0 } }
        );
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (err) {
        console.error('getUser error:', err);
        res.status(500).json({ error: 'Failed to get user' });
    }
}

export async function createUser(req, res) {
    try {
        let { role, name, email, password, circleId, substationId, viewerCircles = [] } = req.body;

        role = (role || '').trim().toLowerCase();
        name = (name || '').trim();
        email = email ? String(email).trim().toLowerCase() : '';
        password = password ? String(password) : '';

        if (!role || !['admin', 'operator', 'viewer'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Use admin, operator (SBA), or viewer' });
        }
        if (!name) return res.status(400).json({ error: 'Name is required' });
        if (!password || password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }

        if ((role === 'admin' || role === 'viewer') && !email) {
            return res.status(400).json({ error: 'Email is required for admin and viewer' });
        }
        if (role === 'operator' && (!circleId || !substationId)) {
            return res.status(400).json({ error: 'Circle and substation are required for SBA (operator)' });
        }

        const db = getDB();

        if (email) {
            const dup = await db.collection('users').findOne({ email });
            if (dup) return res.status(409).json({ error: 'Email already in use' });
        }

        if (role === 'operator') {
            if (!ObjectId.isValid(circleId) || !ObjectId.isValid(substationId)) {
                return res.status(400).json({ error: 'Invalid circle or substation id' });
            }
            const ss = await db.collection('substations').findOne({
                _id: new ObjectId(substationId),
                circleId: new ObjectId(circleId),
            });
            if (!ss) return res.status(404).json({ error: 'Substation not found in that circle' });

            // One active SBA per substation (optional uniqueness)
            const existingOp = await db.collection('users').findOne({
                role: 'operator',
                substationId: new ObjectId(substationId),
                active: true,
            });
            if (existingOp) {
                return res.status(409).json({
                    error: 'An active SBA already exists for this substation. Delete or deactivate them first.',
                });
            }
        }

        const passwordHash = await hashPassword(password);

        let createdBy = null;
        if (req.user?.userId && ObjectId.isValid(req.user.userId)) {
            createdBy = new ObjectId(req.user.userId);
        }

        const doc = {
            role,
            name,
            email: email || null,
            passwordHash,
            circleId: role === 'operator' ? new ObjectId(circleId) : null,
            substationId: role === 'operator' ? new ObjectId(substationId) : null,
            viewerCircles:
                role === 'viewer' && Array.isArray(viewerCircles)
                    ? viewerCircles.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
                    : [],
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy,
        };

        const result = await db.collection('users').insertOne(doc);
        const { passwordHash: _, ...safe } = doc;
        res.status(201).json({ user: { _id: result.insertedId, ...safe } });
    } catch (err) {
        console.error('createUser error:', err);
        res.status(500).json({ error: err.message || 'Failed to create user' });
    }
}

export async function updateUser(req, res) {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

        const { name, email, active } = req.body;
        const update = { updatedAt: new Date() };
        if (name !== undefined) update.name = String(name).trim();
        if (email !== undefined) update.email = email ? String(email).trim().toLowerCase() : null;
        if (active !== undefined) update.active = Boolean(active);

        const db = getDB();
        const result = await db.collection('users').findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: update },
            { returnDocument: 'after', projection: { passwordHash: 0 } }
        );
        const user = result?.value ?? result;
        if (!user || !user._id) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (err) {
        console.error('updateUser error:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
}

export async function resetPassword(req, res) {
    try {
        const { id } = req.params;
        const { password } = req.body;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
        if (!password || password.length < 4) return res.status(400).json({ error: 'Password too short (min 4)' });

        const passwordHash = await hashPassword(password);
        const db = getDB();
        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(id) },
            { $set: { passwordHash, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'Password updated' });
    } catch (err) {
        console.error('resetPassword error:', err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
}

export async function deleteUser(req, res) {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

        if (req.user?.userId === id) {
            return res.status(400).json({ error: 'You cannot delete your own account' });
        }

        const db = getDB();
        const result = await db.collection('users').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error('deleteUser error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
}
