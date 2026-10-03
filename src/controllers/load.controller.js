import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';
import {
    slotsForDate,
    dhakaDateString,
    isSlotEditable,
    currentSlotKey,
    previousSlotKey,
    slotWindow,
    parseSlotKey,
} from '../services/slotService.js';
import { isSlotEditableForOperator } from '../services/settingsService.js';

// ---------- Ensure indexes ----------
let indexesEnsured = false;
async function ensureIndexes() {
    if (indexesEnsured) return;
    const db = getDB();
    await db.collection('loadEntries').createIndex(
        { substationId: 1, slotKey: 1 },
        { unique: true }
    );
    await db.collection('loadEntries').createIndex({ circleId: 1, slotKey: 1 });
    await db.collection('loadEntries').createIndex({ slotDate: 1 });
    indexesEnsured = true;
}

// ---------- GET /load/slots ----------
export async function listSlots(req, res) {
    try {
        const date = req.query.date || dhakaDateString();
        const role = req.user?.role;

        const slots = [];
        for (const s of slotsForDate(date)) {
            const w = slotWindow(s.slotKey);
            let editable;
            if (role === 'operator') {
                editable = await isSlotEditableForOperator(s.slotKey);
            } else {
                editable = isSlotEditable(s.slotKey);
            }
            slots.push({
                ...s,
                opensAt: w.opensAt,
                closesAt: w.closesAt,
                editable,
            });
        }

        res.json({
            date,
            current: currentSlotKey(),
            previous: previousSlotKey(),
            slots,
        });
    } catch (err) {
        console.error('listSlots error:', err);
        res.status(500).json({ error: 'Failed to list slots' });
    }
}

// ---------- GET /load/form ----------
export async function getForm(req, res) {
    try {
        await ensureIndexes();

        const { slotKey } = req.query;
        if (!slotKey) return res.status(400).json({ error: 'slotKey required' });
        if (!parseSlotKey(slotKey)) {
            return res.status(400).json({ error: 'Invalid slotKey format' });
        }

        const db = getDB();
        const role = req.user.role;
        let circleId;
        let mySubstationId = null;
        let canEdit = false;

        if (role === 'operator') {
            circleId = req.user.circleId;
            mySubstationId = req.user.substationId;
            canEdit = await isSlotEditableForOperator(slotKey);
        } else if (role === 'admin') {
            // circleId optional: omit or "all" → every circle / every SS
            circleId = req.query.circleId || 'all';
            canEdit = true;
        } else if (role === 'viewer') {
            circleId = req.query.circleId;
            if (!circleId || !ObjectId.isValid(circleId)) {
                return res.status(400).json({ error: 'circleId required for viewer' });
            }
            canEdit = false;
        } else {
            return res.status(403).json({ error: 'Not allowed' });
        }

        const allCircles = await db.collection('circles').find().sort({ name: 1 }).toArray();
        const circleById = {};
        for (const c of allCircles) circleById[c._id.toString()] = c;

        let targetCircles = [];
        if (role === 'admin' && (circleId === 'all' || circleId === '')) {
            targetCircles = allCircles;
        } else {
            if (!ObjectId.isValid(circleId)) {
                return res.status(400).json({ error: 'Invalid circleId' });
            }
            const c = circleById[circleId] || await db.collection('circles').findOne({ _id: new ObjectId(circleId) });
            if (!c) return res.status(404).json({ error: 'Circle not found' });
            targetCircles = [c];
        }

        const circleIds = targetCircles.map((c) => c._id);
        const substations = await db
            .collection('substations')
            .find({ circleId: { $in: circleIds }, active: true })
            .sort({ name: 1 })
            .toArray();

        // Order SS by circle name then SS name
        substations.sort((a, b) => {
            const ca = (circleById[a.circleId.toString()]?.name || '').localeCompare(
                circleById[b.circleId.toString()]?.name || ''
            );
            if (ca !== 0) return ca;
            return (a.name || '').localeCompare(b.name || '');
        });

        const ssIds = substations.map((s) => s._id);
        const entries = await db
            .collection('loadEntries')
            .find({ substationId: { $in: ssIds }, slotKey })
            .toArray();

        const entryBySS = {};
        for (const e of entries) entryBySS[e.substationId.toString()] = e;

        const rows = substations.map((ss) => {
            const e = entryBySS[ss._id.toString()];
            const isMine = role === 'operator' && ss._id.toString() === mySubstationId;
            const editable = (isMine && canEdit) || (role === 'admin' && canEdit);
            const c = circleById[ss.circleId.toString()];

            return {
                substationId: ss._id.toString(),
                substationName: ss.name,
                district: ss.district || '',
                circleId: ss.circleId.toString(),
                circleName: c?.name || '',
                editable,
                isMine,
                entry: e
                    ? {
                        actualLoad: e.actualLoad ?? null,
                        pgcbAllotment: e.pgcbAllotment ?? null,
                        loadshed: e.loadshed ?? null,
                        pbsLoad: e.pbsLoad ?? null,
                        pbsAllotment: e.pbsAllotment ?? null,
                        pbsLoadshed: e.pbsLoadshed ?? null,
                        note: e.note ?? '',
                        enteredAt: e.updatedAt || e.createdAt,
                    }
                    : null,
            };
        });

        const totals = rows.reduce(
            (acc, r) => {
                const e = r.entry;
                if (!e) return acc;
                acc.actualLoad += Number(e.actualLoad) || 0;
                acc.pgcbAllotment += Number(e.pgcbAllotment) || 0;
                acc.loadshed += Number(e.loadshed) || 0;
                acc.pbsLoad += Number(e.pbsLoad) || 0;
                acc.pbsAllotment += Number(e.pbsAllotment) || 0;
                acc.pbsLoadshed += Number(e.pbsLoadshed) || 0;
                acc.submitted += 1;
                return acc;
            },
            {
                actualLoad: 0,
                pgcbAllotment: 0,
                loadshed: 0,
                pbsLoad: 0,
                pbsAllotment: 0,
                pbsLoadshed: 0,
                submitted: 0,
            }
        );

        const parsed = parseSlotKey(slotKey);
        const window = slotWindow(slotKey);

        const primary = targetCircles[0];
        res.json({
            circle: primary
                ? { _id: primary._id.toString(), name: primary.name }
                : null,
            circles: targetCircles.map((c) => ({
                _id: c._id.toString(),
                name: c.name,
            })),
            multiCircle: targetCircles.length > 1,
            slotKey,
            window,
            editable: canEdit,
            isSpecial: parsed.minute === 30,
            rows,
            totals,
            totalSubstations: rows.length,
        });
    } catch (err) {
        console.error('getForm error:', err);
        res.status(500).json({ error: 'Failed to load form' });
    }
}

// ---------- POST /load/submit ----------
export async function submitLoad(req, res) {
    try {
        await ensureIndexes();

        const {
            slotKey,
            substationId,
            actualLoad,
            pgcbAllotment,
            loadshed,
            pbsLoad = null,
            pbsAllotment = null,
            pbsLoadshed = null,
            note = '',
        } = req.body;

        if (!slotKey || !substationId) {
            return res.status(400).json({ error: 'slotKey and substationId required' });
        }
        if (!parseSlotKey(slotKey)) {
            return res.status(400).json({ error: 'Invalid slotKey' });
        }
        if (!ObjectId.isValid(substationId)) {
            return res.status(400).json({ error: 'Invalid substationId' });
        }

        const db = getDB();
        const role = req.user.role;
        const ssId = new ObjectId(substationId);

        if (role === 'operator') {
            if (req.user.substationId !== substationId) {
                return res.status(403).json({ error: 'You can only edit your own substation' });
            }
            const can = await isSlotEditableForOperator(slotKey);
            if (!can) {
                return res.status(409).json({ error: 'Slot is not editable right now' });
            }
        } else if (role !== 'admin') {
            return res.status(403).json({ error: 'Not allowed' });
        }

        const ss = await db.collection('substations').findOne({ _id: ssId });
        if (!ss) return res.status(404).json({ error: 'Substation not found' });

        const now = new Date();

        const toNum = (v) => {
            if (v === '' || v === null || v === undefined) return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };

        const update = {
            circleId: ss.circleId,
            substationId: ssId,
            slotKey,
            slotDate: slotKey.slice(0, 10),
            actualLoad: toNum(actualLoad),
            pgcbAllotment: toNum(pgcbAllotment),
            loadshed: toNum(loadshed),
            pbsLoad: toNum(pbsLoad),
            pbsAllotment: toNum(pbsAllotment),
            pbsLoadshed: toNum(pbsLoadshed),
            note: note || '',
            updatedAt: now,
            lastEditedBy: new ObjectId(req.user.userId),
            editedByRole: role,
        };

        const existing = await db
            .collection('loadEntries')
            .findOne({ substationId: ssId, slotKey });

        if (existing) {
            await db.collection('loadEntries').updateOne(
                { _id: existing._id },
                {
                    $set: update,
                    $push: {
                        editHistory: {
                            userId: new ObjectId(req.user.userId),
                            role,
                            at: now,
                            changes: {
                                actualLoad: update.actualLoad,
                                pgcbAllotment: update.pgcbAllotment,
                                loadshed: update.loadshed,
                                pbsLoad: update.pbsLoad,
                                pbsAllotment: update.pbsAllotment,
                                pbsLoadshed: update.pbsLoadshed,
                                note: update.note,
                            },
                        },
                    },
                }
            );
            return res.json({ message: 'Updated', entryId: existing._id.toString() });
        }

        const doc = {
            ...update,
            createdAt: now,
            enteredBy: new ObjectId(req.user.userId),
            editHistory: [],
        };

        const result = await db.collection('loadEntries').insertOne(doc);
        res.status(201).json({ message: 'Submitted', entryId: result.insertedId.toString() });
    } catch (err) {
        console.error('submitLoad error:', err);
        res.status(500).json({ error: 'Failed to submit load' });
    }
}

// ---------- GET /load/circle-total ----------
export async function circleTotal(req, res) {
    try {
        const { circleId, slotKey } = req.query;
        if (!circleId || !slotKey) {
            return res.status(400).json({ error: 'circleId and slotKey required' });
        }
        if (!ObjectId.isValid(circleId)) {
            return res.status(400).json({ error: 'Invalid circleId' });
        }

        const db = getDB();
        const cid = new ObjectId(circleId);

        const subs = await db
            .collection('substations')
            .find({ circleId: cid, active: true })
            .project({ _id: 1 })
            .toArray();

        const ssIds = subs.map((s) => s._id);

        const entries = await db
            .collection('loadEntries')
            .find({ substationId: { $in: ssIds }, slotKey })
            .toArray();

        const totals = entries.reduce(
            (a, e) => {
                a.actualLoad += Number(e.actualLoad) || 0;
                a.pgcbAllotment += Number(e.pgcbAllotment) || 0;
                a.loadshed += Number(e.loadshed) || 0;
                a.pbsLoad += Number(e.pbsLoad) || 0;
                a.pbsAllotment += Number(e.pbsAllotment) || 0;
                a.pbsLoadshed += Number(e.pbsLoadshed) || 0;
                a.submitted += 1;
                return a;
            },
            {
                actualLoad: 0,
                pgcbAllotment: 0,
                loadshed: 0,
                pbsLoad: 0,
                pbsAllotment: 0,
                pbsLoadshed: 0,
                submitted: 0,
            }
        );

        res.json({ circleId, slotKey, totals, totalSubstations: ssIds.length });
    } catch (err) {
        console.error('circleTotal error:', err);
        res.status(500).json({ error: 'Failed to compute total' });
    }
}

// ---------- GET /load/current-status ----------
// Optional query: slotKey=YYYY-MM-DDTHH:MM  (defaults to current slot)
export async function currentStatus(req, res) {
    try {
        const db = getDB();
        const requested = req.query.slotKey;
        const dateQ = req.query.date;
        const liveKey = currentSlotKey();
        const today = dhakaDateString();
        const parsedReq = requested && parseSlotKey(requested) ? parseSlotKey(requested) : null;
        const date =
            parsedReq?.date ||
            (typeof dateQ === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateQ) ? dateQ : today);

        let slotKey;
        if (parsedReq) {
            slotKey = requested;
        } else if (date === today && liveKey) {
            slotKey = liveKey;
        } else {
            slotKey = `${date}T00:00`;
        }
        const window = slotKey ? slotWindow(slotKey) : null;
        const parsed = slotKey ? parseSlotKey(slotKey) : null;

        const circles = await db.collection('circles').find().sort({ name: 1 }).toArray();
        // Include all substations (active preferred; inactive still listed as inactive flag)
        const allSubs = await db
            .collection('substations')
            .find({})
            .sort({ name: 1 })
            .toArray();

        const activeSubs = allSubs.filter((s) => s.active !== false);
        const ssIds = activeSubs.map((s) => s._id);
        const entries = slotKey && ssIds.length
            ? await db
                .collection('loadEntries')
                .find({ substationId: { $in: ssIds }, slotKey })
                .toArray()
            : [];

        const entryBySS = {};
        for (const e of entries) entryBySS[e.substationId.toString()] = e;

        const result = [];
        const grand = {
            actualLoad: 0,
            pgcbAllotment: 0,
            loadshed: 0,
            pbsLoad: 0,
            pbsAllotment: 0,
            pbsLoadshed: 0,
            submitted: 0,
            pending: 0,
            totalSubstations: 0,
        };

        for (const c of circles) {
            const cid = c._id.toString();
            // Robust circleId match (ObjectId or string)
            const subs = activeSubs.filter((s) => {
                const sc = s.circleId;
                if (!sc) return false;
                return sc.toString() === cid;
            });
            const substations = [];
            const totals = {
                actualLoad: 0,
                pgcbAllotment: 0,
                loadshed: 0,
                pbsLoad: 0,
                pbsAllotment: 0,
                pbsLoadshed: 0,
            };
            let submitted = 0;

            for (const ss of subs) {
                const e = entryBySS[ss._id.toString()] || null;
                const has = Boolean(e);
                if (has) {
                    submitted += 1;
                    totals.actualLoad += Number(e.actualLoad) || 0;
                    totals.pgcbAllotment += Number(e.pgcbAllotment) || 0;
                    totals.loadshed += Number(e.loadshed) || 0;
                    totals.pbsLoad += Number(e.pbsLoad) || 0;
                    totals.pbsAllotment += Number(e.pbsAllotment) || 0;
                    totals.pbsLoadshed += Number(e.pbsLoadshed) || 0;
                }
                substations.push({
                    substationId: ss._id.toString(),
                    substationName: ss.name,
                    district: ss.district || '',
                    submitted: has,
                    actualLoad: has ? Number(e.actualLoad) || 0 : null,
                    pgcbAllotment: has ? Number(e.pgcbAllotment) || 0 : null,
                    loadshed: has ? Number(e.loadshed) || 0 : null,
                    pbsLoad: has ? Number(e.pbsLoad) || 0 : null,
                    note: has ? (e.note || '') : '',
                    updatedAt: has ? (e.updatedAt || e.createdAt) : null,
                });
            }

            const pending = subs.length - submitted;
            grand.actualLoad += totals.actualLoad;
            grand.pgcbAllotment += totals.pgcbAllotment;
            grand.loadshed += totals.loadshed;
            grand.pbsLoad += totals.pbsLoad;
            grand.pbsAllotment += totals.pbsAllotment;
            grand.pbsLoadshed += totals.pbsLoadshed;
            grand.submitted += submitted;
            grand.pending += pending;
            grand.totalSubstations += subs.length;

            result.push({
                circleId: cid,
                circleName: c.name,
                totalSubstations: subs.length,
                submitted,
                pending,
                totals,
                substations,
            });
        }

        const todaySlots = slotsForDate(date).map((s) => ({
            slotKey: s.slotKey,
            label: s.label,
            isSpecial: s.isSpecial,
            isCurrent: s.slotKey === liveKey,
        }));

        res.json({
            slotKey,
            liveSlotKey: liveKey,
            date,
            label: parsed ? `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}` : null,
            isLive: Boolean(slotKey && slotKey === liveKey),
            opensAt: window?.opensAt || null,
            closesAt: window?.closesAt || null,
            slots: todaySlots,
            totals: grand,
            circles: result,
        });
    } catch (err) {
        console.error('currentStatus error:', err);
        res.status(500).json({ error: 'Failed to load status' });
    }
}

// ---------- GET /load/history ----------
export async function history(req, res) {
    try {
        const { circleId, from, to } = req.query;
        if (!circleId || !from || !to) {
            return res.status(400).json({ error: 'circleId, from, to required' });
        }
        if (!ObjectId.isValid(circleId)) {
            return res.status(400).json({ error: 'Invalid circleId' });
        }

        const db = getDB();
        const cid = new ObjectId(circleId);

        const subs = await db
            .collection('substations')
            .find({ circleId: cid, active: true })
            .project({ _id: 1 })
            .toArray();

        const ssIds = subs.map((s) => s._id);

        const entries = await db
            .collection('loadEntries')
            .find({
                substationId: { $in: ssIds },
                slotDate: { $gte: from, $lte: to },
            })
            .sort({ slotKey: 1 })
            .toArray();

        const bySlot = {};
        for (const e of entries) {
            if (!bySlot[e.slotKey]) bySlot[e.slotKey] = [];
            bySlot[e.slotKey].push(e);
        }

        const rows = Object.entries(bySlot).map(([slotKey, list]) => {
            const totals = list.reduce(
                (a, e) => {
                    a.actualLoad += Number(e.actualLoad) || 0;
                    a.pgcbAllotment += Number(e.pgcbAllotment) || 0;
                    a.loadshed += Number(e.loadshed) || 0;
                    a.pbsLoad += Number(e.pbsLoad) || 0;
                    a.pbsAllotment += Number(e.pbsAllotment) || 0;
                    a.pbsLoadshed += Number(e.pbsLoadshed) || 0;
                    return a;
                },
                {
                    actualLoad: 0,
                    pgcbAllotment: 0,
                    loadshed: 0,
                    pbsLoad: 0,
                    pbsAllotment: 0,
                    pbsLoadshed: 0,
                }
            );
            return { slotKey, submitted: list.length, totals };
        });

        res.json({ circleId, from, to, rows });
    } catch (err) {
        console.error('history error:', err);
        res.status(500).json({ error: 'Failed to load history' });
    }
}

// ---------- GET /load/reports ----------
export async function reports(req, res) {
    try {
        const { scope = 'circle', id, period = 'daily', date } = req.query;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Valid id required' });
        }

        const anchor = date || dhakaDateString();
        const [Y, M, D] = anchor.split('-').map(Number);
        const anchorDate = new Date(Date.UTC(Y, M - 1, D));

        let from;
        let to;

        if (period === 'daily') {
            from = anchor;
            to = anchor;
        } else if (period === 'weekly') {
            const start = new Date(anchorDate);
            start.setUTCDate(start.getUTCDate() - 6);
            from = start.toISOString().slice(0, 10);
            to = anchor;
        } else {
            const first = new Date(Date.UTC(Y, M - 1, 1));
            const last = new Date(Date.UTC(Y, M, 0));
            from = first.toISOString().slice(0, 10);
            to = last.toISOString().slice(0, 10);
        }

        const db = getDB();
        let ssIds = [];
        let label = '';

        if (scope === 'circle') {
            const subs = await db
                .collection('substations')
                .find({ circleId: new ObjectId(id), active: true })
                .project({ _id: 1 })
                .toArray();
            ssIds = subs.map((s) => s._id);
            const circle = await db.collection('circles').findOne({ _id: new ObjectId(id) });
            label = circle?.name || 'Circle';
        } else {
            ssIds = [new ObjectId(id)];
            const ss = await db.collection('substations').findOne({ _id: new ObjectId(id) });
            label = ss?.name || 'Substation';
        }

        const entries = await db
            .collection('loadEntries')
            .find({
                substationId: { $in: ssIds },
                slotDate: { $gte: from, $lte: to },
            })
            .sort({ slotKey: 1 })
            .toArray();

        const grouped = {};
        for (const e of entries) {
            const key = period === 'daily' ? e.slotKey : e.slotDate;
            if (!grouped[key]) {
                grouped[key] = {
                    actualLoad: 0,
                    pgcbAllotment: 0,
                    loadshed: 0,
                    pbsLoad: 0,
                    pbsAllotment: 0,
                    pbsLoadshed: 0,
                    count: 0,
                };
            }
            grouped[key].actualLoad += Number(e.actualLoad) || 0;
            grouped[key].pgcbAllotment += Number(e.pgcbAllotment) || 0;
            grouped[key].loadshed += Number(e.loadshed) || 0;
            grouped[key].pbsLoad += Number(e.pbsLoad) || 0;
            grouped[key].pbsAllotment += Number(e.pbsAllotment) || 0;
            grouped[key].pbsLoadshed += Number(e.pbsLoadshed) || 0;
            grouped[key].count += 1;
        }

        const series = Object.entries(grouped).map(([key, v]) => ({
            key,
            label: period === 'daily' ? key.split('T')[1] : key,
            actualLoad: +v.actualLoad.toFixed(2),
            pgcbAllotment: +v.pgcbAllotment.toFixed(2),
            loadshed: +v.loadshed.toFixed(2),
            pbsLoad: +v.pbsLoad.toFixed(2),
            pbsAllotment: +v.pbsAllotment.toFixed(2),
            pbsLoadshed: +v.pbsLoadshed.toFixed(2),
        }));

        res.json({ scope, id, label, period, from, to, series });
    } catch (err) {
        console.error('reports error:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
}