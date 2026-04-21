import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Education Business Units
export const businessUnits = sqliteTable("business_units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  gm: text("gm"), // General Manager name
  sector: text("sector").default("Education"),
  status: text("status").notNull().default("pending_review"), // "pending_review" | "in_progress" | "evaluated" | "on_hold" | "approved" | "rejected" | "fix_required"
  overallScore: real("overall_score"), // 0-100 scale from brainlift rating
  budgetDocUrl: text("budget_doc_url"), // Google Doc link to business plan
  budgetPnlUrl: text("budget_pnl_url"), // Google Sheets link to P&L
  brainliftRating: text("brainlift_rating"), // "Exemplary" | "Promising" | "Developing" | "Critically Flawed"
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

// Budget Documents linked to Business Units
export const budgetDocuments = sqliteTable("budget_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessUnitId: integer("business_unit_id").notNull(),
  documentType: text("document_type").notNull(), // "business_plan" | "pnl_spreadsheet" | "cf_orders" | "import_orders" | "brainlift" | "brainlift_insights" | "ephor_project"
  url: text("url").notNull(),
  quarter: text("quarter"), // "Q1-26", "Q2-26"
  title: text("title"),
  createdAt: text("created_at"),
});

// Evaluation Reports (AI QC Reports)
export const evaluationReports = sqliteTable("evaluation_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessUnitId: integer("business_unit_id").notNull(),
  createdAt: text("created_at").notNull(),
  recommendation: text("recommendation").notNull(), // "APPROVE" | "REJECT" | "APPROVE_WITH_FIX"
  overallScore: real("overall_score").notNull(), // 0-10
  confidenceScore: integer("confidence_score").notNull(), // 0-100
  executiveSummary: text("executive_summary").notNull(),
  keyFindings: text("key_findings").notNull(), // JSON array
  criticalIssues: text("critical_issues").notNull(), // JSON array
  rubricScores: text("rubric_scores").notNull(), // JSON object — Joe's criteria scores
  financialSummary: text("financial_summary"),
  reportUrl: text("report_url"),
});

// Joe's Rubric Criteria — individual scores per evaluation
export const rubricCriteria = sqliteTable("rubric_criteria", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  evaluationId: integer("evaluation_id").notNull(),
  criterionKey: text("criterion_key").notNull(),
  criterionLabel: text("criterion_label").notNull(),
  score: real("score").notNull(), // 0-10
  weight: real("weight").notNull(), // 0-1
  justification: text("justification").notNull(),
  evidence: text("evidence"), // what data supported the score
});

// === Pipeline Data Lake Tables ===

// Data Source Configs — registered connectors
export const dataSourceConfigs = sqliteTable("data_source_configs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // "bigquery" | "google_docs" | "google_sheets"
  name: text("name").notNull(),
  authMethod: text("auth_method").notNull().default("service_account"), // "service_account" | "api_token" | "oauth2" | "none"
  credentialsEnc: text("credentials_enc"), // encrypted JSON credentials (or null for env-based auth)
  pollIntervalMin: integer("poll_interval_min").default(15),
  enabled: integer("enabled").default(1), // boolean
  config: text("config"), // JSON: connector-specific config (dataset, folder IDs, repo, file paths, etc.)
  lastPolledAt: text("last_polled_at"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

// Ingestion Events — log of every fetch attempt
export const ingestionEvents = sqliteTable("ingestion_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceConfigId: integer("source_config_id").notNull(),
  externalId: text("external_id").notNull(),
  externalUrl: text("external_url"),
  contentHash: text("content_hash"),
  status: text("status").notNull(), // "success" | "failed" | "skipped" | "unchanged"
  errorMessage: text("error_message"),
  rawContentSize: integer("raw_content_size"),
  fetchedAt: text("fetched_at").notNull(),
  processingMs: integer("processing_ms"),
});

// Normalized Data Records — the data lake (AI-contextualized)
export const normalizedDataRecords = sqliteTable("normalized_data_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ingestionEventId: integer("ingestion_event_id").notNull(),
  sourceConfigId: integer("source_config_id").notNull(),
  externalId: text("external_id").notNull(),
  externalUrl: text("external_url"),
  canonicalTitle: text("canonical_title").notNull(),
  contentType: text("content_type").notNull(), // "business_plan" | "financial_data" | "brainlift" | "project_status" | "milestone" | "meeting_notes" | "pnl" | "other"
  summary: text("summary").notNull(),
  rawContent: text("raw_content").notNull(),
  normalizedContent: text("normalized_content"),
  structuredMetadata: text("structured_metadata").notNull(), // JSON: AI-extracted metadata
  dataQualityScore: integer("data_quality_score"), // 0-100
  contextConfidence: integer("context_confidence"), // 0-100
  tags: text("tags"), // JSON array of tags
  quarter: text("quarter"),
  isLatest: integer("is_latest").default(1), // boolean
  createdAt: text("created_at").notNull(),
  supersededAt: text("superseded_at"),
});

// Data Record ↔ Business Unit links (many-to-many)
export const dataRecordBuLinks = sqliteTable("data_record_bu_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dataRecordId: integer("data_record_id").notNull(),
  businessUnitId: integer("business_unit_id").notNull(),
  linkConfidence: integer("link_confidence"), // 0-100
  linkMethod: text("link_method"), // "ai_inferred" | "manual" | "explicit"
  createdAt: text("created_at"),
});

// Change Tracking — version diffs between data record versions
export const changeTracking = sqliteTable("change_tracking", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dataRecordId: integer("data_record_id").notNull(),
  previousRecordId: integer("previous_record_id"),
  changeType: text("change_type").notNull(), // "created" | "updated" | "deleted"
  changeSummary: text("change_summary"),
  changedFields: text("changed_fields"), // JSON array of field names
  detectedAt: text("detected_at").notNull(),
  triggeredReeval: integer("triggered_reeval").default(0), // boolean
});

// === Insert Schemas ===

export const insertBusinessUnitSchema = createInsertSchema(businessUnits).omit({ id: true });
export const insertBudgetDocumentSchema = createInsertSchema(budgetDocuments).omit({ id: true });
export const insertEvaluationReportSchema = createInsertSchema(evaluationReports).omit({ id: true });
export const insertRubricCriteriaSchema = createInsertSchema(rubricCriteria).omit({ id: true });
export const insertDataSourceConfigSchema = createInsertSchema(dataSourceConfigs).omit({ id: true });
export const insertIngestionEventSchema = createInsertSchema(ingestionEvents).omit({ id: true });
export const insertNormalizedDataRecordSchema = createInsertSchema(normalizedDataRecords).omit({ id: true });
export const insertDataRecordBuLinkSchema = createInsertSchema(dataRecordBuLinks).omit({ id: true });
export const insertChangeTrackingSchema = createInsertSchema(changeTracking).omit({ id: true });

// === Original Types ===

export type BusinessUnit = typeof businessUnits.$inferSelect;
export type InsertBusinessUnit = z.infer<typeof insertBusinessUnitSchema>;
export type BudgetDocument = typeof budgetDocuments.$inferSelect;
export type InsertBudgetDocument = z.infer<typeof insertBudgetDocumentSchema>;
export type EvaluationReport = typeof evaluationReports.$inferSelect;
export type InsertEvaluationReport = z.infer<typeof insertEvaluationReportSchema>;
export type RubricCriteria = typeof rubricCriteria.$inferSelect;
export type InsertRubricCriteria = z.infer<typeof insertRubricCriteriaSchema>;

// === Pipeline Types ===

export type DataSourceConfig = typeof dataSourceConfigs.$inferSelect;
export type InsertDataSourceConfig = z.infer<typeof insertDataSourceConfigSchema>;
export type IngestionEvent = typeof ingestionEvents.$inferSelect;
export type InsertIngestionEvent = z.infer<typeof insertIngestionEventSchema>;
export type NormalizedDataRecord = typeof normalizedDataRecords.$inferSelect;
export type InsertNormalizedDataRecord = z.infer<typeof insertNormalizedDataRecordSchema>;
export type DataRecordBuLink = typeof dataRecordBuLinks.$inferSelect;
export type InsertDataRecordBuLink = z.infer<typeof insertDataRecordBuLinkSchema>;
export type ChangeTracking = typeof changeTracking.$inferSelect;
export type InsertChangeTracking = z.infer<typeof insertChangeTrackingSchema>;
