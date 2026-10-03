import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

async function attachCircleNames(db, substations) {
    const ids = [
        ...new Set(
            substations
                .map((s) => s.circleId?.toString())
                .filter(Boolean)
        ),
    ];
    if (!ids.length) return substations.map((s) => ({ ...s, circleName: '' }));

    const circles = await db
        .collection('circles')
        .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
        .project({ name: 1 })
        .toArray();
    const map = {};
    for (const c of circles) map[c._id.toString()] = c.name;

    return substations.map((s) => ({
        ...s,
        circleName: map[s.circleId?.toString()] || '',
    }));
}

export async function listSubstations(req, res) {
    try {
        const { circleId } = req.query;
        const db = getDB();
        const filter = {};
        if (circleId) {
            if (!ObjectId.isValid(circleId)) {
                return res.status(400).json({ error: 'Invalid circleId' });
            }
            filter.circleId = new ObjectId(circleId);
        }
        const list = await db
            .collection('substations')
            .find(filter)
            .sort({ name: 1 })
            .toArray();
        const substations = await attachCircleNames(db, list);
        res.json({ substations });
    } catch (err) {
        console.error('listSubstations error:', err);
        res.status(500).json({ error: 'Failed to list substations' });
    }
}

export async function listPublicSubstations(req, res) {
    try {
        const { circleId } = req.query;
        if (!circleId || !ObjectId.isValid(circleId)) {
            return res.status(400).json({ error: 'Invalid circleId' });
        }
        const db = getDB();
        const list = await db
            .collection('substations')
            .find({ circleId: new ObjectId(circleId), active: true })
            .project({ name: 1, district: 1, zone: 1 })
            .sort({ name: 1 })
            .toArray();
        res.json({ substations: list });
    } catch (err) {
        console.error('listPublicSubstations error:', err);
        res.status(500).json({ error: 'Failed to list substations' });
    }
}

export async function createSubstation(req, res) {
    try {
        let { circleId, name, district, zone, hasPBS = false } = req.body;
        name = (name || '').trim();
        district = (district || '').trim();
        zone = (zone || '').trim();

        if (!circleId || !name) {
            return res.status(400).json({ error: 'circleId and name required' });
        }
        if (!ObjectId.isValid(circleId)) {
            return res.status(400).json({ error: 'Invalid circleId' });
        }

        const db = getDB();
        const circle = await db.collection('circles').findOne({ _id: new ObjectId(circleId) });
        if (!circle) return res.status(404).json({ error: 'Circle not found' });

        const doc = {
            circleId: new ObjectId(circleId),
            name,
            district,
            zone,
            hasPBS: Boolean(hasPBS),
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const result = await db.collection('substations').insertOne(doc);
        res.status(201).json({
            substation: {
                _id: result.insertedId,
                ...doc,
                circleName: circle.name,
            },
        });
    } catch (err) {
        console.error('createSubstation error:', err);
        res.status(500).json({ error: 'Failed to create substation' });
    }
}

export async function updateSubstation(req, res) {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

        const { name, district, zone, hasPBS, active, circleId } = req.body;
        const update = { updatedAt: new Date() };
        if (name !== undefined) update.name = String(name).trim();
        if (district !== undefined) update.district = String(district).trim();
        if (zone !== undefined) update.zone = String(zone).trim();
        if (hasPBS !== undefined) update.hasPBS = Boolean(hasPBS);
        if (active !== undefined) update.active = Boolean(active);
        if (circleId !== undefined) {
            if (!ObjectId.isValid(circleId)) {
                return res.status(400).json({ error: 'Invalid circleId' });
            }
            update.circleId = new ObjectId(circleId);
        }

        const db = getDB();
        const result = await db.collection('substations').findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: update },
            { returnDocument: 'after' }
        );
        const substation = result?.value ?? result;
        if (!substation || !substation._id) {
            return res.status(404).json({ error: 'Substation not found' });
        }

        const [withName] = await attachCircleNames(db, [substation]);
        res.json({ substation: withName });
    } catch (err) {
        console.error('updateSubstation error:', err);
        res.status(500).json({ error: 'Failed to update substation' });
    }
}

export async function deleteSubstation(req, res) {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

        const db = getDB();
        const userCount = await db
            .collection('users')
            .countDocuments({ substationId: new ObjectId(id) });
        if (userCount > 0) {
            return res.status(409).json({
                error: 'Cannot delete substation with users. Remove users first.',
            });
        }
        const result = await db.collection('substations').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Substation not found' });
        }
        res.json({ message: 'Substation deleted' });
    } catch (err) {
        console.error('deleteSubstation error:', err);
        res.status(500).json({ error: 'Failed to delete substation' });
    }
}
