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

export const insertBusinessUnitSchema = createInsertSchema(businessUnits).omit({ id: true });
export const insertBudgetDocumentSchema = createInsertSchema(budgetDocuments).omit({ id: true });
export const insertEvaluationReportSchema = createInsertSchema(evaluationReports).omit({ id: true });
export const insertRubricCriteriaSchema = createInsertSchema(rubricCriteria).omit({ id: true });

export type BusinessUnit = typeof businessUnits.$inferSelect;
export type InsertBusinessUnit = z.infer<typeof insertBusinessUnitSchema>;
export type BudgetDocument = typeof budgetDocuments.$inferSelect;
export type InsertBudgetDocument = z.infer<typeof insertBudgetDocumentSchema>;
export type EvaluationReport = typeof evaluationReports.$inferSelect;
export type InsertEvaluationReport = z.infer<typeof insertEvaluationReportSchema>;
export type RubricCriteria = typeof rubricCriteria.$inferSelect;
export type InsertRubricCriteria = z.infer<typeof insertRubricCriteriaSchema>;
