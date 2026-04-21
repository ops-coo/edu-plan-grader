import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  businessUnits,
  budgetDocuments,
  evaluationReports,
  rubricCriteria,
  dataSourceConfigs,
  ingestionEvents,
  normalizedDataRecords,
  dataRecordBuLinks,
  changeTracking,
  type BusinessUnit,
  type InsertBusinessUnit,
  type BudgetDocument,
  type InsertBudgetDocument,
  type EvaluationReport,
  type InsertEvaluationReport,
  type RubricCriteria,
  type InsertRubricCriteria,
  type DataSourceConfig,
  type InsertDataSourceConfig,
  type IngestionEvent,
  type InsertIngestionEvent,
  type NormalizedDataRecord,
  type InsertNormalizedDataRecord,
  type DataRecordBuLink,
  type InsertDataRecordBuLink,
  type ChangeTracking,
  type InsertChangeTracking,
} from "@shared/schema";

const sqlite = new Database("data.db");
const db = drizzle(sqlite);

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS business_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gm TEXT,
    sector TEXT DEFAULT 'Education',
    status TEXT NOT NULL DEFAULT 'pending_review',
    overall_score REAL,
    budget_doc_url TEXT,
    budget_pnl_url TEXT,
    brainlift_rating TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS budget_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_unit_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    url TEXT NOT NULL,
    quarter TEXT,
    title TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS evaluation_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_unit_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    overall_score REAL NOT NULL,
    confidence_score INTEGER NOT NULL,
    executive_summary TEXT NOT NULL,
    key_findings TEXT NOT NULL,
    critical_issues TEXT NOT NULL,
    rubric_scores TEXT NOT NULL,
    financial_summary TEXT,
    report_url TEXT
  );
  CREATE TABLE IF NOT EXISTS rubric_criteria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evaluation_id INTEGER NOT NULL,
    criterion_key TEXT NOT NULL,
    criterion_label TEXT NOT NULL,
    score REAL NOT NULL,
    weight REAL NOT NULL,
    justification TEXT NOT NULL,
    evidence TEXT
  );

  CREATE TABLE IF NOT EXISTS data_source_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    auth_method TEXT NOT NULL DEFAULT 'service_account',
    credentials_enc TEXT,
    poll_interval_min INTEGER DEFAULT 15,
    enabled INTEGER DEFAULT 1,
    config TEXT,
    last_polled_at TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS ingestion_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_config_id INTEGER NOT NULL,
    external_id TEXT NOT NULL,
    external_url TEXT,
    content_hash TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    raw_content_size INTEGER,
    fetched_at TEXT NOT NULL,
    processing_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS normalized_data_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingestion_event_id INTEGER NOT NULL,
    source_config_id INTEGER NOT NULL,
    external_id TEXT NOT NULL,
    external_url TEXT,
    canonical_title TEXT NOT NULL,
    content_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    raw_content TEXT NOT NULL,
    normalized_content TEXT,
    structured_metadata TEXT NOT NULL,
    data_quality_score INTEGER,
    context_confidence INTEGER,
    tags TEXT,
    quarter TEXT,
    is_latest INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    superseded_at TEXT
  );

  CREATE TABLE IF NOT EXISTS data_record_bu_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_record_id INTEGER NOT NULL,
    business_unit_id INTEGER NOT NULL,
    link_confidence INTEGER,
    link_method TEXT,
    created_at TEXT,
    UNIQUE(data_record_id, business_unit_id)
  );

  CREATE TABLE IF NOT EXISTS change_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_record_id INTEGER NOT NULL,
    previous_record_id INTEGER,
    change_type TEXT NOT NULL,
    change_summary TEXT,
    changed_fields TEXT,
    detected_at TEXT NOT NULL,
    triggered_reeval INTEGER DEFAULT 0
  );
`);

// Auto-seed from bundled JSON if the database is empty (fresh Cloud Run container)
function seedIfEmpty() {
  const count = sqlite.prepare("SELECT count(*) as c FROM business_units").get() as { c: number };
  if (count.c > 0) return; // Already has data

  // Try multiple paths (dev vs production build layout)
  const candidates = [
    resolve(__dirname, "../data/seed.json"),
    resolve(__dirname, "../../data/seed.json"),
    resolve(process.cwd(), "data/seed.json"),
  ];
  const seedPath = candidates.find(p => existsSync(p));
  if (!seedPath) {
    console.log("[seed] No seed.json found — starting with empty database");
    return;
  }

  console.log(`[seed] Empty database detected — loading seed data from ${seedPath}`);
  const seed = JSON.parse(readFileSync(seedPath, "utf-8"));

  const insertMany = (table: string, rows: Record<string, any>[]) => {
    if (!rows || rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => "?").join(", ");
    const stmt = sqlite.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`);
    const tx = sqlite.transaction((items: Record<string, any>[]) => {
      for (const row of items) {
        stmt.run(...cols.map(c => row[c] ?? null));
      }
    });
    tx(rows);
    console.log(`[seed] ${table}: ${rows.length} rows loaded`);
  };

  insertMany("business_units", seed.business_units);
  insertMany("budget_documents", seed.budget_documents);
  insertMany("evaluation_reports", seed.evaluation_reports);
  insertMany("rubric_criteria", seed.rubric_criteria);
  console.log("[seed] Database seeded successfully");
}

seedIfEmpty();

export interface DataRecordFilters {
  contentType?: string;
  sourceConfigId?: number;
  isLatest?: boolean;
  limit?: number;
}

export interface IStorage {
  // Business Units
  getBusinessUnits(): BusinessUnit[];
  getBusinessUnit(id: number): BusinessUnit | undefined;
  createBusinessUnit(bu: InsertBusinessUnit): BusinessUnit;
  updateBusinessUnit(id: number, bu: Partial<InsertBusinessUnit>): BusinessUnit | undefined;

  // Budget Documents
  getBudgetDocuments(businessUnitId: number): BudgetDocument[];
  createBudgetDocument(doc: InsertBudgetDocument): BudgetDocument;

  // Evaluation Reports
  getEvaluationReports(businessUnitId?: number): EvaluationReport[];
  getEvaluationReport(id: number): EvaluationReport | undefined;
  getLatestEvaluation(businessUnitId: number): EvaluationReport | undefined;
  createEvaluationReport(report: InsertEvaluationReport): EvaluationReport;

  // Rubric Criteria
  getRubricCriteria(evaluationId: number): RubricCriteria[];
  createRubricCriteria(criteria: InsertRubricCriteria): RubricCriteria;

  // Data Source Configs
  getDataSourceConfigs(): DataSourceConfig[];
  getEnabledDataSourceConfigs(): DataSourceConfig[];
  getDataSourceConfig(id: number): DataSourceConfig | undefined;
  createDataSourceConfig(config: InsertDataSourceConfig): DataSourceConfig;
  updateDataSourceConfig(id: number, config: Partial<InsertDataSourceConfig>): DataSourceConfig | undefined;
  deleteDataSourceConfig(id: number): boolean;

  // Ingestion Events
  getIngestionEvents(sourceConfigId?: number, limit?: number): IngestionEvent[];
  getLastIngestionEvent(sourceConfigId: number, externalId?: string): IngestionEvent | undefined;
  createIngestionEvent(event: InsertIngestionEvent): IngestionEvent;

  // Normalized Data Records
  getNormalizedDataRecords(filters: DataRecordFilters): NormalizedDataRecord[];
  getNormalizedDataRecord(id: number): NormalizedDataRecord | undefined;
  createNormalizedDataRecord(record: InsertNormalizedDataRecord): NormalizedDataRecord;
  getDataRecordsForBusinessUnit(buId: number): NormalizedDataRecord[];
  supersedeDataRecord(id: number): void;
  supersedeLatestRecord(sourceConfigId: number, externalId: string): void;

  // Data Record ↔ BU Links
  getDataRecordBuLinks(dataRecordId: number): DataRecordBuLink[];
  createDataRecordBuLink(link: InsertDataRecordBuLink): DataRecordBuLink;
  deleteDataRecordBuLink(dataRecordId: number, buId: number): boolean;

  // Change Tracking
  getRecentChanges(limit?: number): ChangeTracking[];
  createChangeTracking(change: InsertChangeTracking): ChangeTracking;

  // Transactions
  runInTransaction<T>(fn: () => T): T;
}

export class DatabaseStorage implements IStorage {
  getBusinessUnits(): BusinessUnit[] {
    return db.select().from(businessUnits).all();
  }

  getBusinessUnit(id: number): BusinessUnit | undefined {
    return db.select().from(businessUnits).where(eq(businessUnits.id, id)).get();
  }

  createBusinessUnit(bu: InsertBusinessUnit): BusinessUnit {
    return db.insert(businessUnits).values(bu).returning().get();
  }

  updateBusinessUnit(id: number, bu: Partial<InsertBusinessUnit>): BusinessUnit | undefined {
    return db.update(businessUnits).set(bu).where(eq(businessUnits.id, id)).returning().get();
  }

  getBudgetDocuments(businessUnitId: number): BudgetDocument[] {
    return db.select().from(budgetDocuments).where(eq(budgetDocuments.businessUnitId, businessUnitId)).all();
  }

  createBudgetDocument(doc: InsertBudgetDocument): BudgetDocument {
    return db.insert(budgetDocuments).values(doc).returning().get();
  }

  getEvaluationReports(businessUnitId?: number): EvaluationReport[] {
    if (businessUnitId) {
      return db.select().from(evaluationReports).where(eq(evaluationReports.businessUnitId, businessUnitId)).all();
    }
    return db.select().from(evaluationReports).all();
  }

  getEvaluationReport(id: number): EvaluationReport | undefined {
    return db.select().from(evaluationReports).where(eq(evaluationReports.id, id)).get();
  }

  getLatestEvaluation(businessUnitId: number): EvaluationReport | undefined {
    return db
      .select()
      .from(evaluationReports)
      .where(eq(evaluationReports.businessUnitId, businessUnitId))
      .orderBy(desc(evaluationReports.createdAt), desc(evaluationReports.id))
      .limit(1)
      .get();
  }

  createEvaluationReport(report: InsertEvaluationReport): EvaluationReport {
    return db.insert(evaluationReports).values(report).returning().get();
  }

  getRubricCriteria(evaluationId: number): RubricCriteria[] {
    return db.select().from(rubricCriteria).where(eq(rubricCriteria.evaluationId, evaluationId)).all();
  }

  createRubricCriteria(criteria: InsertRubricCriteria): RubricCriteria {
    return db.insert(rubricCriteria).values(criteria).returning().get();
  }

  // --- Data Source Configs ---

  getDataSourceConfigs(): DataSourceConfig[] {
    return db.select().from(dataSourceConfigs).all();
  }

  getEnabledDataSourceConfigs(): DataSourceConfig[] {
    return db.select().from(dataSourceConfigs).where(eq(dataSourceConfigs.enabled, 1)).all();
  }

  getDataSourceConfig(id: number): DataSourceConfig | undefined {
    return db.select().from(dataSourceConfigs).where(eq(dataSourceConfigs.id, id)).get();
  }

  createDataSourceConfig(config: InsertDataSourceConfig): DataSourceConfig {
    return db.insert(dataSourceConfigs).values(config).returning().get();
  }

  updateDataSourceConfig(id: number, config: Partial<InsertDataSourceConfig>): DataSourceConfig | undefined {
    return db.update(dataSourceConfigs).set(config).where(eq(dataSourceConfigs.id, id)).returning().get();
  }

  deleteDataSourceConfig(id: number): boolean {
    const result = db.delete(dataSourceConfigs).where(eq(dataSourceConfigs.id, id)).returning().get();
    return !!result;
  }

  // --- Ingestion Events ---

  getIngestionEvents(sourceConfigId?: number, limit: number = 100): IngestionEvent[] {
    if (sourceConfigId) {
      return db.select().from(ingestionEvents)
        .where(eq(ingestionEvents.sourceConfigId, sourceConfigId))
        .orderBy(desc(ingestionEvents.fetchedAt))
        .limit(limit)
        .all();
    }
    return db.select().from(ingestionEvents)
      .orderBy(desc(ingestionEvents.fetchedAt))
      .limit(limit)
      .all();
  }

  getLastIngestionEvent(sourceConfigId: number, externalId?: string): IngestionEvent | undefined {
    const condition = externalId
      ? and(eq(ingestionEvents.sourceConfigId, sourceConfigId), eq(ingestionEvents.externalId, externalId))
      : eq(ingestionEvents.sourceConfigId, sourceConfigId);

    return db.select().from(ingestionEvents)
      .where(condition)
      .orderBy(desc(ingestionEvents.fetchedAt))
      .limit(1)
      .get();
  }

  createIngestionEvent(event: InsertIngestionEvent): IngestionEvent {
    return db.insert(ingestionEvents).values(event).returning().get();
  }

  // --- Normalized Data Records ---

  getNormalizedDataRecords(filters: DataRecordFilters): NormalizedDataRecord[] {
    let query = db.select().from(normalizedDataRecords).$dynamic();
    const conditions = [];
    if (filters.isLatest !== undefined) {
      conditions.push(eq(normalizedDataRecords.isLatest, filters.isLatest ? 1 : 0));
    }
    if (filters.contentType) {
      conditions.push(eq(normalizedDataRecords.contentType, filters.contentType));
    }
    if (filters.sourceConfigId) {
      conditions.push(eq(normalizedDataRecords.sourceConfigId, filters.sourceConfigId));
    }
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    return query
      .orderBy(desc(normalizedDataRecords.createdAt))
      .limit(filters.limit || 100)
      .all();
  }

  getNormalizedDataRecord(id: number): NormalizedDataRecord | undefined {
    return db.select().from(normalizedDataRecords).where(eq(normalizedDataRecords.id, id)).get();
  }

  createNormalizedDataRecord(record: InsertNormalizedDataRecord): NormalizedDataRecord {
    return db.insert(normalizedDataRecords).values(record).returning().get();
  }

  getDataRecordsForBusinessUnit(buId: number): NormalizedDataRecord[] {
    return db.select({ record: normalizedDataRecords })
      .from(normalizedDataRecords)
      .innerJoin(dataRecordBuLinks, eq(normalizedDataRecords.id, dataRecordBuLinks.dataRecordId))
      .where(and(eq(dataRecordBuLinks.businessUnitId, buId), eq(normalizedDataRecords.isLatest, 1)))
      .all()
      .map(r => r.record);
  }

  supersedeDataRecord(id: number): void {
    db.update(normalizedDataRecords)
      .set({ isLatest: 0, supersededAt: new Date().toISOString() })
      .where(eq(normalizedDataRecords.id, id))
      .run();
  }

  supersedeLatestRecord(sourceConfigId: number, externalId: string): void {
    db.update(normalizedDataRecords)
      .set({ isLatest: 0, supersededAt: new Date().toISOString() })
      .where(and(
        eq(normalizedDataRecords.sourceConfigId, sourceConfigId),
        eq(normalizedDataRecords.externalId, externalId),
        eq(normalizedDataRecords.isLatest, 1),
      ))
      .run();
  }

  // --- Data Record ↔ BU Links ---

  getDataRecordBuLinks(dataRecordId: number): DataRecordBuLink[] {
    return db.select().from(dataRecordBuLinks)
      .where(eq(dataRecordBuLinks.dataRecordId, dataRecordId))
      .all();
  }

  createDataRecordBuLink(link: InsertDataRecordBuLink): DataRecordBuLink {
    return db.insert(dataRecordBuLinks).values(link).returning().get();
  }

  deleteDataRecordBuLink(dataRecordId: number, buId: number): boolean {
    const result = db.delete(dataRecordBuLinks)
      .where(and(
        eq(dataRecordBuLinks.dataRecordId, dataRecordId),
        eq(dataRecordBuLinks.businessUnitId, buId),
      ))
      .returning()
      .get();
    return !!result;
  }

  // --- Change Tracking ---

  getRecentChanges(limit: number = 50): ChangeTracking[] {
    return db.select().from(changeTracking)
      .orderBy(desc(changeTracking.detectedAt))
      .limit(limit)
      .all();
  }

  createChangeTracking(change: InsertChangeTracking): ChangeTracking {
    return db.insert(changeTracking).values(change).returning().get();
  }

  runInTransaction<T>(fn: () => T): T {
    return sqlite.transaction(fn)();
  }
}

export const storage = new DatabaseStorage();
