import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

export async function listCircles(req, res) {
    const db = getDB();
    const circles = await db.collection('circles').find().sort({ name: 1 }).toArray();
    res.json({ circles });
}

export async function createCircle(req, res) {
    const { name, districts = [] } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const db = getDB();
    const exists = await db.collection('circles').findOne({ name });
    if (exists) return res.status(409).json({ error: 'Circle already exists' });

    const doc = { name, districts, createdAt: new Date(), updatedAt: new Date() };
    const result = await db.collection('circles').insertOne(doc);
    res.status(201).json({ circle: { _id: result.insertedId, ...doc } });
}

export async function updateCircle(req, res) {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const { name, districts } = req.body;
    const update = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (districts !== undefined) update.districts = districts;

    const db = getDB();
    const result = await db.collection('circles').findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: update },
        { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ error: 'Circle not found' });
    res.json({ circle: result.value });
}

export async function deleteCircle(req, res) {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const db = getDB();
    const ssCount = await db.collection('substations').countDocuments({ circleId: new ObjectId(id) });
    if (ssCount > 0) {
        return res.status(409).json({ error: 'Cannot delete circle with substations. Remove substations first.' });
    }

    const result = await db.collection('circles').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Circle not found' });
    res.json({ message: 'Circle deleted' });
}