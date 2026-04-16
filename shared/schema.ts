import { z } from "zod";

// ---- Types (match PostgreSQL plan_grader_* tables) ----

export interface BusinessUnit {
  id: number;
  name: string;
  gm: string | null;
  sector: string | null;
  status: string;
  overallScore: number | null;
  budgetDocUrl: string | null;
  budgetPnlUrl: string | null;
  brainliftRating: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BudgetDocument {
  id: number;
  businessUnitId: number;
  documentType: string;
  url: string;
  quarter: string | null;
  title: string | null;
  createdAt: string | null;
}

export interface EvaluationReport {
  id: number;
  businessUnitId: number;
  createdAt: string;
  recommendation: string;
  overallScore: number;
  confidenceScore: number;
  executiveSummary: string;
  keyFindings: string;
  criticalIssues: string;
  rubricScores: string;
  financialSummary: string | null;
  reportUrl: string | null;
}

export interface RubricCriteria {
  id: number;
  evaluationId: number;
  criterionKey: string;
  criterionLabel: string;
  score: number;
  weight: number;
  justification: string;
  evidence: string | null;
}

// ---- Insert schemas (Zod, omit id) ----

export const insertBusinessUnitSchema = z.object({
  name: z.string(),
  gm: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  status: z.string().default("pending_review"),
  overallScore: z.number().nullable().optional(),
  budgetDocUrl: z.string().nullable().optional(),
  budgetPnlUrl: z.string().nullable().optional(),
  brainliftRating: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export const insertBudgetDocumentSchema = z.object({
  businessUnitId: z.number(),
  documentType: z.string(),
  url: z.string(),
  quarter: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});

export const insertEvaluationReportSchema = z.object({
  businessUnitId: z.number(),
  createdAt: z.string(),
  recommendation: z.string(),
  overallScore: z.number(),
  confidenceScore: z.number(),
  executiveSummary: z.string(),
  keyFindings: z.string(),
  criticalIssues: z.string(),
  rubricScores: z.string(),
  financialSummary: z.string().nullable().optional(),
  reportUrl: z.string().nullable().optional(),
});

export const insertRubricCriteriaSchema = z.object({
  evaluationId: z.number(),
  criterionKey: z.string(),
  criterionLabel: z.string(),
  score: z.number(),
  weight: z.number(),
  justification: z.string(),
  evidence: z.string().nullable().optional(),
});

export type InsertBusinessUnit = z.infer<typeof insertBusinessUnitSchema>;
export type InsertBudgetDocument = z.infer<typeof insertBudgetDocumentSchema>;
export type InsertEvaluationReport = z.infer<typeof insertEvaluationReportSchema>;
export type InsertRubricCriteria = z.infer<typeof insertRubricCriteriaSchema>;
