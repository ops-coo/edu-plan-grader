import pg from "pg";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type {
  BusinessUnit,
  InsertBusinessUnit,
  BudgetDocument,
  InsertBudgetDocument,
  EvaluationReport,
  InsertEvaluationReport,
  RubricCriteria,
  InsertRubricCriteria,
} from "@shared/schema";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || "136.116.93.94",
  port: parseInt(process.env.PGPORT || "5432", 10),
  database: process.env.PGDATABASE || "edu_finance",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "EduFinance2026!",
  ssl: { rejectUnauthorized: false },
});

// ---- helpers ----

/** Map a snake_case pg row to camelCase BusinessUnit */
function toBU(row: any): BusinessUnit {
  return {
    id: row.id,
    name: row.name,
    gm: row.gm,
    sector: row.sector,
    status: row.status,
    overallScore: row.overall_score != null ? Number(row.overall_score) : null,
    budgetDocUrl: row.budget_doc_url,
    budgetPnlUrl: row.budget_pnl_url,
    brainliftRating: row.brainlift_rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDoc(row: any): BudgetDocument {
  return {
    id: row.id,
    businessUnitId: row.business_unit_id,
    documentType: row.document_type,
    url: row.url,
    quarter: row.quarter,
    title: row.title,
    createdAt: row.created_at,
  };
}

function toEval(row: any): EvaluationReport {
  return {
    id: row.id,
    businessUnitId: row.business_unit_id,
    createdAt: row.created_at,
    recommendation: row.recommendation,
    overallScore: Number(row.overall_score),
    confidenceScore: Number(row.confidence_score),
    executiveSummary: row.executive_summary,
    keyFindings: row.key_findings,
    criticalIssues: row.critical_issues,
    rubricScores: row.rubric_scores,
    financialSummary: row.financial_summary,
    reportUrl: row.report_url,
  };
}

function toRubric(row: any): RubricCriteria {
  return {
    id: row.id,
    evaluationId: row.evaluation_id,
    criterionKey: row.criterion_key,
    criterionLabel: row.criterion_label,
    score: Number(row.score),
    weight: Number(row.weight),
    justification: row.justification,
    evidence: row.evidence,
  };
}

// ---- Create tables (idempotent) ----

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_grader_business_units (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      gm TEXT,
      sector TEXT DEFAULT 'Education',
      status TEXT NOT NULL DEFAULT 'pending_review',
      overall_score DOUBLE PRECISION,
      budget_doc_url TEXT,
      budget_pnl_url TEXT,
      brainlift_rating TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS plan_grader_budget_documents (
      id SERIAL PRIMARY KEY,
      business_unit_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      url TEXT NOT NULL,
      quarter TEXT,
      title TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS plan_grader_evaluation_reports (
      id SERIAL PRIMARY KEY,
      business_unit_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      overall_score DOUBLE PRECISION NOT NULL,
      confidence_score INTEGER NOT NULL,
      executive_summary TEXT NOT NULL,
      key_findings TEXT NOT NULL,
      critical_issues TEXT NOT NULL,
      rubric_scores TEXT NOT NULL,
      financial_summary TEXT,
      report_url TEXT
    );
    CREATE TABLE IF NOT EXISTS plan_grader_rubric_criteria (
      id SERIAL PRIMARY KEY,
      evaluation_id INTEGER NOT NULL,
      criterion_key TEXT NOT NULL,
      criterion_label TEXT NOT NULL,
      score DOUBLE PRECISION NOT NULL,
      weight DOUBLE PRECISION NOT NULL,
      justification TEXT NOT NULL,
      evidence TEXT
    );
  `);

  await seedIfEmpty();
}

// ---- Auto-seed from bundled JSON if empty ----

async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT count(*) AS c FROM plan_grader_business_units");
  if (parseInt(rows[0].c, 10) > 0) return;

  const candidates = [
    resolve(__dirname, "../data/seed.json"),
    resolve(__dirname, "../../data/seed.json"),
    resolve(process.cwd(), "data/seed.json"),
  ];
  const seedPath = candidates.find((p) => existsSync(p));
  if (!seedPath) {
    console.log("[seed] No seed.json found — starting with empty database");
    return;
  }

  console.log(`[seed] Empty database detected — loading seed data from ${seedPath}`);
  const seed = JSON.parse(readFileSync(seedPath, "utf-8"));

  const insertMany = async (table: string, rows: Record<string, any>[]) => {
    if (!rows || rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
    for (const row of rows) {
      await pool.query(sql, cols.map((c) => row[c] ?? null));
    }
    console.log(`[seed] ${table}: ${rows.length} rows loaded`);
  };

  await insertMany("plan_grader_business_units", seed.business_units);
  await insertMany("plan_grader_budget_documents", seed.budget_documents);
  await insertMany("plan_grader_evaluation_reports", seed.evaluation_reports);
  await insertMany("plan_grader_rubric_criteria", seed.rubric_criteria);
  console.log("[seed] Database seeded successfully");
}

// ---- Storage interface (now async) ----

export interface IStorage {
  getBusinessUnits(): Promise<BusinessUnit[]>;
  getBusinessUnit(id: number): Promise<BusinessUnit | undefined>;
  createBusinessUnit(bu: InsertBusinessUnit): Promise<BusinessUnit>;
  updateBusinessUnit(id: number, bu: Partial<InsertBusinessUnit>): Promise<BusinessUnit | undefined>;

  getBudgetDocuments(businessUnitId: number): Promise<BudgetDocument[]>;
  createBudgetDocument(doc: InsertBudgetDocument): Promise<BudgetDocument>;

  getEvaluationReports(businessUnitId?: number): Promise<EvaluationReport[]>;
  getEvaluationReport(id: number): Promise<EvaluationReport | undefined>;
  getLatestEvaluation(businessUnitId: number): Promise<EvaluationReport | undefined>;
  createEvaluationReport(report: InsertEvaluationReport): Promise<EvaluationReport>;

  getRubricCriteria(evaluationId: number): Promise<RubricCriteria[]>;
  createRubricCriteria(criteria: InsertRubricCriteria): Promise<RubricCriteria>;
}

export class DatabaseStorage implements IStorage {
  // ---- Business Units ----
  async getBusinessUnits(): Promise<BusinessUnit[]> {
    const { rows } = await pool.query("SELECT * FROM plan_grader_business_units ORDER BY id");
    return rows.map(toBU);
  }

  async getBusinessUnit(id: number): Promise<BusinessUnit | undefined> {
    const { rows } = await pool.query("SELECT * FROM plan_grader_business_units WHERE id = $1", [id]);
    return rows[0] ? toBU(rows[0]) : undefined;
  }

  async createBusinessUnit(bu: InsertBusinessUnit): Promise<BusinessUnit> {
    const { rows } = await pool.query(
      `INSERT INTO plan_grader_business_units
        (name, gm, sector, status, overall_score, budget_doc_url, budget_pnl_url, brainlift_rating, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        bu.name,
        bu.gm ?? null,
        bu.sector ?? "Education",
        bu.status ?? "pending_review",
        bu.overallScore ?? null,
        bu.budgetDocUrl ?? null,
        bu.budgetPnlUrl ?? null,
        bu.brainliftRating ?? null,
        bu.createdAt ?? null,
        bu.updatedAt ?? null,
      ],
    );
    return toBU(rows[0]);
  }

  async updateBusinessUnit(id: number, bu: Partial<InsertBusinessUnit>): Promise<BusinessUnit | undefined> {
    // Build dynamic SET clause from provided fields
    const fieldMap: Record<string, string> = {
      name: "name",
      gm: "gm",
      sector: "sector",
      status: "status",
      overallScore: "overall_score",
      budgetDocUrl: "budget_doc_url",
      budgetPnlUrl: "budget_pnl_url",
      brainliftRating: "brainlift_rating",
      createdAt: "created_at",
      updatedAt: "updated_at",
    };
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in bu) {
        setClauses.push(`${col} = $${idx}`);
        values.push((bu as any)[key] ?? null);
        idx++;
      }
    }
    if (setClauses.length === 0) return this.getBusinessUnit(id);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE plan_grader_business_units SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return rows[0] ? toBU(rows[0]) : undefined;
  }

  // ---- Budget Documents ----
  async getBudgetDocuments(businessUnitId: number): Promise<BudgetDocument[]> {
    const { rows } = await pool.query(
      "SELECT * FROM plan_grader_budget_documents WHERE business_unit_id = $1 ORDER BY id",
      [businessUnitId],
    );
    return rows.map(toDoc);
  }

  async createBudgetDocument(doc: InsertBudgetDocument): Promise<BudgetDocument> {
    const { rows } = await pool.query(
      `INSERT INTO plan_grader_budget_documents
        (business_unit_id, document_type, url, quarter, title, created_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [doc.businessUnitId, doc.documentType, doc.url, doc.quarter ?? null, doc.title ?? null, doc.createdAt ?? null],
    );
    return toDoc(rows[0]);
  }

  // ---- Evaluation Reports ----
  async getEvaluationReports(businessUnitId?: number): Promise<EvaluationReport[]> {
    if (businessUnitId) {
      const { rows } = await pool.query(
        "SELECT * FROM plan_grader_evaluation_reports WHERE business_unit_id = $1 ORDER BY id",
        [businessUnitId],
      );
      return rows.map(toEval);
    }
    const { rows } = await pool.query("SELECT * FROM plan_grader_evaluation_reports ORDER BY id");
    return rows.map(toEval);
  }

  async getEvaluationReport(id: number): Promise<EvaluationReport | undefined> {
    const { rows } = await pool.query("SELECT * FROM plan_grader_evaluation_reports WHERE id = $1", [id]);
    return rows[0] ? toEval(rows[0]) : undefined;
  }

  async getLatestEvaluation(businessUnitId: number): Promise<EvaluationReport | undefined> {
    const { rows } = await pool.query(
      "SELECT * FROM plan_grader_evaluation_reports WHERE business_unit_id = $1 ORDER BY id DESC LIMIT 1",
      [businessUnitId],
    );
    return rows[0] ? toEval(rows[0]) : undefined;
  }

  async createEvaluationReport(report: InsertEvaluationReport): Promise<EvaluationReport> {
    const { rows } = await pool.query(
      `INSERT INTO plan_grader_evaluation_reports
        (business_unit_id, created_at, recommendation, overall_score, confidence_score,
         executive_summary, key_findings, critical_issues, rubric_scores, financial_summary, report_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        report.businessUnitId,
        report.createdAt,
        report.recommendation,
        report.overallScore,
        report.confidenceScore,
        report.executiveSummary,
        report.keyFindings,
        report.criticalIssues,
        report.rubricScores,
        report.financialSummary ?? null,
        report.reportUrl ?? null,
      ],
    );
    return toEval(rows[0]);
  }

  // ---- Rubric Criteria ----
  async getRubricCriteria(evaluationId: number): Promise<RubricCriteria[]> {
    const { rows } = await pool.query(
      "SELECT * FROM plan_grader_rubric_criteria WHERE evaluation_id = $1 ORDER BY id",
      [evaluationId],
    );
    return rows.map(toRubric);
  }

  async createRubricCriteria(criteria: InsertRubricCriteria): Promise<RubricCriteria> {
    const { rows } = await pool.query(
      `INSERT INTO plan_grader_rubric_criteria
        (evaluation_id, criterion_key, criterion_label, score, weight, justification, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        criteria.evaluationId,
        criteria.criterionKey,
        criteria.criterionLabel,
        criteria.score,
        criteria.weight,
        criteria.justification,
        criteria.evidence ?? null,
      ],
    );
    return toRubric(rows[0]);
  }
}

export const storage = new DatabaseStorage();
