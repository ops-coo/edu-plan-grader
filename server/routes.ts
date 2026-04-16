import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { evaluateBusinessUnit } from "./evaluator";
import {
  buildSingleEvaluationWorkbook,
  buildAllBudgetsWorkbook,
  slugifyBuName,
  isoDateStamp,
} from "./exporters/joeAnalysisXlsx";
import * as fs from "fs";
import * as path from "path";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function registerRoutes(httpServer: Server, app: Express) {
  // Business Units
  app.get("/api/business-units", (_req, res) => {
    const units = storage.getBusinessUnits();
    res.json(units);
  });

  app.get("/api/business-units/:id", (req, res) => {
    const unit = storage.getBusinessUnit(parseInt(req.params.id));
    if (!unit) return res.status(404).json({ error: "Not found" });
    res.json(unit);
  });

  app.post("/api/business-units", (req, res) => {
    const unit = storage.createBusinessUnit(req.body);
    res.status(201).json(unit);
  });

  app.patch("/api/business-units/:id", (req, res) => {
    const unit = storage.updateBusinessUnit(parseInt(req.params.id), req.body);
    if (!unit) return res.status(404).json({ error: "Not found" });
    res.json(unit);
  });

  // Budget Documents
  app.get("/api/business-units/:id/documents", (req, res) => {
    const docs = storage.getBudgetDocuments(parseInt(req.params.id));
    res.json(docs);
  });

  // Evaluation Reports
  app.get("/api/evaluations", (req, res) => {
    const buId = req.query.businessUnitId ? parseInt(req.query.businessUnitId as string) : undefined;
    const reports = storage.getEvaluationReports(buId);
    res.json(reports);
  });

  // Portfolio-wide XLSX export. Registered BEFORE /api/evaluations/:id so the
  // literal "export-all.xlsx" segment isn't captured as :id.
  app.get("/api/evaluations/export-all.xlsx", async (_req, res) => {
    try {
      const workbook = await buildAllBudgetsWorkbook();
      const filename = `joe-analysis-all-budgets-${isoDateStamp()}.xlsx`;
      res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to build workbook" });
    }
  });

  app.get("/api/evaluations/:id", (req, res) => {
    const report = storage.getEvaluationReport(parseInt(req.params.id));
    if (!report) return res.status(404).json({ error: "Not found" });
    res.json(report);
  });

  app.get("/api/business-units/:id/latest-evaluation", (req, res) => {
    const report = storage.getLatestEvaluation(parseInt(req.params.id));
    if (!report) return res.status(404).json({ error: "No evaluation found" });
    res.json(report);
  });

  app.post("/api/evaluations", (req, res) => {
    const report = storage.createEvaluationReport(req.body);
    res.status(201).json(report);
  });

  // Rubric Criteria
  app.get("/api/evaluations/:id/rubric", (req, res) => {
    const criteria = storage.getRubricCriteria(parseInt(req.params.id));
    res.json(criteria);
  });

  app.post("/api/rubric-criteria", (req, res) => {
    const criteria = storage.createRubricCriteria(req.body);
    res.status(201).json(criteria);
  });

  // === Joe Analysis XLSX Exports ===

  // Download a single evaluation's full Joe analysis as XLSX
  app.get("/api/evaluations/:id/export.xlsx", async (req, res) => {
    const evaluationId = parseInt(req.params.id);
    const evaluation = storage.getEvaluationReport(evaluationId);
    if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });
    const bu = storage.getBusinessUnit(evaluation.businessUnitId);

    try {
      const workbook = await buildSingleEvaluationWorkbook(evaluationId);
      const filename = `joe-analysis-${slugifyBuName(bu?.name ?? "bu")}-${isoDateStamp()}.xlsx`;
      res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to build workbook" });
    }
  });

  // Convenience: download the latest Joe analysis for a BU
  app.get("/api/business-units/:id/export.xlsx", async (req, res) => {
    const buId = parseInt(req.params.id);
    const bu = storage.getBusinessUnit(buId);
    if (!bu) return res.status(404).json({ error: "Business unit not found" });
    const latest = storage.getLatestEvaluation(buId);
    if (!latest) return res.status(404).json({ error: "No evaluation yet for this business unit" });

    try {
      const workbook = await buildSingleEvaluationWorkbook(latest.id);
      const filename = `joe-analysis-${slugifyBuName(bu.name)}-${isoDateStamp()}.xlsx`;
      res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to build workbook" });
    }
  });

  // Dashboard summary endpoint
  app.get("/api/dashboard-summary", (_req, res) => {
    const units = storage.getBusinessUnits();

    const totalUnits = units.length;
    const pendingReview = units.filter((u) => u.status === "pending_review").length;
    const evaluated = units.filter((u) => u.brainliftRating != null).length;
    const inProgress = units.filter((u) => u.status === "in_progress").length;
    const onHold = units.filter((u) => u.status === "on_hold").length;
    const approved = units.filter((u) => u.status === "approved").length;
    const rejected = units.filter((u) => u.status === "rejected").length;
    const fixRequired = units.filter((u) => u.status === "fix_required").length;

    const scored = units.filter((u) => u.overallScore != null);
    const avgScore = scored.length > 0
      ? scored.reduce((sum, u) => sum + (u.overallScore || 0), 0) / scored.length
      : 0;

    const exemplary = units.filter((u) => u.brainliftRating === "Exemplary").length;
    const promising = units.filter((u) => u.brainliftRating === "Promising").length;
    const developing = units.filter((u) => u.brainliftRating === "Developing").length;
    const criticallyFlawed = units.filter((u) => u.brainliftRating === "Critically Flawed").length;
    const notRated = units.filter((u) => u.brainliftRating == null).length;

    res.json({
      totalUnits,
      pendingReview,
      evaluated,
      inProgress,
      onHold,
      approved,
      rejected,
      fixRequired,
      avgScore,
      exemplary,
      promising,
      developing,
      criticallyFlawed,
      notRated,
    });
  });

  // === Evaluation Endpoints ===

  // Run evaluation for a single BU
  app.post("/api/evaluate/:id", async (req, res) => {
    const buId = parseInt(req.params.id);
    const bu = storage.getBusinessUnit(buId);
    if (!bu) return res.status(404).json({ error: "Business unit not found" });

    try {
      const result = await evaluateBusinessUnit(buId);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Batch evaluate all BUs (or subset)
  app.post("/api/evaluate-all", async (req, res) => {
    const units = storage.getBusinessUnits();
    const results: any[] = [];
    const onlyPending = req.query.onlyPending === "true";

    const targets = onlyPending
      ? units.filter((u) => u.status === "pending_review")
      : units;

    // Process sequentially to avoid rate limits
    for (const bu of targets) {
      try {
        const result = await evaluateBusinessUnit(bu.id);
        results.push({ buId: bu.id, name: bu.name, ...result });
      } catch (err: any) {
        results.push({ buId: bu.id, name: bu.name, success: false, error: err.message });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    res.json({ total: targets.length, succeeded, failed, results });
  });

  // Budget document creation
  app.post("/api/budget-documents", (req, res) => {
    const doc = storage.createBudgetDocument(req.body);
    res.status(201).json(doc);
  });

  // Bulk seed endpoint — accepts full seed JSON payload
  app.post("/api/seed-bulk", (req, res) => {
    const { business_units, budget_documents, evaluation_reports, rubric_criteria } = req.body;
    const results: any = { business_units: 0, budget_documents: 0, evaluation_reports: 0, rubric_criteria: 0 };
    const idMap: Record<number, number> = {};
    const evalIdMap: Record<number, number> = {};

    // 1. Business units
    if (business_units) {
      for (const bu of business_units) {
        const oldId = bu.id;
        const created = storage.createBusinessUnit({
          name: bu.name,
          gm: bu.gm || null,
          sector: bu.sector || "Education",
          status: bu.status || "pending_review",
          overallScore: bu.overall_score ?? null,
          budgetDocUrl: bu.budget_doc_url || null,
          budgetPnlUrl: bu.budget_pnl_url || null,
          brainliftRating: bu.brainlift_rating || null,
          createdAt: bu.created_at || new Date().toISOString(),
          updatedAt: bu.updated_at || new Date().toISOString(),
        });
        idMap[oldId] = created.id;
        results.business_units++;
      }
    }

    // 2. Budget documents
    if (budget_documents) {
      for (const doc of budget_documents) {
        const newBuId = idMap[doc.business_unit_id];
        if (!newBuId) continue;
        storage.createBudgetDocument({
          businessUnitId: newBuId,
          documentType: doc.document_type,
          url: doc.url,
          quarter: doc.quarter || null,
          title: doc.title || null,
          createdAt: doc.created_at || new Date().toISOString(),
        });
        results.budget_documents++;
      }
    }

    // 3. Evaluation reports
    if (evaluation_reports) {
      for (const ev of evaluation_reports) {
        const newBuId = idMap[ev.business_unit_id];
        if (!newBuId) continue;
        const created = storage.createEvaluationReport({
          businessUnitId: newBuId,
          createdAt: ev.created_at,
          recommendation: ev.recommendation,
          overallScore: ev.overall_score,
          confidenceScore: ev.confidence_score,
          executiveSummary: ev.executive_summary,
          keyFindings: ev.key_findings,
          criticalIssues: ev.critical_issues,
          rubricScores: ev.rubric_scores,
          financialSummary: ev.financial_summary || null,
          reportUrl: ev.report_url || null,
        });
        evalIdMap[ev.id] = created.id;
        results.evaluation_reports++;
      }
    }

    // 4. Rubric criteria
    if (rubric_criteria) {
      for (const rc of rubric_criteria) {
        const newEvalId = evalIdMap[rc.evaluation_id];
        if (!newEvalId) continue;
        storage.createRubricCriteria({
          evaluationId: newEvalId,
          criterionKey: rc.criterion_key,
          criterionLabel: rc.criterion_label,
          score: rc.score,
          weight: rc.weight,
          justification: rc.justification,
          evidence: rc.evidence || null,
        });
        results.rubric_criteria++;
      }
    }

    res.json({ message: "Bulk seed complete", results });
  });

  // Legacy seed endpoint — uses real BU data from JSON files
  app.post("/api/seed", (_req, res) => {
    const existingUnits = storage.getBusinessUnits();
    if (existingUnits.length > 0) {
      return res.json({ message: "Already seeded", count: existingUnits.length });
    }

    // Read real BU data
    const buDataPath = path.resolve("/home/user/workspace/bq_bu_records.json");
    const docDataPath = path.resolve("/home/user/workspace/bq_doc_records.json");

    let buRecords: any[] = [];
    let docRecords: any[] = [];

    try {
      buRecords = JSON.parse(fs.readFileSync(buDataPath, "utf-8"));
      docRecords = JSON.parse(fs.readFileSync(docDataPath, "utf-8"));
    } catch (err) {
      return res.status(500).json({ error: "Failed to read seed data files", detail: String(err) });
    }

    // Create BUs from real data — track mapping from original ID to new auto-increment ID
    const idMap: Record<number, number> = {};
    const created: any[] = [];

    for (const rec of buRecords) {
      const bu = storage.createBusinessUnit({
        name: rec.name,
        gm: rec.gm || null,
        sector: rec.sector || "Education",
        status: rec.status || "pending_review",
        overallScore: rec.overall_score ?? null,
        budgetDocUrl: rec.budget_doc_url || null,
        budgetPnlUrl: rec.budget_pnl_url || null,
        brainliftRating: rec.brainlift_rating || null,
        createdAt: rec.created_at || new Date().toISOString(),
        updatedAt: rec.updated_at || new Date().toISOString(),
      });
      idMap[rec.id] = bu.id;
      created.push(bu);
    }

    // Create budget documents from real data
    let docsCreated = 0;
    for (const doc of docRecords) {
      const newBuId = idMap[doc.business_unit_id];
      if (newBuId) {
        storage.createBudgetDocument({
          businessUnitId: newBuId,
          documentType: doc.document_type,
          url: doc.url,
          quarter: doc.quarter || null,
          title: doc.title || null,
          createdAt: doc.created_at || new Date().toISOString(),
        });
        docsCreated++;
      }
    }

    // Create sample evaluations for BUs that match known names
    // Find the new IDs for: "Homeschool/DTC Apps" (was Alpha Anywhere in old seed),
    // "Strata" (was TSA Virtual), "Physical Private Schools" (was Prequel-like reject)
    const homeschoolBu = created.find((u) => u.name === "Homeschool/DTC Apps");
    const strataBu = created.find((u) => u.name === "Strata");
    const physicalBu = created.find((u) => u.name === "Physical Private Schools");

    if (homeschoolBu) {
      const aaEval = storage.createEvaluationReport({
        businessUnitId: homeschoolBu.id,
        createdAt: new Date().toISOString(),
        recommendation: "APPROVE",
        overallScore: 8.2,
        confidenceScore: 85,
        executiveSummary: "Homeschool/DTC Apps demonstrates strong alignment with Joe's education vision. 5.3x learning multiplier exceeds the >2x threshold for marketing spend. Direct-to-parent GTM is validated. Unit economics are positive with clear path to scale. Recommend approval with marketing acceleration.",
        keyFindings: JSON.stringify([
          "5.3x learning multiplier — strongest academic results in the portfolio",
          "Strong enrollment growth, on track for accelerated targets",
          "Accelerated plan projects significant scale by Q2'27",
          "Positive margins in both base and accelerated scenarios",
          "Direct-to-parent GTM aligns with Joe's core values"
        ]),
        criticalIssues: JSON.stringify([
          "Marketing spend decision requires high confidence in CAC payback",
          "Scaling aggressively requires clear capacity plan"
        ]),
        rubricScores: JSON.stringify({
          mission_alignment: 9.0,
          academic_excellence: 9.5,
          product_pricing: 7.5,
          gtm_community: 8.0,
          ai_scalability: 7.0,
          financial_model: 8.5,
          talent_strategy: 7.5,
          access_funding: 8.0
        }),
        financialSummary: "Exemplary brainlift rating (85/100). Strong unit economics with positive margin trajectory.",
      });

      const aaCriteria = [
        { evaluationId: aaEval.id, criterionKey: "mission_alignment", criterionLabel: "Mission Alignment", score: 9.0, weight: 0.15, justification: "Directly serves Joe's vision of unlocking potential for EVERY kid through broad-access online education at varying price points.", evidence: "Strong enrollment growth across diverse demographics" },
        { evaluationId: aaEval.id, criterionKey: "academic_excellence", criterionLabel: "Academic & Life Skills", score: 9.5, weight: 0.15, justification: "5.3x learning multiplier significantly exceeds the >2x threshold. Outstanding standardized test results.", evidence: "MAP results: 5.3x learning pace" },
        { evaluationId: aaEval.id, criterionKey: "product_pricing", criterionLabel: "Product & Pricing Design", score: 7.5, weight: 0.15, justification: "Pricing exists but doesn't yet span the full $150K to $1K range Joe envisions. Product quality is strong.", evidence: "Current pricing structure under review" },
        { evaluationId: aaEval.id, criterionKey: "gtm_community", criterionLabel: "GTM & Community", score: 8.0, weight: 0.10, justification: "Direct-to-parent marketing strategy aligns with Joe's mandate. Community building in progress.", evidence: "Marketing threshold met via MAP results" },
        { evaluationId: aaEval.id, criterionKey: "ai_scalability", criterionLabel: "AI & Scalability", score: 7.0, weight: 0.15, justification: "AI-powered learning platform enables quality at scale. Flywheel dynamics emerging but not fully proven.", evidence: "AI tutoring system operational" },
        { evaluationId: aaEval.id, criterionKey: "financial_model", criterionLabel: "Financial Model", score: 8.5, weight: 0.15, justification: "Strong unit economics. Positive margin in both base and accelerated scenarios. High ROIC potential.", evidence: "Asset-light model with positive margins" },
        { evaluationId: aaEval.id, criterionKey: "talent_strategy", criterionLabel: "Talent Strategy", score: 7.5, weight: 0.05, justification: "Guide quality is high. Scaling requires clear recruitment pipeline.", evidence: "Current guide-to-student ratio adequate" },
        { evaluationId: aaEval.id, criterionKey: "access_funding", criterionLabel: "Access & Funding Pathway", score: 8.0, weight: 0.10, justification: "Lower-price tiers provide sampling. Government funding pathway via ESA/voucher integration.", evidence: "EduPaid platform handles ESA collections" },
      ];
      aaCriteria.forEach((c) => storage.createRubricCriteria(c));
    }

    if (strataBu) {
      const tsaEval = storage.createEvaluationReport({
        businessUnitId: strataBu.id,
        createdAt: new Date().toISOString(),
        recommendation: "APPROVE_WITH_FIX",
        overallScore: 6.8,
        confidenceScore: 72,
        executiveSummary: "Strata has strong enrollment momentum and a compelling microschool/sports-education model. However, the financial model needs to tie out to sensitivity analysis. Marketing spend exceeded plan in Q1. Recommend approval contingent on budget realignment and model reconciliation.",
        keyFindings: JSON.stringify([
          "Strong enrollment demand signal",
          "Projecting solid student growth across segments",
          "Revenue target with EBITDA-positive trajectory",
          "Q1 marketing overspend linked to voucher program launch",
          "Financial model must reconcile with approved sensitivity analysis"
        ]),
        criticalIssues: JSON.stringify([
          "Model tie-out incomplete — financial projections not yet validated against agreed assumptions",
          "Q1 overspend vs plan — primarily marketing",
          "Multiple pricing tiers create complexity in financial modeling"
        ]),
        rubricScores: JSON.stringify({
          mission_alignment: 7.5,
          academic_excellence: 6.0,
          product_pricing: 7.0,
          gtm_community: 7.5,
          ai_scalability: 5.5,
          financial_model: 6.5,
          talent_strategy: 7.0,
          access_funding: 7.5
        }),
        financialSummary: "Exemplary brainlift rating (85/100). EBITDA-positive trajectory. Budget reconciliation required.",
      });
    }

    if (physicalBu) {
      const preqEval = storage.createEvaluationReport({
        businessUnitId: physicalBu.id,
        createdAt: new Date().toISOString(),
        recommendation: "REJECT",
        overallScore: 2.8,
        confidenceScore: 90,
        executiveSummary: "Physical Private Schools has a Critically Flawed brainlift rating (30/100). The business model needs fundamental restructuring. Finance recommends a complete review before additional investment.",
        keyFindings: JSON.stringify([
          "Critically Flawed brainlift rating — lowest in the portfolio",
          "Score of 30/100 indicates fundamental issues",
          "P&L spreadsheet available for detailed financial review",
          "Business plan structure needs significant improvement"
        ]),
        criticalIssues: JSON.stringify([
          "Critically Flawed brainlift assessment — fundamental business model concerns",
          "No clear path to profitability under current structure",
          "Violates Joe's 'High ROIC' and 'asset-light' principles"
        ]),
        rubricScores: JSON.stringify({
          mission_alignment: 4.0,
          academic_excellence: 3.0,
          product_pricing: 2.0,
          gtm_community: 1.5,
          ai_scalability: 3.5,
          financial_model: 1.0,
          talent_strategy: 3.0,
          access_funding: 2.0
        }),
        financialSummary: "Critically Flawed (30/100). Fundamental restructuring needed before investment.",
      });
    }

    res.json({ message: "Seeded", units: created.length, documents: docsCreated, evaluations: 3 });
  });
}
