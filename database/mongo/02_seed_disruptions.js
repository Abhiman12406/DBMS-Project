// ============================================================================
// Public Transport Disruption Dependency Engine
// File: 02_seed_disruptions.js
// Description: Seed Polymorphic Disruption Documents for Real-World Scenarios
// Database: MongoDB 7 (transit_db)
// ============================================================================

db = db.getSiblingDB('transit_db');

print('[MongoDB Seed] Seeding polymorphic disruption incident documents...');

// Remove existing matching incident codes for idempotent seeding
db.disruption_events.deleteMany({
  incident_code: {
    $in: ['DISR-2026-0891', 'DISR-2026-0892', 'DISR-2026-0893', 'DISR-2026-0894']
  }
});

db.disruption_events.insertMany([
  // Incident 1: Catenary Power Failure on RED_LINE at Central Hub (SCADA telemetry)
  {
    incident_code: 'DISR-2026-0891',
    incident_type: 'CATENARY_POWER_FAILURE',
    severity: 'CRITICAL',
    reported_at: new Date('2026-10-29T08:15:00Z'),
    source: 'SCADA_SENSOR_GRID_NODE_4',
    affected_scope: {
      primary_line_code: 'RED_LINE',
      track_segment_ids: [104, 105],
      stations_affected: ['STN_CENTRAL', 'STN_NORTH']
    },
    temporal_window: {
      estimated_start: new Date('2026-10-29T08:15:00Z'),
      estimated_cleared: new Date('2026-10-29T11:30:00Z')
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
      dispatch_notes: 'Substation circuit breaker tripped on overcurrent surge. Isolating catenary line 1.'
    },
    postgres_sync: {
      status: 'APPLIED',
      cascade_trips_affected: 8,
      passengers_affected: 240,
      applied_at: new Date('2026-10-29T08:15:03Z')
    }
  },

  // Incident 2: Signal Interlocking Glitch on BLUE_LINE at West End (Microprocessor error)
  {
    incident_code: 'DISR-2026-0892',
    incident_type: 'SIGNAL_SYSTEM_FAULT',
    severity: 'SEVERE',
    reported_at: new Date('2026-10-29T08:25:00Z'),
    source: 'ATP_SAFETY_SYSTEM_WEST',
    affected_scope: {
      primary_line_code: 'BLUE_LINE',
      track_segment_ids: [201],
      stations_affected: ['STN_WEST', 'STN_RIVER']
    },
    temporal_window: {
      estimated_start: new Date('2026-10-29T08:25:00Z'),
      estimated_cleared: new Date('2026-10-29T09:45:00Z')
    },
    raw_telemetry: {
      signal_box_id: 'SIG-WEST-JUNCTION-09',
      interlocking_status: 'FAILSAFE_RED',
      switch_point_locked: true,
      error_code: 'ERR_RELAY_HEARTBEAT_TIMEOUT_600MS',
      redundant_channel_active: false,
      trains_queued_in_block: 2,
      technician_eta_min: 12
    },
    postgres_sync: {
      status: 'PENDING',
      cascade_trips_affected: 0,
      passengers_affected: 0,
      applied_at: null
    }
  },

  // Incident 3: Severe Weather Gale on GREEN_LINE (Meteorological sensor)
  {
    incident_code: 'DISR-2026-0893',
    incident_type: 'SEVERE_WEATHER_ALERT',
    severity: 'MODERATE',
    reported_at: new Date('2026-10-29T08:30:00Z'),
    source: 'MET_OFFICE_RADAR_FEED',
    affected_scope: {
      primary_line_code: 'GREEN_LINE',
      track_segment_ids: [304, 305],
      stations_affected: ['STN_MEADOW', 'STN_OLD']
    },
    temporal_window: {
      estimated_start: new Date('2026-10-29T08:30:00Z'),
      estimated_cleared: new Date('2026-10-29T12:00:00Z')
    },
    raw_telemetry: {
      weather_alert_id: 'NOAA-GALE-2026-X11',
      wind_speed_gust_kmh: 88.5,
      sustained_wind_kmh: 58.0,
      precipitation_rate_mm_hr: 24.6,
      visibility_meters: 650,
      speed_restriction_imposed_kmh: 40,
      flood_sensor_reading_mm: 12.0
    },
    postgres_sync: {
      status: 'PENDING',
      cascade_trips_affected: 0,
      passengers_affected: 0,
      applied_at: null
    }
  },

  // Incident 4: Foreign Object Track Obstruction on AIRPORT_EXPRESS (Laser LIDAR / Police Order)
  {
    incident_code: 'DISR-2026-0894',
    incident_type: 'TRACK_OBSTRUCTION',
    severity: 'CRITICAL',
    reported_at: new Date('2026-10-29T08:35:00Z'),
    source: 'LIDAR_PERIMETER_DETECTION_P4',
    affected_scope: {
      primary_line_code: 'AIRPORT_EXPRESS',
      track_segment_ids: [401],
      stations_affected: ['STN_GATE', 'STN_AIRPORT']
    },
    temporal_window: {
      estimated_start: new Date('2026-10-29T08:35:00Z'),
      estimated_cleared: new Date('2026-10-29T10:15:00Z')
    },
    raw_telemetry: {
      sensor_id: 'LIDAR-WAYPOINT-KM18.4',
      object_cross_section_sqm: 1.85,
      object_estimated_mass_kg: 75,
      cad_police_incident_id: 'METRO-PD-2026-9921',
      officer_in_charge: 'Sgt. D. Henderson',
      track_clearance_protocol: 'EMERGENCY_DEBRIS_REMOVAL'
    },
    postgres_sync: {
      status: 'PENDING',
      cascade_trips_affected: 0,
      passengers_affected: 0,
      applied_at: null
    }
  }
]);

print('[MongoDB Seed] Disruption incidents seeded successfully.');
