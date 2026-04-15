import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Education Business Units
export const businessUnits = sqliteTable("business_units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(), // "physical_schools" | "virtual" | "sports" | "tech" | "marketing" | "other"
  budgetPlanUrl: text("budget_plan_url"),
  budgetModelUrl: text("budget_model_url"),
  financialModelUrl: text("financial_model_url"),
  q1Actual: real("q1_actual"),
  q2Budget: real("q2_budget"),
  syTotal: real("sy_total"),
  ltdTotal: real("ltd_total"),
  annualizedRevenue: real("annualized_revenue"),
  enrollmentCurrent: integer("enrollment_current"),
  enrollmentTarget: integer("enrollment_target"),
  learningMultiplier: real("learning_multiplier"), // e.g. 5.3x
  status: text("status").notNull().default("pending"), // "pending" | "evaluating" | "approved" | "rejected" | "fix_required"
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
export const insertEvaluationReportSchema = createInsertSchema(evaluationReports).omit({ id: true });
export const insertRubricCriteriaSchema = createInsertSchema(rubricCriteria).omit({ id: true });

export type BusinessUnit = typeof businessUnits.$inferSelect;
export type InsertBusinessUnit = z.infer<typeof insertBusinessUnitSchema>;
export type EvaluationReport = typeof evaluationReports.$inferSelect;
export type InsertEvaluationReport = z.infer<typeof insertEvaluationReportSchema>;
export type RubricCriteria = typeof rubricCriteria.$inferSelect;
export type InsertRubricCriteria = z.infer<typeof insertRubricCriteriaSchema>;
