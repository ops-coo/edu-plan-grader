import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  businessUnits,
  budgetDocuments,
  evaluationReports,
  rubricCriteria,
  type BusinessUnit,
  type InsertBusinessUnit,
  type BudgetDocument,
  type InsertBudgetDocument,
  type EvaluationReport,
  type InsertEvaluationReport,
  type RubricCriteria,
  type InsertRubricCriteria,
} from "@shared/schema";

const sqlite = new Database("data.db");
const db = drizzle(sqlite);

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
    const results = db
      .select()
      .from(evaluationReports)
      .where(eq(evaluationReports.businessUnitId, businessUnitId))
      .all();
    return results.length > 0 ? results[results.length - 1] : undefined;
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
}

export const storage = new DatabaseStorage();
