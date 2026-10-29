export type PersonaRole = 'admin' | 'dispatcher' | 'passenger';

export interface PersonaContext {
  role: PersonaRole;
  passengerId?: number;
}

export interface PostgresHealth {
  connected: boolean;
  database?: string;
  user?: string;
  serverVersion?: string;
  latencyMs: number;
  error?: string;
}

export interface MongoHealth {
  connected: boolean;
  database?: string;
  collections?: number;
  disruptionEventCount?: number;
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  postgres: PostgresHealth;
  mongodb: MongoHealth;
  checkedAt: string;
}

export type IncidentType =
  | 'CATENARY_POWER_FAILURE'
  | 'SIGNAL_SYSTEM_FAULT'
  | 'TRACK_OBSTRUCTION'
  | 'ROLLING_STOCK_DEFECT'
  | 'SEVERE_WEATHER_ALERT'
  | 'POLICE_INVESTIGATION';

export type IncidentSeverity = 'MINOR' | 'MODERATE' | 'SEVERE' | 'CRITICAL';

export interface DisruptionScope {
  primary_line_code: string;
  track_segment_ids?: number[];
  stations_affected: string[];
}

export interface TemporalWindow {
  estimated_start?: string | Date | null;
  estimated_cleared?: string | Date | null;
}

export type PostgresSyncStatus = 'PENDING' | 'APPLIED' | 'FAILED';

export interface PostgresSync {
  status: PostgresSyncStatus;
  cascade_trips_affected: number;
  passengers_affected: number;
  applied_at?: string | Date | null;
  error?: string;
}

export interface DisruptionEventInput {
  incident_code?: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  reported_at?: string | Date;
  source: string;
  affected_scope: DisruptionScope;
  temporal_window?: TemporalWindow;
  raw_telemetry?: Record<string, unknown>;
}

export interface DisruptionEventDocument extends DisruptionEventInput {
  _id?: string;
  postgres_sync?: PostgresSync;
}

export interface CascadeStopRow {
  trip_id: number;
  route_id: number;
  line_name: string;
  line_code: string;
  color_hex: string;
  train_number: string;
  station_id: number;
  station_name: string;
  station_code: string;
  stop_sequence: number;
  scheduled_arrival: string | Date;
  scheduled_departure: string | Date;
  estimated_arrival: string | Date;
  estimated_departure: string | Date;
  propagated_delay_min: number;
  cascade_depth: number;
  impact_type: string;
  trip_path: number[];
  affected_passengers_count: string | number;
}

export interface DownstreamTripSummary {
  trip_id: number;
  line_name: string;
  color_hex: string;
  train_number: string;
  direction: string;
  origin_station: string;
  destination_station: string;
  max_delay_min: number;
  min_cascade_depth: number;
  impact_type: string;
  affected_stops_count: string | number;
  affected_passengers_count: string | number;
}

export interface AppliedTripDelay {
  trip_id: number;
  updated_stops_count: number;
  new_trip_status: string;
  affected_passengers: number;
  refreshed_at: string | Date;
}

export interface CascadeResult {
  incident: DisruptionEventDocument;
  applied: AppliedTripDelay;
  affectedTripCount: number;
  affectedPassengerCount: number;
  downstreamTrips: DownstreamTripSummary[];
  cascadeStops: CascadeStopRow[];
  executionTimeMs: number;
}

export interface PropagateDisruptionInput extends DisruptionEventInput {
  tripId: number;
  stationId: number;
  delayMin: number;
  reason?: string;
}

export interface StressTestOptions {
  originalTripId?: number;
  targetTripId?: number;
  workerCount?: number;
}

export type RebookWorkerStatus = 'REBOOKED' | 'WAITLISTED' | 'FAILED';

export interface RebookWorkerResult {
  workerId: number;
  reservationId: number;
  passengerId: number | null;
  success: boolean;
  status: RebookWorkerStatus;
  allocatedSeatId: number | null;
  newReservationId: number | null;
  seatNumber: string | null;
  carriageNumber: number | null;
  message: string;
  transactionMs: number;
  lockWaitMs: number;
}

export interface OverbookingViolation {
  trip_id: number;
  seat_id: number;
  duplicate_count: string | number;
}

export interface StressTestTelemetry {
  originalTripId: number;
  targetTripId: number;
  requestedWorkers: number;
  eligiblePassengers: number;
  targetSeatsAvailableBefore: number;
  totalWorkers: number;
  rebooked: number;
  waitlisted: number;
  failed: number;
  allocatedSeats: number[];
  duplicateBookings: number;
  violations: OverbookingViolation[];
  averageTransactionMs: number;
  maxTransactionMs: number;
  averageLockWaitMs: number;
  totalDurationMs: number;
  workers: RebookWorkerResult[];
}

export interface TransitLine {
  line_id: number;
  name: string;
  code: string;
  color_hex: string;
  transit_type: string;
}

export interface TransitStation {
  station_id: number;
  code: string;
  name: string;
  zone: number;
  platform_count: number;
  transfer_hub_flag: boolean;
}

export interface TransitRoute {
  route_id: number;
  line_id: number;
  direction: string;
  origin_station_id: number;
  destination_station_id: number;
}

export interface TransitConnection {
  connection_id: number;
  from_station_id: number;
  to_station_id: number;
  distance_km: string;
  nominal_duration_min: number;
}

export interface LiveTripMonitorRow {
  trip_id: number;
  service_date: string | Date;
  trip_status: string;
  line_id: number;
  line_code: string;
  line_name: string;
  color_hex: string;
  transit_type: string;
  route_id: number;
  direction: string;
  origin_station_id: number;
  origin_station_name: string;
  origin_station_code: string;
  destination_station_id: number;
  destination_station_name: string;
  destination_station_code: string;
  train_id: number;
  train_number: string;
  train_model: string;
  total_capacity: number;
  total_stops: string | number;
  scheduled_start: string | Date | null;
  scheduled_end: string | Date | null;
  max_delay_arrival_min: number;
  max_delay_departure_min: number;
  max_delay_min: number;
  booked_seats: string | number;
  available_seats: string | number;
}

export interface PassengerProfile {
  passenger_id: number;
  full_name: string;
  email: string;
}

export interface PassengerJourneyRow {
  reservation_id: number;
  trip_id: number;
  booking_status: string;
  origin_station_id: number;
  origin_station_name: string;
  destination_station_id: number;
  destination_station_name: string;
  line_code: string | null;
  line_name: string | null;
  color_hex: string | null;
  train_number: string | null;
  trip_status: string | null;
  max_delay_min: number | null;
  scheduled_start: string | Date | null;
  scheduled_end: string | Date | null;
}

export interface StationScheduleRow {
  stop_id: number;
  station_id: number;
  station_code: string;
  station_name: string;
  trip_id: number;
  trip_status: string;
  line_code: string;
  line_name: string;
  color_hex: string;
  train_number: string;
  direction: string;
  destination_name: string;
  stop_sequence: number;
  scheduled_arrival: string | Date;
  scheduled_departure: string | Date;
  actual_arrival: string | Date | null;
  actual_departure: string | Date | null;
  delay_arrival_min: number;
  delay_departure_min: number;
  estimated_departure: string | Date;
}
