import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import { getMongoClient, getMongoDatabaseName, closeMongo } from '../src/lib/mongodb';
import { getClient, query, closePostgres } from '../src/lib/postgres';

const POSTGRES_FILES = [
  '01_schema.sql',
  '02_views.sql',
  '03_recursive_cte.sql',
  '04_roles_rls.sql',
  '05_seed_network.sql',
];

const MONGO_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'incident_code',
      'incident_type',
      'severity',
      'reported_at',
      'source',
      'affected_scope',
    ],
    properties: {
      incident_code: {
        bsonType: 'string',
        pattern: '^DISR-[0-9]{4}-[0-9]{4}$',
        description: 'Unique incident identifier matching pattern DISR-YYYY-XXXX',
      },
      incident_type: {
        bsonType: 'string',
        enum: [
          'CATENARY_POWER_FAILURE',
          'SIGNAL_SYSTEM_FAULT',
          'TRACK_OBSTRUCTION',
          'ROLLING_STOCK_DEFECT',
          'SEVERE_WEATHER_ALERT',
          'POLICE_INVESTIGATION',
        ],
        description: 'Standardized disruption classification',
      },
      severity: {
        bsonType: 'string',
        enum: ['MINOR', 'MODERATE', 'SEVERE', 'CRITICAL'],
        description: 'Operational severity level',
      },
      reported_at: {
        bsonType: ['date', 'string'],
        description: 'Timestamp when incident was registered',
      },
      source: {
        bsonType: 'string',
        description: 'Reporting entity, SCADA sensor, or external agency',
      },
      affected_scope: {
        bsonType: 'object',
        required: ['primary_line_code', 'stations_affected'],
        properties: {
          primary_line_code: {
            bsonType: 'string',
            description: 'Primary transit line identifier',
          },
          track_segment_ids: {
            bsonType: 'array',
            items: { bsonType: ['int', 'long', 'double'] },
            description: 'Physical track segment IDs affected',
          },
          stations_affected: {
            bsonType: 'array',
            items: { bsonType: 'string' },
            description: 'List of station codes impacted',
          },
        },
      },
      temporal_window: {
        bsonType: 'object',
        properties: {
          estimated_start: { bsonType: ['date', 'string', 'null'] },
          estimated_cleared: { bsonType: ['date', 'string', 'null'] },
        },
      },
      raw_telemetry: {
        bsonType: 'object',
        description:
          'Polymorphic payload: SCADA sensors, weather readings, or police dispatch notes',
      },
      postgres_sync: {
        bsonType: 'object',
        properties: {
          status: {
            bsonType: 'string',
            enum: ['PENDING', 'APPLIED', 'FAILED'],
          },
          cascade_trips_affected: { bsonType: ['int', 'long', 'double'] },
          passengers_affected: { bsonType: ['int', 'long', 'double'] },
          applied_at: { bsonType: ['date', 'string', 'null'] },
        },
      },
    },
  },
};

const SEED_DISRUPTIONS = [
  {
    incident_code: 'DISR-2026-0891',
    incident_type: 'CATENARY_POWER_FAILURE',
    severity: 'CRITICAL',
    reported_at: new Date('2026-10-29T08:15:00Z'),
    source: 'SCADA_SENSOR_GRID_NODE_4',
    affected_scope: {
      primary_line_code: 'RED_LINE',
      track_segment_ids: [104, 105],
      stations_affected: ['STN_CENTRAL', 'STN_NORTH'],
    },
    temporal_window: {
      estimated_start: new Date('2026-10-29T08:15:00Z'),
      estimated_cleared: new Date('2026-10-29T11:30:00Z'),
    },
    raw_telemetry: {
      sensor_model: 'ABB-Overhead-Grid-V4',
      grid_feeder_id: 'SUBSTATION-SOUTH-02',
      voltage_drop_pct: 87.4,
      measured_voltage_kv: 3.14,
      nominal_voltage_kv: 25.0,
      temperature_celsius: 41.2,
      breaker_tripped: true,
      field_crew_assigned: 'TEAM_BRAVO_ENGINEERING',
      dispatch_notes:
        'Substation circuit breaker tripped on overcurrent surge. Isolating catenary line 1.',
    },
    postgres_sync: {
      status: 'APPLIED',
      cascade_trips_affected: 8,
      passengers_affected: 240,
      applied_at: new Date('2026-10-29T08:15:03Z'),
    },
  },
  {
    incident_code: 'DISR-2026-0892',
    incident_type: 'SIGNAL_SYSTEM_FAULT',
    severity: 'SEVERE',
    reported_at: new Date('2026-10-29T08:25:00Z'),
    source: 'ATP_SAFETY_SYSTEM_WEST',
    affected_scope: {
      primary_line_code: 'BLUE_LINE',
      track_segment_ids: [201],
      stations_affected: ['STN_WEST', 'STN_RIVER'],
    },
    temporal_window: {
      estimated_start: new Date('2026-10-29T08:25:00Z'),
      estimated_cleared: new Date('2026-10-29T09:45:00Z'),
    },
    raw_telemetry: {
      signal_box_id: 'SIG-WEST-JUNCTION-09',
      interlocking_status: 'FAILSAFE_RED',
      switch_point_locked: true,
      error_code: 'ERR_RELAY_HEARTBEAT_TIMEOUT_600MS',
      redundant_channel_active: false,
      trains_queued_in_block: 2,
      technician_eta_min: 12,
    },
    postgres_sync: {
      status: 'PENDING',
      cascade_trips_affected: 0,
      passengers_affected: 0,
      applied_at: null,
    },
  },
  {
    incident_code: 'DISR-2026-0893',
    incident_type: 'SEVERE_WEATHER_ALERT',
    severity: 'MODERATE',
    reported_at: new Date('2026-10-29T08:30:00Z'),
    source: 'MET_OFFICE_RADAR_FEED',
    affected_scope: {
      primary_line_code: 'GREEN_LINE',
      track_segment_ids: [304, 305],
      stations_affected: ['STN_MEADOW', 'STN_OLD'],
    },
    temporal_window: {
      estimated_start: new Date('2026-10-29T08:30:00Z'),
      estimated_cleared: new Date('2026-10-29T12:00:00Z'),
    },
    raw_telemetry: {
      weather_alert_id: 'NOAA-GALE-2026-X11',
      wind_speed_gust_kmh: 88.5,
      sustained_wind_kmh: 58.0,
      precipitation_rate_mm_hr: 24.6,
      visibility_meters: 650,
      speed_restriction_imposed_kmh: 40,
      flood_sensor_reading_mm: 12.0,
    },
    postgres_sync: {
      status: 'PENDING',
      cascade_trips_affected: 0,
      passengers_affected: 0,
      applied_at: null,
    },
  },
  {
    incident_code: 'DISR-2026-0894',
    incident_type: 'TRACK_OBSTRUCTION',
    severity: 'CRITICAL',
    reported_at: new Date('2026-10-29T08:35:00Z'),
    source: 'LIDAR_PERIMETER_DETECTION_P4',
    affected_scope: {
      primary_line_code: 'AIRPORT_EXPRESS',
      track_segment_ids: [401],
      stations_affected: ['STN_GATE', 'STN_AIRPORT'],
    },
    temporal_window: {
      estimated_start: new Date('2026-10-29T08:35:00Z'),
      estimated_cleared: new Date('2026-10-29T10:15:00Z'),
    },
    raw_telemetry: {
      sensor_id: 'LIDAR-WAYPOINT-KM18.4',
      object_cross_section_sqm: 1.85,
      object_estimated_mass_kg: 75,
      cad_police_incident_id: 'METRO-PD-2026-9921',
      officer_in_charge: 'Sgt. D. Henderson',
      track_clearance_protocol: 'EMERGENCY_DEBRIS_REMOVAL',
    },
    postgres_sync: {
      status: 'PENDING',
      cascade_trips_affected: 0,
      passengers_affected: 0,
      applied_at: null,
    },
  },
];

async function initializePostgres(force: boolean): Promise<void> {
  console.log('\n[PostgreSQL] Connecting and inspecting database state...');
  const client = await getClient();

  try {
    const tableCheck = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'stations'
      ) AS exists`,
    );

    const alreadyInitialized = Boolean(tableCheck.rows[0]?.exists);

    if (alreadyInitialized && !force) {
      console.log('✓ PostgreSQL tables already exist. Updating views, functions, and roles idempotently...');
      const updateFiles = ['02_views.sql', '03_recursive_cte.sql', '04_roles_rls.sql'];
      for (const fileName of updateFiles) {
        const filePath = path.join(process.cwd(), 'database', 'postgres', fileName);
        if (fs.existsSync(filePath)) {
          const sql = fs.readFileSync(filePath, 'utf-8');
          try {
            await client.query(sql);
            console.log(`  ✓ Updated ${fileName}`);
          } catch (err) {
            console.warn(`  ⚠ Warning executing ${fileName}: ${(err as Error).message}`);
          }
        }
      }
    } else {
      console.log(force ? '⚡ Force flag enabled: Re-creating PostgreSQL schema from scratch...' : '⚡ Clean database detected: Initializing full PostgreSQL schema and seed data...');

      for (const fileName of POSTGRES_FILES) {
        const filePath = path.join(process.cwd(), 'database', 'postgres', fileName);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Missing required SQL file: ${filePath}`);
        }
        console.log(`  → Executing ${fileName}...`);
        const sql = fs.readFileSync(filePath, 'utf-8');
        try {
          await client.query(sql);
          console.log(`  ✓ Completed ${fileName}`);
        } catch (err) {
          // If 04_roles_rls fails due to permission limitations on some hosted DBs, log warning
          if (fileName === '04_roles_rls.sql') {
            console.warn(`  ⚠ Non-fatal warning on roles/RLS: ${(err as Error).message}`);
          } else {
            throw err;
          }
        }
      }

      // Refresh materialized view
      try {
        await client.query('SELECT fn_refresh_station_hub_congestion()');
        console.log('  ✓ Refreshed materialized view v_station_hub_congestion');
      } catch (err) {
        console.warn(`  ⚠ Materialized view refresh notice: ${(err as Error).message}`);
      }
    }

    // Report stats sequentially on single client
    const stationCount = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM stations',
    );
    const tripCount = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM trips',
    );
    const resCount = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM reservations',
    );

    console.log(`✓ PostgreSQL status: ${stationCount.rows[0].count} stations, ${tripCount.rows[0].count} trips, ${resCount.rows[0].count} reservations verified.`);
  } finally {
    client.release();
  }
}

async function initializeMongo(force: boolean): Promise<void> {
  console.log('\n[MongoDB] Connecting to cluster/instance...');
  const client = await getMongoClient();
  const dbName = getMongoDatabaseName();
  const db = client.db(dbName);

  console.log(`✓ Connected to MongoDB database: "${dbName}"`);

  // Check if collection exists
  const collections = await db.listCollections({ name: 'disruption_events' }).toArray();
  const collectionExists = collections.length > 0;

  if (!collectionExists) {
    console.log('  → Creating disruption_events collection with schema validation...');
    await db.createCollection('disruption_events', {
      validator: MONGO_VALIDATOR,
    });
    console.log('  ✓ Created disruption_events collection');
  } else {
    try {
      await db.command({
        collMod: 'disruption_events',
        validator: MONGO_VALIDATOR,
      });
      console.log('  ✓ Validated/updated disruption_events schema validator');
    } catch {
      // In some hosted environments or shared Atlas tiers collMod might have restricted privileges
      console.log('  ✓ disruption_events collection exists');
    }
  }

  const collection = db.collection('disruption_events');

  // Create indexes idempotently
  console.log('  → Ensuring performance & query indexes...');
  await Promise.all([
    collection.createIndex({ incident_code: 1 }, { unique: true, name: 'idx_unique_incident_code' }),
    collection.createIndex({ severity: 1, reported_at: -1 }, { name: 'idx_severity_reported_at' }),
    collection.createIndex({ 'affected_scope.primary_line_code': 1 }, { name: 'idx_affected_line' }),
    collection.createIndex({ 'postgres_sync.status': 1 }, { name: 'idx_postgres_sync_status' }),
  ]);
  console.log('  ✓ Indexes verified');

  // Seed documents
  console.log('  → Seeding initial disruption events...');
  let seededCount = 0;
  for (const doc of SEED_DISRUPTIONS) {
    if (force) {
      await collection.replaceOne({ incident_code: doc.incident_code }, doc, { upsert: true });
      seededCount++;
    } else {
      const existing = await collection.findOne({ incident_code: doc.incident_code });
      if (!existing) {
        await collection.insertOne(doc);
        seededCount++;
      }
    }
  }

  const totalCount = await collection.countDocuments();
  console.log(`✓ MongoDB status: ${totalCount} disruption events in database (${seededCount} newly seeded/updated).`);
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force') || process.env.FORCE_DB_INIT === 'true';

  console.log('================================================================');
  console.log('   Transit Disruption Engine — Database Migration & Setup');
  console.log(`   Mode: ${force ? 'FORCE REINITIALIZE' : 'IDEMPOTENT / SAFE'}`);
  console.log('================================================================');

  try {
    try {
      await initializePostgres(force);
    } catch (error) {
      console.error('\n❌ PostgreSQL initialization failed:', error);
      process.exitCode = 1;
      return;
    }

    try {
      await initializeMongo(force);
    } catch (error) {
      console.warn('\n⚠️ MongoDB initialization notice:');
      console.warn((error as Error).message);
      console.warn(
        'PostgreSQL initialized successfully. If MONGODB_URI is still pending or not yet whitelisted in Atlas, run "npm run db:init" once MongoDB is connected.\n',
      );
    }

    console.log('\n================================================================');
    console.log('🎉 Database initialization step completed!');
    console.log('================================================================\n');
  } finally {
    await Promise.allSettled([closePostgres(), closeMongo()]);
  }
}

main();
