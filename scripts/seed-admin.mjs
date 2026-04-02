import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

const ADMIN = {
  name: 'Admin',
  surname: 'inVision',
  email: 'admin@invision.edu',
  phone: '+77000000000',
  password: 'Admin1234!',
  role: 'Admin',
};

const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db();
  const users = db.collection('users');

  const existing = await users.findOne({ email: ADMIN.email });
  if (existing) {
    console.log(`Admin already exists with id: ${existing._id.toHexString()}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(ADMIN.password, 12);
  const now = new Date();

  const result = await users.insertOne({
    name: ADMIN.name,
    surname: ADMIN.surname,
    email: ADMIN.email,
    phone: ADMIN.phone,
    passwordHash,
    role: ADMIN.role,
    createdAt: now,
    updatedAt: now,
  });

  console.log('✅ Admin account created:');
  console.log(`   id    : ${result.insertedId.toHexString()}`);
  console.log(`   email : ${ADMIN.email}`);
  console.log(`   pass  : ${ADMIN.password}`);
} finally {
  await client.close();
}
