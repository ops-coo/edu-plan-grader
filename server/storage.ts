import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
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
