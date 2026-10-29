import { MongoClient, type Db } from 'mongodb';

import type { MongoHealth } from './types';

const mongoCache = globalThis as unknown as {
  __transitMongoClient?: MongoClient;
  __transitMongoClientPromise?: Promise<MongoClient>;
};

export function getMongoUri(): string {
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }
  const host = process.env.MONGO_HOST ?? 'localhost';
  const port = process.env.MONGO_PORT ?? '27017';
  const database = process.env.MONGO_INITDB_DATABASE ?? 'transit_db';
  return `mongodb://${host}:${port}/${database}`;
}

export function getMongoDatabaseName(): string {
  const uriDatabase = new URL(getMongoUri()).pathname.replace(/^\//, '');
  return uriDatabase || process.env.MONGO_INITDB_DATABASE || 'transit_db';
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!mongoCache.__transitMongoClientPromise) {
    const client = new MongoClient(getMongoUri(), {
      maxPoolSize: Number(process.env.MONGO_POOL_MAX ?? 20),
      serverSelectionTimeoutMS: 10_000,
    });
    mongoCache.__transitMongoClient = client;
    mongoCache.__transitMongoClientPromise = client.connect();
  }
  return mongoCache.__transitMongoClientPromise;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getMongoDatabaseName());
}

export async function checkMongoHealth(): Promise<MongoHealth> {
  const startedAt = performance.now();
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const disruptionEventCount = await db
      .collection('disruption_events')
      .countDocuments({});
    return {
      connected: true,
      database: db.databaseName,
      collections: collections.length,
      disruptionEventCount,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closeMongo(): Promise<void> {
  if (mongoCache.__transitMongoClient) {
    await mongoCache.__transitMongoClient.close();
  }
  mongoCache.__transitMongoClient = undefined;
  mongoCache.__transitMongoClientPromise = undefined;
}
