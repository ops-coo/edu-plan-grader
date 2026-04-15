import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";

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

  // Evaluation Reports
  app.get("/api/evaluations", (req, res) => {
    const buId = req.query.businessUnitId ? parseInt(req.query.businessUnitId as string) : undefined;
    const reports = storage.getEvaluationReports(buId);
    res.json(reports);
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

  // Dashboard summary endpoint
  app.get("/api/dashboard-summary", (_req, res) => {
    const units = storage.getBusinessUnits();
    const evaluations = storage.getEvaluationReports();

    const approved = units.filter((u) => u.status === "approved").length;
    const rejected = units.filter((u) => u.status === "rejected").length;
    const fixRequired = units.filter((u) => u.status === "fix_required").length;
    const pending = units.filter((u) => u.status === "pending").length;
    const evaluating = units.filter((u) => u.status === "evaluating").length;

    const totalBudget = units.reduce((sum, u) => sum + (u.q2Budget || 0), 0);
    const totalRevenue = units.reduce((sum, u) => sum + (u.annualizedRevenue || 0), 0);
    const totalEnrollment = units.reduce((sum, u) => sum + (u.enrollmentCurrent || 0), 0);

    const avgScore = evaluations.length > 0
      ? evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length
      : 0;

    res.json({
      totalUnits: units.length,
      approved,
      rejected,
      fixRequired,
      pending,
      evaluating,
      totalBudget,
      totalRevenue,
      totalEnrollment,
      avgScore,
      evaluationsCompleted: evaluations.length,
    });
  });

  // Seed data endpoint
  app.post("/api/seed", (_req, res) => {
    const existingUnits = storage.getBusinessUnits();
    if (existingUnits.length > 0) {
      return res.json({ message: "Already seeded", count: existingUnits.length });
    }

    const units = [
      {
        name: "Alpha Physical Schools",
        category: "physical_schools",
        budgetModelUrl: "https://docs.google.com/spreadsheets/d/193PywBv5BC6P4nS9munhFbJXf2jtv3IjBDvT0X9-guM/",
        q1Actual: 11.8,
        q2Budget: 10.1,
        syTotal: 48.0,
        ltdTotal: 127.8,
        annualizedRevenue: 88.0,
        enrollmentCurrent: 435,
        enrollmentTarget: 1755,
        learningMultiplier: null,
        status: "pending",
      },
      {
        name: "Alpha Anywhere",
        category: "virtual",
        budgetPlanUrl: "https://docs.google.com/document/d/1wy6FFfOUf9tuJ6dJvRdroOwMQX8JfHVJ5x7U4YqmMKE/",
        budgetModelUrl: "https://docs.google.com/spreadsheets/d/1XVY-ryWHaC31kzOHAFMav776n2Ta_RT5t_YaaZfWMWc/",
        q1Actual: 0.0,
        q2Budget: 0.0,
        syTotal: 1.8,
        ltdTotal: 1.9,
        annualizedRevenue: 8.3,
        enrollmentCurrent: 550,
        enrollmentTarget: 2250,
        learningMultiplier: 5.3,
        status: "approved",
      },
      {
        name: "TSA Virtual",
        category: "sports",
        budgetPlanUrl: "https://docs.google.com/document/d/1GV9lPpdMX5ItIDeYc6-57db0_mEYAijLRCNyESyQ2Qo/",
        budgetModelUrl: "https://docs.google.com/spreadsheets/d/1s_cyVE2RK0VGXTtFSFQ_nAJAk2Nh6f8mjfUlHb0NpD0/",
        q1Actual: 5.3,
        q2Budget: 6.5,
        syTotal: 13.5,
        ltdTotal: 13.5,
        annualizedRevenue: 18.8,
        enrollmentCurrent: 1525,
        enrollmentTarget: 2596,
        learningMultiplier: null,
        status: "fix_required",
      },
      {
        name: "TSA Physical",
        category: "sports",
        q1Actual: 1.4,
        q2Budget: 1.1,
        syTotal: 3.0,
        ltdTotal: 3.0,
        annualizedRevenue: 3.2,
        enrollmentCurrent: 280,
        enrollmentTarget: 500,
        status: "pending",
      },
      {
        name: "Strata / TSA Microschools",
        category: "sports",
        q2Budget: 0.8,
        annualizedRevenue: 1.2,
        enrollmentCurrent: 125,
        enrollmentTarget: 350,
        status: "pending",
      },
      {
        name: "GT Anywhere",
        category: "virtual",
        q1Actual: 1.8,
        q2Budget: 3.6,
        annualizedRevenue: 3.2,
        enrollmentCurrent: 64,
        enrollmentTarget: 460,
        learningMultiplier: 4.3,
        status: "pending",
      },
      {
        name: "Virtual Charter - Unbound",
        category: "virtual",
        budgetPlanUrl: "https://docs.google.com/document/d/1rxQ17Mulb4f8YCy9s0kDwtSL3WcGfqHW/",
        annualizedRevenue: 4.0,
        enrollmentCurrent: 211,
        enrollmentTarget: 400,
        status: "pending",
      },
      {
        name: "Virtual Charter - Novatio",
        category: "virtual",
        annualizedRevenue: 3.1,
        enrollmentCurrent: 114,
        enrollmentTarget: 400,
        status: "pending",
      },
      {
        name: "Prequel (EdTech Platform)",
        category: "other",
        ltdTotal: 3.7,
        enrollmentCurrent: 32,
        status: "rejected",
      },
      {
        name: "Timeback / Tech Stack",
        category: "tech",
        q1Actual: 16.8,
        q2Budget: 23.8,
        annualizedRevenue: 22.0,
        status: "evaluating",
      },
      {
        name: "Branding & Evangelism",
        category: "marketing",
        q1Actual: 11.1,
        q2Budget: 7.2,
        status: "pending",
      },
    ];

    const created = units.map((u) => storage.createBusinessUnit(u as any));

    // Create sample evaluations for some BUs
    const aaEval = storage.createEvaluationReport({
      businessUnitId: 2,
      createdAt: new Date().toISOString(),
      recommendation: "APPROVE",
      overallScore: 8.2,
      confidenceScore: 85,
      executiveSummary: "Alpha Anywhere demonstrates strong alignment with Joe's education vision. 5.3x learning multiplier exceeds the >2x threshold for marketing spend. Direct-to-parent GTM is validated. Unit economics are positive with clear path to scale. Recommend approval with marketing acceleration.",
      keyFindings: JSON.stringify([
        "5.3x learning multiplier — strongest academic results in the portfolio",
        "550 students enrolled, on track for 650 by June 2026",
        "Accelerated plan projects 10,000 students by Q2'27 at $125M annualized revenue",
        "26% margin in base case, 32% margin in accelerated case",
        "Direct-to-parent GTM aligns with Joe's core values"
      ]),
      criticalIssues: JSON.stringify([
        "Marketing spend decision ($12M over 4 quarters) requires high confidence in CAC payback",
        "Scaling from 550 to 10,000 students in 12 months is aggressive — need capacity plan"
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
      financialSummary: "Annualized revenue: $8.3M. Base case SY26/27: $11.7M at 26% margin. Accelerated: $125M at 32% margin.",
    });

    // Rubric criteria for AA
    const aaCriteria = [
      { evaluationId: aaEval.id, criterionKey: "mission_alignment", criterionLabel: "Mission Alignment", score: 9.0, weight: 0.15, justification: "Alpha Anywhere directly serves Joe's vision of unlocking potential for EVERY kid through broad-access online education at varying price points.", evidence: "550 enrolled students across diverse demographics" },
      { evaluationId: aaEval.id, criterionKey: "academic_excellence", criterionLabel: "Academic & Life Skills", score: 9.5, weight: 0.15, justification: "5.3x learning multiplier significantly exceeds the >2x threshold. Outstanding standardized test results.", evidence: "January 2026 MAP results: 5.3x learning pace" },
      { evaluationId: aaEval.id, criterionKey: "product_pricing", criterionLabel: "Product & Pricing Design", score: 7.5, weight: 0.15, justification: "Pricing exists but doesn't yet span the full $150K→$1K range Joe envisions. Product quality is strong.", evidence: "Current pricing structure under review" },
      { evaluationId: aaEval.id, criterionKey: "gtm_community", criterionLabel: "GTM & Community", score: 8.0, weight: 0.10, justification: "Direct-to-parent marketing strategy aligns with Joe's mandate. Community building in progress.", evidence: "Marketing threshold met via MAP results" },
      { evaluationId: aaEval.id, criterionKey: "ai_scalability", criterionLabel: "AI & Scalability", score: 7.0, weight: 0.15, justification: "AI-powered learning platform enables quality at scale. Flywheel dynamics emerging but not fully proven.", evidence: "AI tutoring system operational" },
      { evaluationId: aaEval.id, criterionKey: "financial_model", criterionLabel: "Financial Model", score: 8.5, weight: 0.15, justification: "Strong unit economics. Positive margin in both base and accelerated scenarios. High ROIC potential.", evidence: "26% base margin, 32% accelerated. Asset-light model." },
      { evaluationId: aaEval.id, criterionKey: "talent_strategy", criterionLabel: "Talent Strategy", score: 7.5, weight: 0.05, justification: "Guide quality is high. Scaling talent to 10,000 students requires clear recruitment pipeline.", evidence: "Current guide-to-student ratio adequate" },
      { evaluationId: aaEval.id, criterionKey: "access_funding", criterionLabel: "Access & Funding Pathway", score: 8.0, weight: 0.10, justification: "Lower-price tiers provide sampling. Government funding pathway via ESA/voucher integration.", evidence: "EduPaid platform handles ESA collections" },
    ];
    aaCriteria.forEach((c) => storage.createRubricCriteria(c));

    // TSA Virtual eval — APPROVE WITH FIX
    const tsaEval = storage.createEvaluationReport({
      businessUnitId: 3,
      createdAt: new Date().toISOString(),
      recommendation: "APPROVE_WITH_FIX",
      overallScore: 6.8,
      confidenceScore: 72,
      executiveSummary: "TSA Virtual has strong enrollment momentum (1,525 TEFA) and a compelling sports-education model. However, the financial model needs to tie out to Jack's sensitivity analysis. Marketing spend on TEFA voucher program exceeded plan by $1.9M in Q1. Recommend approval contingent on budget realignment and Jack's model reconciliation.",
      keyFindings: JSON.stringify([
        "1,525 TEFA enrollments expected post-lottery — strong demand signal",
        "Projecting 2,596 total students by Q4 across segments",
        "$18.8M FY26 revenue target with EBITDA-positive Q4 2026",
        "Q1 marketing overspend of $1.9M linked to TEFA voucher program launch",
        "Financial model must reconcile with Jack's approved sensitivity analysis"
      ]),
      criticalIssues: JSON.stringify([
        "Jack's model tie-out incomplete — financial projections not yet validated against agreed assumptions",
        "Q1 overspend of $2.3M vs plan — primarily marketing ($1.9M)",
        "Multiple pricing tiers ($20K/$25K/$35K) create complexity in financial modeling"
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
      financialSummary: "FY26 revenue: $18.8M. EBITDA-positive Q4 2026 ($3.6M). Q1 overspend: $2.3M. Must tie to Jack's model.",
    });

    // Prequel eval — REJECT
    const preqEval = storage.createEvaluationReport({
      businessUnitId: 9,
      createdAt: new Date().toISOString(),
      recommendation: "REJECT",
      overallScore: 2.8,
      confidenceScore: 90,
      executiveSummary: "Prequel has consumed $3.7M over 2 years with minimal traction (32 students). External customer scaling has failed. Finance recommends shutting down go-to-market and reallocating resources to successful virtual programs (GT, TSA, Unbound, Novatio).",
      keyFindings: JSON.stringify([
        "$3.7M invested with only 32 students enrolled — extremely poor unit economics",
        "2 years of attempted scaling with external customers has failed",
        "No clear path to profitability or meaningful enrollment growth",
        "Resources would be better allocated to programs that are working"
      ]),
      criticalIssues: JSON.stringify([
        "Catastrophic CAC — $115K+ per student acquired",
        "No product-market fit after 2 years of investment",
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
      financialSummary: "LTD investment: $3.7M. 32 students. ~$115K CAC per student. No path to profitability.",
    });

    res.json({ message: "Seeded", units: created.length, evaluations: 3 });
  });
}
