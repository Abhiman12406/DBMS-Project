// ============================================================================
// Public Transport Disruption Dependency Engine
// File: 01_init_mongo.js
// Description: MongoDB Collection Setup, Polymorphic Schema Validators & Indexes
// Database: MongoDB 7 (transit_db)
// ============================================================================

db = db.getSiblingDB('transit_db');

print('[MongoDB Init] Initializing collection and validation schemas on transit_db...');

// Drop existing collection to ensure clean idempotent setup
db.disruption_events.drop();

// Create collection with strict JSON Schema validation for core envelope
// while permitting polymorphic variations in raw_telemetry and context
db.createCollection('disruption_events', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['incident_code', 'incident_type', 'severity', 'reported_at', 'source', 'affected_scope'],
      properties: {
        incident_code: {
          bsonType: 'string',
          pattern: '^DISR-[0-9]{4}-[0-9]{4}$',
          description: 'Unique incident identifier matching pattern DISR-YYYY-XXXX'
        },
        incident_type: {
          bsonType: 'string',
          enum: [
            'CATENARY_POWER_FAILURE',
            'SIGNAL_SYSTEM_FAULT',
            'TRACK_OBSTRUCTION',
            'ROLLING_STOCK_DEFECT',
            'SEVERE_WEATHER_ALERT',
            'POLICE_INVESTIGATION'
          ],
          description: 'Standardized disruption classification'
        },
        severity: {
          bsonType: 'string',
          enum: ['MINOR', 'MODERATE', 'SEVERE', 'CRITICAL'],
          description: 'Operational severity level'
        },
        reported_at: {
          bsonType: ['date', 'string'],
          description: 'Timestamp when incident was registered'
        },
        source: {
          bsonType: 'string',
          description: 'Reporting entity, SCADA sensor, or external agency'
        },
        affected_scope: {
          bsonType: 'object',
          required: ['primary_line_code', 'stations_affected'],
          properties: {
            primary_line_code: {
              bsonType: 'string',
              description: 'Primary transit line identifier'
            },
            track_segment_ids: {
              bsonType: 'array',
              items: { bsonType: ['int', 'long', 'double'] },
              description: 'Physical track segment IDs affected'
            },
            stations_affected: {
              bsonType: 'array',
              items: { bsonType: 'string' },
              description: 'List of station codes impacted'
            }
          }
        },
        temporal_window: {
          bsonType: 'object',
          properties: {
            estimated_start: { bsonType: ['date', 'string', 'null'] },
            estimated_cleared: { bsonType: ['date', 'string', 'null'] }
          }
        },
        raw_telemetry: {
          bsonType: 'object',
          description: 'Polymorphic payload: SCADA sensors, weather readings, or police dispatch notes'
        },
        postgres_sync: {
          bsonType: 'object',
          properties: {
            status: {
              bsonType: 'string',
              enum: ['PENDING', 'APPLIED', 'FAILED']
            },
            cascade_trips_affected: { bsonType: ['int', 'long', 'double'] },
            passengers_affected: { bsonType: ['int', 'long', 'double'] },
            applied_at: { bsonType: ['date', 'string', 'null'] }
          }
        }
      }
    }
  }
});

// Create required performance & query indexes
print('[MongoDB Init] Creating indexes...');

// 1. Unique index on incident_code
db.disruption_events.createIndex(
  { incident_code: 1 },
  { unique: true, name: 'idx_unique_incident_code' }
);

// 2. Compound index on severity and reported_at (for fast incident triage)
db.disruption_events.createIndex(
  { severity: 1, reported_at: -1 },
  { name: 'idx_severity_reported_at' }
);

// 3. Index on primary line code
db.disruption_events.createIndex(
  { 'affected_scope.primary_line_code': 1 },
  { name: 'idx_affected_line' }
);

// 4. Index on PostgreSQL synchronization state
db.disruption_events.createIndex(
  { 'postgres_sync.status': 1 },
  { name: 'idx_postgres_sync_status' }
);

print('[MongoDB Init] Collection and indexes initialized successfully.');
