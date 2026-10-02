import '../config/env.js';
import { connectDB, closeDB, getDB } from '../config/db.js';
import { hashPassword } from '../utils/bcrypt.js';

async function seed() {
    await connectDB();
    const db = getDB();

    console.log('🌱 Seeding...');

    // Clear everything (dev only)
    await db.collection('users').deleteMany({});
    await db.collection('circles').deleteMany({});
    await db.collection('substations').deleteMany({});
    await db.collection('loadEntries').deleteMany({});
    await db.collection('settings').deleteMany({});
    console.log('🧹 Cleared users, circles, substations, loadEntries, settings');

    // ---- Admin ----
    await db.collection('users').insertOne({
        role: 'admin',
        name: 'Site Admin',
        email: 'admin@wzpdcl.local',
        passwordHash: await hashPassword('admin123'),
        circleId: null,
        substationId: null,
        viewerCircles: [],
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    console.log('👤 Admin created: admin@wzpdcl.local / admin123');

    // ---- Circle: Kushtia ----
    const circleRes = await db.collection('circles').insertOne({
        name: 'Kushtia',
        districts: ['Kushtia', 'Chuadanga', 'Meherpur', 'Jhenaidah'],
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const circleId = circleRes.insertedId;
    console.log(`🟦 Circle created: Kushtia (${circleId})`);

    // ---- Substations ----
    const ssList = [
        { name: 'Kushtia (Bottail)', district: 'Kushtia' },
        { name: 'Chuadanga', district: 'Chuadanga' },
        { name: 'Meherpur', district: 'Meherpur' },
        { name: 'Jhenaidah', district: 'Jhenaidah' },
        { name: 'Bheramara', district: 'Kushtia' },
    ];
    const ssDocs = ssList.map((s) => ({
        circleId,
        name: s.name,
        district: s.district,
        hasPBS: false,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    }));
    const ssRes = await db.collection('substations').insertMany(ssDocs);
    console.log(`⚡ ${ssRes.insertedCount} substations created`);
    Object.entries(ssRes.insertedIds).forEach(([i, id]) => {
        console.log(`   - ${ssList[i].name} → ${id}`);
    });

    // ---- Operator (Bottail) ----
    const bottailId = ssRes.insertedIds[0];
    await db.collection('users').insertOne({
        role: 'operator',
        name: 'Bottail Operator',
        email: null,
        passwordHash: await hashPassword('ss123'),
        circleId,
        substationId: bottailId,
        viewerCircles: [],
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    console.log('👷 Operator created for "Kushtia (Bottail)" (password: ss123)');

    // ---- Viewer ----
    await db.collection('users').insertOne({
        role: 'viewer',
        name: 'Kushtia Viewer',
        email: 'viewer@wzpdcl.local',
        passwordHash: await hashPassword('viewer123'),
        circleId: null,
        substationId: null,
        viewerCircles: [circleId],
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    console.log('👁️  Viewer created: viewer@wzpdcl.local / viewer123');

    // ---- Settings: default always-open slots ----
    await db.collection('settings').insertOne({
        key: 'alwaysOpenSlots',
        value: [
            '00:00', '01:00', '02:00', '03:00', '04:00',
            '05:00', '06:00', '07:00', '08:00',
        ],
        updatedAt: new Date(),
        updatedBy: null,
    });
    console.log('⚙️  Always-open slots (default): 00:00 – 08:00');

    console.log('\n✅ Seed complete.');
    console.log('\n📋 Credentials:');
    console.log('   Admin   : admin@wzpdcl.local / admin123');
    console.log('   Viewer  : viewer@wzpdcl.local / viewer123');
    console.log(`   Operator: circle=${circleId} ss=${bottailId} pass=ss123`);

    await closeDB();
    process.exit(0);
}

seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});