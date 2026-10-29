import 'dotenv/config';

import { checkMongoHealth, closeMongo } from '../src/lib/mongodb';
import { checkPostgresHealth, closePostgres } from '../src/lib/postgres';

async function main(): Promise<void> {
  const [postgres, mongodb] = await Promise.all([
    checkPostgresHealth(),
    checkMongoHealth(),
  ]);

  console.log('PostgreSQL:', JSON.stringify(postgres, null, 2));
  console.log('MongoDB:', JSON.stringify(mongodb, null, 2));

  if (!postgres.connected || !mongodb.connected) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([closePostgres(), closeMongo()]);
  });
