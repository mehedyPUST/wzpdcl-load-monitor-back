import { getDB } from '../config/db.js';

const ALWAYS_OPEN_KEY = 'alwaysOpenSlots';

export async function getAlwaysOpenSlots() {
    const db = getDB();
    const doc = await db.collection('settings').findOne({ key: ALWAYS_OPEN_KEY });
    return doc?.value || [];
}

export async function setAlwaysOpenSlots(slots, adminId) {
    const db = getDB();
    await db.collection('settings').updateOne(
        { key: ALWAYS_OPEN_KEY },
        {
            $set: {
                key: ALWAYS_OPEN_KEY,
                value: slots,
                updatedAt: new Date(),
                updatedBy: adminId,
            },
        },
        { upsert: true }
    );
    return slots;
}

// Time-of-day extractor: "2026-10-02T08:00" → "08:00"
export function timeOfDayFromSlotKey(slotKey) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(slotKey);
    return m ? m[2] : null;
}

// Combine strict window + always-open list
export async function isSlotEditableForOperator(slotKey, now = new Date()) {
    // Imported lazily to avoid circular deps with slotService
    const { isSlotEditable } = await import('./slotService.js');
    if (isSlotEditable(slotKey, now)) return true;
    const t = timeOfDayFromSlotKey(slotKey);
    if (!t) return false;
    const alwaysOpen = await getAlwaysOpenSlots();
    return alwaysOpen.includes(t);
}