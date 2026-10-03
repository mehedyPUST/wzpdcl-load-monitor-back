import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

export async function listCircles(req, res) {
    try {
        const db = getDB();
        const circles = await db.collection('circles').find().sort({ name: 1 }).toArray();
        res.json({ circles });
    } catch (err) {
        console.error('listCircles error:', err);
        res.status(500).json({ error: 'Failed to list circles' });
    }
}

export async function createCircle(req, res) {
    try {
        let { name, districts = [] } = req.body;
        name = (name || '').trim();
        if (!name) return res.status(400).json({ error: 'Circle name is required' });

        if (typeof districts === 'string') {
            districts = districts
                .split(',')
                .map((d) => d.trim())
                .filter(Boolean);
        }
        if (!Array.isArray(districts)) districts = [];
        districts = districts.map((d) => String(d).trim()).filter(Boolean);

        const db = getDB();
        const exists = await db.collection('circles').findOne({
            name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        });
        if (exists) return res.status(409).json({ error: 'Circle with this name already exists' });

        const doc = {
            name,
            districts,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const result = await db.collection('circles').insertOne(doc);
        res.status(201).json({ circle: { _id: result.insertedId, ...doc } });
    } catch (err) {
        console.error('createCircle error:', err);
        res.status(500).json({ error: err.message || 'Failed to create circle' });
    }
}

export async function updateCircle(req, res) {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

        let { name, districts } = req.body;
        const update = { updatedAt: new Date() };
        if (name !== undefined) {
            name = String(name).trim();
            if (!name) return res.status(400).json({ error: 'Name cannot be empty' });
            update.name = name;
        }
        if (districts !== undefined) {
            if (typeof districts === 'string') {
                districts = districts
                    .split(',')
                    .map((d) => d.trim())
                    .filter(Boolean);
            }
            update.districts = Array.isArray(districts)
                ? districts.map((d) => String(d).trim()).filter(Boolean)
                : [];
        }

        const db = getDB();
        const result = await db.collection('circles').findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: update },
            { returnDocument: 'after' }
        );
        const circle = result?.value ?? result;
        if (!circle || !circle._id) return res.status(404).json({ error: 'Circle not found' });
        res.json({ circle });
    } catch (err) {
        console.error('updateCircle error:', err);
        res.status(500).json({ error: 'Failed to update circle' });
    }
}

export async function deleteCircle(req, res) {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

        const db = getDB();
        const ssCount = await db.collection('substations').countDocuments({
            circleId: new ObjectId(id),
        });
        if (ssCount > 0) {
            return res.status(409).json({
                error: `Cannot delete circle with ${ssCount} substation(s). Remove substations first.`,
            });
        }

        const result = await db.collection('circles').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Circle not found' });
        res.json({ message: 'Circle deleted' });
    } catch (err) {
        console.error('deleteCircle error:', err);
        res.status(500).json({ error: 'Failed to delete circle' });
    }
}
