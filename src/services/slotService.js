// 26 slots per day:
//   - 24 standard hourly: 00:00 → 23:00 (all hours)
//   - 2 special half-hour: 18:30 and 19:30
// Timezone: Asia/Dhaka (UTC+6, no DST)

const TZ_OFFSET_MIN = 6 * 60;

function pad2(n) {
    return String(n).padStart(2, '0');
}

function toDhakaParts(date = new Date()) {
    const d = new Date(date.getTime() + TZ_OFFSET_MIN * 60 * 1000);
    return {
        Y: d.getUTCFullYear(),
        M: d.getUTCMonth() + 1,
        D: d.getUTCDate(),
        h: d.getUTCHours(),
        m: d.getUTCMinutes(),
    };
}

export function dhakaDateString(date = new Date()) {
    const { Y, M, D } = toDhakaParts(date);
    return `${Y}-${pad2(M)}-${pad2(D)}`;
}

function shiftDate(dateStr, days) {
    const [Y, M, D] = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(Y, M - 1, D));
    d.setUTCDate(d.getUTCDate() + days);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// ---------- 26 slots per day ----------
export function slotsForDate(dateStr) {
    const slots = [];

    // 24 standard hourly slots (00:00 → 23:00)
    for (let h = 0; h < 24; h++) {
        slots.push({
            label: `${pad2(h)}:00`,
            slotKey: `${dateStr}T${pad2(h)}:00`,
            hour: h,
            minute: 0,
            isSpecial: false,
        });
    }

    // 2 special half-hour slots
    slots.push({
        label: '18:30',
        slotKey: `${dateStr}T18:30`,
        hour: 18,
        minute: 30,
        isSpecial: true,
    });
    slots.push({
        label: '19:30',
        slotKey: `${dateStr}T19:30`,
        hour: 19,
        minute: 30,
        isSpecial: true,
    });

    // Sort chronologically
    slots.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    return slots;
}

export function parseSlotKey(slotKey) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(slotKey);
    if (!m) return null;
    return { date: m[1], hour: Number(m[2]), minute: Number(m[3]) };
}

function slotStartUtc(dateStr, hour, minute) {
    const [Y, M, D] = dateStr.split('-').map(Number);
    const utcMs = Date.UTC(Y, M - 1, D, hour, minute, 0, 0) - TZ_OFFSET_MIN * 60 * 1000;
    return new Date(utcMs);
}

export function slotWindow(slotKey) {
    const p = parseSlotKey(slotKey);
    if (!p) return null;
    const { date, hour, minute } = p;

    const opensAt = slotStartUtc(date, hour, minute);
    opensAt.setUTCMinutes(opensAt.getUTCMinutes() - 5);

    const slots = slotsForDate(date);
    const idx = slots.findIndex((s) => s.hour === hour && s.minute === minute);
    let closesAt;
    if (idx >= 0 && idx < slots.length - 1) {
        const nxt = slots[idx + 1];
        closesAt = slotStartUtc(date, nxt.hour, nxt.minute);
    } else {
        // Last slot of the day → closes at next day 00:00
        closesAt = slotStartUtc(shiftDate(date, 1), 0, 0);
    }
    return { opensAt, closesAt };
}

export function isSlotEditable(slotKey, now = new Date()) {
    const w = slotWindow(slotKey);
    if (!w) return false;
    return now >= w.opensAt && now < w.closesAt;
}

export function currentSlotKey(now = new Date()) {
    const today = dhakaDateString(now);
    for (const s of slotsForDate(today)) {
        const w = slotWindow(s.slotKey);
        if (now >= w.opensAt && now < w.closesAt) return s.slotKey;
    }
    return null;
}

export function previousSlotKey(now = new Date()) {
    const today = dhakaDateString(now);
    const all = [
        ...slotsForDate(shiftDate(today, -1)),
        ...slotsForDate(today),
    ];
    for (let i = 0; i < all.length; i++) {
        const w = slotWindow(all[i].slotKey);
        if (now < w.opensAt) {
            return i > 0 ? all[i - 1].slotKey : null;
        }
    }
    return all[all.length - 1].slotKey;
}

export function nextSlotKey(slotKey) {
    const p = parseSlotKey(slotKey);
    if (!p) return null;
    const slots = slotsForDate(p.date);
    const idx = slots.findIndex((s) => s.hour === p.hour && s.minute === p.minute);
    if (idx === -1) return null;
    if (idx < slots.length - 1) return slots[idx + 1].slotKey;
    return `${shiftDate(p.date, 1)}T00:00`;
}