import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

export async function listSubstations(req, res) {
    const { circleId } = req.query;
    const db = getDB();
    const filter = {};
    if (circleId) {
        if (!ObjectId.isValid(circleId)) return res.status(400).json({ error: 'Invalid circleId' });
        filter.circleId = new ObjectId(circleId);
    }
    const substations = await db.collection('substations').find(filter).sort({ name: 1 }).toArray();
    res.json({ substations });
}

// Public endpoint used by operator login page (returns id + name only)
export async function listPublicSubstations(req, res) {
    const { circleId } = req.query;
    if (!circleId || !ObjectId.isValid(circleId)) return res.status(400).json({ error: 'Invalid circleId' });
    const db = getDB();
    const list = await db
        .collection('substations')
        .find({ circleId: new ObjectId(circleId), active: true })
        .project({ name: 1, district: 1 })
        .sort({ name: 1 })
        .toArray();
    res.json({ substations: list });
}

export async function createSubstation(req, res) {
    const { circleId, name, district, hasPBS = false } = req.body;
    if (!circleId || !name) return res.status(400).json({ error: 'circleId and name required' });
    if (!ObjectId.isValid(circleId)) return res.status(400).json({ error: 'Invalid circleId' });

    const db = getDB();
    const circle = await db.collection('circles').findOne({ _id: new ObjectId(circleId) });
    if (!circle) return res.status(404).json({ error: 'Circle not found' });

    const doc = {
        circleId: new ObjectId(circleId),
        name,
        district: district || '',
        hasPBS,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const result = await db.collection('substations').insertOne(doc);
    res.status(201).json({ substation: { _id: result.insertedId, ...doc } });
}

export async function updateSubstation(req, res) {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const { name, district, hasPBS, active } = req.body;
    const update = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (district !== undefined) update.district = district;
    if (hasPBS !== undefined) update.hasPBS = hasPBS;
    if (active !== undefined) update.active = active;

    const db = getDB();
    const result = await db.collection('substations').findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: update },
        { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ error: 'Substation not found' });
    res.json({ substation: result.value });
}

export async function deleteSubstation(req, res) {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const db = getDB();
    const userCount = await db.collection('users').countDocuments({ substationId: new ObjectId(id) });
    if (userCount > 0) {
        return res.status(409).json({ error: 'Cannot delete substation with users. Remove users first.' });
    }
    const result = await db.collection('substations').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Substation not found' });
    res.json({ message: 'Substation deleted' });
}