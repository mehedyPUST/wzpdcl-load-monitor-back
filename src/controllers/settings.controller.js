import { getDB } from '../config/db.js';
import { ObjectId } from 'mongodb';
import { getAlwaysOpenSlots, setAlwaysOpenSlots } from '../services/settingsService.js';

// GET /admin/settings/always-open-slots
export async function getAlwaysOpen(req, res) {
    const slots = await getAlwaysOpenSlots();
    res.json({ slots });
}

// PUT /admin/settings/always-open-slots
// Body: { slots: ["00:00", "01:00", ...] }
export async function updateAlwaysOpen(req, res) {
    const { slots } = req.body;
    if (!Array.isArray(slots)) {
        return res.status(400).json({ error: 'slots must be an array of "HH:MM" strings' });
    }
    // Validate format
    const re = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const clean = [];
    for (const s of slots) {
        if (typeof s !== 'string' || !re.test(s)) {
            return res.status(400).json({ error: `Invalid slot time: ${s}` });
        }
        if (!clean.includes(s)) clean.push(s);
    }
    clean.sort();

    await setAlwaysOpenSlots(clean, new ObjectId(req.user.userId));
    res.json({ slots: clean });
}

// GET /admin/settings/all
export async function getAllSettings(req, res) {
    const alwaysOpen = await getAlwaysOpenSlots();
    res.json({ alwaysOpenSlots: alwaysOpen });
}