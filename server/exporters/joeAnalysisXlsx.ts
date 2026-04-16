import ExcelJS from "exceljs";
import { storage } from "../storage";
import type { BusinessUnit, EvaluationReport, RubricCriteria } from "@shared/schema";

// Canonical order + labels + weights for Joe's 8 rubric categories.
// Source of truth: server/evaluator.ts RUBRIC (lines 5-93) and
// client/src/pages/business-unit-detail.tsx rubricLabels (lines 30-39).
const RUBRIC_CATEGORIES: ReadonlyArray<{ key: string; label: string; weight: number }> = [
  { key: "mission_alignment", label: "Mission Alignment", weight: 0.15 },
  { key: "academic_excellence", label: "Academic & Life Skills", weight: 0.15 },
  { key: "product_pricing", label: "Product & Pricing Design", weight: 0.15 },
  { key: "gtm_community", label: "GTM & Community", weight: 0.1 },
  { key: "ai_scalability", label: "AI & Scalability", weight: 0.15 },
  { key: "financial_model", label: "Financial Model", weight: 0.15 },
  { key: "talent_strategy", label: "Talent Strategy", weight: 0.05 },
  { key: "access_funding", label: "Access & Funding Pathway", weight: 0.1 },
];

// Matches the UI thresholds in business-unit-detail.tsx:52 (ScoreBar color).
function scoreFillColor(score: number): string {
  if (score >= 8) return "FFD1FAE5"; // emerald-100
  if (score >= 6) return "FFFEF3C7"; // amber-100
  return "FFFEE2E2"; // red-100
}

function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
  } catch {
    return [];
  }
}

function parseScoreMap(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" }, // slate-200
  };
  row.alignment = { vertical: "middle" };
}

function autoWidthColumns(sheet: ExcelJS.Worksheet, min = 12, max = 80): void {
  sheet.columns.forEach((col) => {
    let maxLen = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const val = cell.value == null ? "" : String(cell.value);
      for (const line of val.split("\n")) {
        if (line.length > maxLen) maxLen = line.length;
      }
    });
    col.width = Math.min(maxLen + 2, max);
  });
}

/**
 * Build an XLSX workbook describing one Joe-analysis evaluation in full.
 * Sheets: Summary, Rubric Scores, Key Findings, Critical Issues, Detailed Criteria.
 */
export async function buildSingleEvaluationWorkbook(
  evaluationId: number,
): Promise<ExcelJS.Workbook> {
  const evaluation = storage.getEvaluationReport(evaluationId);
  if (!evaluation) {
    throw new Error(`Evaluation ${evaluationId} not found`);
  }
  const bu = storage.getBusinessUnit(evaluation.businessUnitId);
  if (!bu) {
    throw new Error(`Business unit ${evaluation.businessUnitId} not found`);
  }
  const criteria = storage.getRubricCriteria(evaluationId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Edu Plan Grader";
  workbook.created = new Date();

  buildSummarySheet(workbook, bu, evaluation);
  buildRubricScoresSheet(workbook, evaluation);
  buildFindingsSheet(workbook, "Key Findings", parseStringArray(evaluation.keyFindings));
  buildFindingsSheet(workbook, "Critical Issues", parseStringArray(evaluation.criticalIssues));
  buildDetailedCriteriaSheet(workbook, criteria);

  return workbook;
}

/**
 * Build an XLSX workbook comparing the latest Joe-analysis evaluation across
 * every business unit. BUs without an evaluation are included with blank score
 * columns so the gap is visible.
 * Sheets: Overview, Findings & Issues, Detailed Criteria.
 */
export async function buildAllBudgetsWorkbook(): Promise<ExcelJS.Workbook> {
  const units = storage.getBusinessUnits();
  const rows = units.map((bu) => {
    const evaluation = storage.getLatestEvaluation(bu.id);
    const criteria = evaluation ? storage.getRubricCriteria(evaluation.id) : [];
    return { bu, evaluation, criteria };
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Edu Plan Grader";
  workbook.created = new Date();

  buildOverviewSheet(workbook, rows);
  buildFindingsAndIssuesSheet(workbook, rows);
  buildAllDetailedCriteriaSheet(workbook, rows);

  return workbook;
}

// ---------- Sheet builders ----------

function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  bu: BusinessUnit,
  evaluation: EvaluationReport,
): void {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Field", key: "field" },
    { header: "Value", key: "value" },
  ];
  styleHeaderRow(sheet.getRow(1));

  const rows: Array<[string, string | number]> = [
    ["Business Unit", bu.name],
    ["General Manager", bu.gm ?? ""],
    ["Sector", bu.sector ?? ""],
    ["Status", bu.status],
    ["Brainlift Rating", bu.brainliftRating ?? ""],
    ["BU Overall Score (/100)", bu.overallScore ?? ""],
    ["Recommendation", evaluation.recommendation],
    ["Evaluation Overall Score (/10)", evaluation.overallScore],
    ["Confidence (%)", evaluation.confidenceScore],
    ["Evaluation Date", formatDate(evaluation.createdAt)],
    ["Executive Summary", evaluation.executiveSummary],
    ["Financial Summary", evaluation.financialSummary ?? ""],
    ["Budget Doc URL", bu.budgetDocUrl ?? ""],
    ["Budget P&L URL", bu.budgetPnlUrl ?? ""],
  ];
  for (const [field, value] of rows) {
    sheet.addRow({ field, value });
  }
  sheet.getColumn("value").alignment = { wrapText: true, vertical: "top" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoWidthColumns(sheet, 14, 100);
}

function buildRubricScoresSheet(
  workbook: ExcelJS.Workbook,
  evaluation: EvaluationReport,
): void {
  const sheet = workbook.addWorksheet("Rubric Scores");
  sheet.columns = [
    { header: "Category", key: "label", width: 32 },
    { header: "Weight", key: "weight", width: 10 },
    { header: "Score (0-10)", key: "score", width: 14 },
    { header: "Weighted Contribution", key: "weighted", width: 22 },
  ];
  styleHeaderRow(sheet.getRow(1));

  const scores = parseScoreMap(evaluation.rubricScores);
  let weightedSum = 0;

  for (const cat of RUBRIC_CATEGORIES) {
    const score = typeof scores[cat.key] === "number" ? scores[cat.key] : null;
    const weighted = score != null ? score * cat.weight : null;
    if (weighted != null) weightedSum += weighted;

    const row = sheet.addRow({
      label: cat.label,
      weight: cat.weight,
      score: score,
      weighted: weighted,
    });
    row.getCell("weight").numFmt = "0%";
    row.getCell("score").numFmt = "0.0";
    row.getCell("weighted").numFmt = "0.00";

    if (score != null) {
      row.getCell("score").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: scoreFillColor(score) },
      };
    }
  }

  sheet.addRow({});
  const totalRow = sheet.addRow({
    label: "Overall (weighted)",
    weight: 1,
    score: evaluation.overallScore,
    weighted: weightedSum,
  });
  totalRow.font = { bold: true };
  totalRow.getCell("weight").numFmt = "0%";
  totalRow.getCell("score").numFmt = "0.00";
  totalRow.getCell("weighted").numFmt = "0.00";

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function buildFindingsSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  items: string[],
): void {
  const sheet = workbook.addWorksheet(title);
  sheet.columns = [
    { header: "#", key: "n", width: 6 },
    { header: title, key: "text" },
  ];
  styleHeaderRow(sheet.getRow(1));

  items.forEach((text, i) => {
    sheet.addRow({ n: i + 1, text });
  });
  sheet.getColumn("text").alignment = { wrapText: true, vertical: "top" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoWidthColumns(sheet, 20, 100);
}

function buildDetailedCriteriaSheet(
  workbook: ExcelJS.Workbook,
  criteria: RubricCriteria[],
): void {
  const sheet = workbook.addWorksheet("Detailed Criteria");
  sheet.columns = [
    { header: "Category", key: "label", width: 28 },
    { header: "Score (0-10)", key: "score", width: 14 },
    { header: "Weight", key: "weight", width: 10 },
    { header: "Justification", key: "justification", width: 60 },
    { header: "Evidence", key: "evidence", width: 60 },
  ];
  styleHeaderRow(sheet.getRow(1));

  // Preserve canonical rubric order even if criteria rows arrive out of order.
  const byKey = new Map(criteria.map((c) => [c.criterionKey, c]));
  const ordered = [
    ...RUBRIC_CATEGORIES.map((cat) => byKey.get(cat.key)).filter(
      (c): c is RubricCriteria => c != null,
    ),
    // Any unexpected criteria keys (defensive) tacked on the end
    ...criteria.filter((c) => !RUBRIC_CATEGORIES.some((cat) => cat.key === c.criterionKey)),
  ];

  for (const c of ordered) {
    const row = sheet.addRow({
      label: c.criterionLabel,
      score: c.score,
      weight: c.weight,
      justification: c.justification,
      evidence: c.evidence ?? "",
    });
    row.getCell("score").numFmt = "0.0";
    row.getCell("weight").numFmt = "0%";
    row.getCell("score").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: scoreFillColor(c.score) },
    };
    row.alignment = { wrapText: true, vertical: "top" };
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

// ---------- All-BUs sheet builders ----------

interface BudgetRow {
  bu: BusinessUnit;
  evaluation: EvaluationReport | undefined;
  criteria: RubricCriteria[];
}

function buildOverviewSheet(workbook: ExcelJS.Workbook, rows: BudgetRow[]): void {
  const sheet = workbook.addWorksheet("Overview");

  const baseColumns: Partial<ExcelJS.Column>[] = [
    { header: "Business Unit", key: "name", width: 32 },
    { header: "GM", key: "gm", width: 20 },
    { header: "Brainlift Rating", key: "brainlift", width: 18 },
    { header: "Status", key: "status", width: 16 },
    { header: "Recommendation", key: "recommendation", width: 20 },
    { header: "Overall (/10)", key: "overall", width: 13 },
    { header: "Confidence (%)", key: "confidence", width: 14 },
    { header: "Evaluated", key: "evaluated", width: 12 },
  ];
  const categoryColumns: Partial<ExcelJS.Column>[] = RUBRIC_CATEGORIES.map((c) => ({
    header: c.label,
    key: `cat_${c.key}`,
    width: 18,
  }));
  sheet.columns = [...baseColumns, ...categoryColumns];
  styleHeaderRow(sheet.getRow(1));

  for (const { bu, evaluation } of rows) {
    const scores = evaluation ? parseScoreMap(evaluation.rubricScores) : {};
    const rowData: Record<string, unknown> = {
      name: bu.name,
      gm: bu.gm ?? "",
      brainlift: bu.brainliftRating ?? "",
      status: bu.status,
      recommendation: evaluation?.recommendation ?? "",
      overall: evaluation ? evaluation.overallScore : "",
      confidence: evaluation?.confidenceScore ?? "",
      evaluated: evaluation ? formatDate(evaluation.createdAt) : "",
    };
    for (const cat of RUBRIC_CATEGORIES) {
      const s = scores[cat.key];
      rowData[`cat_${cat.key}`] = typeof s === "number" ? s : "";
    }
    const row = sheet.addRow(rowData);
    if (evaluation) row.getCell("overall").numFmt = "0.00";

    for (const cat of RUBRIC_CATEGORIES) {
      const cell = row.getCell(`cat_${cat.key}`);
      const score = scores[cat.key];
      if (typeof score === "number") {
        cell.numFmt = "0.0";
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: scoreFillColor(score) },
        };
      }
    }
  }

  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: baseColumns.length + categoryColumns.length },
  };
}

function buildFindingsAndIssuesSheet(
  workbook: ExcelJS.Workbook,
  rows: BudgetRow[],
): void {
  const sheet = workbook.addWorksheet("Findings & Issues");
  sheet.columns = [
    { header: "Business Unit", key: "name", width: 32 },
    { header: "Recommendation", key: "recommendation", width: 20 },
    { header: "Executive Summary", key: "summary", width: 60 },
    { header: "Key Findings", key: "findings", width: 60 },
    { header: "Critical Issues", key: "issues", width: 60 },
  ];
  styleHeaderRow(sheet.getRow(1));

  const bullet = (items: string[]) => items.map((i) => `• ${i}`).join("\n");

  for (const { bu, evaluation } of rows) {
    if (!evaluation) {
      sheet.addRow({ name: bu.name, recommendation: "(not evaluated)" });
      continue;
    }
    const findings = parseStringArray(evaluation.keyFindings);
    const issues = parseStringArray(evaluation.criticalIssues);
    const row = sheet.addRow({
      name: bu.name,
      recommendation: evaluation.recommendation,
      summary: evaluation.executiveSummary,
      findings: bullet(findings),
      issues: bullet(issues),
    });
    row.alignment = { wrapText: true, vertical: "top" };
  }
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildAllDetailedCriteriaSheet(
  workbook: ExcelJS.Workbook,
  rows: BudgetRow[],
): void {
  const sheet = workbook.addWorksheet("Detailed Criteria");
  sheet.columns = [
    { header: "Business Unit", key: "name", width: 28 },
    { header: "Category", key: "label", width: 28 },
    { header: "Score (0-10)", key: "score", width: 14 },
    { header: "Weight", key: "weight", width: 10 },
    { header: "Justification", key: "justification", width: 60 },
    { header: "Evidence", key: "evidence", width: 60 },
  ];
  styleHeaderRow(sheet.getRow(1));

  for (const { bu, criteria } of rows) {
    if (criteria.length === 0) continue;
    const byKey = new Map(criteria.map((c) => [c.criterionKey, c]));
    const ordered = [
      ...RUBRIC_CATEGORIES.map((cat) => byKey.get(cat.key)).filter(
        (c): c is RubricCriteria => c != null,
      ),
      ...criteria.filter((c) => !RUBRIC_CATEGORIES.some((cat) => cat.key === c.criterionKey)),
    ];
    for (const c of ordered) {
      const row = sheet.addRow({
        name: bu.name,
        label: c.criterionLabel,
        score: c.score,
        weight: c.weight,
        justification: c.justification,
        evidence: c.evidence ?? "",
      });
      row.getCell("score").numFmt = "0.0";
      row.getCell("weight").numFmt = "0%";
      row.getCell("score").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: scoreFillColor(c.score) },
      };
      row.alignment = { wrapText: true, vertical: "top" };
    }
  }

  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 6 },
  };
}

// ---------- Filename helper (also used by routes) ----------

export function slugifyBuName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "business-unit"
  );
}

export function isoDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
