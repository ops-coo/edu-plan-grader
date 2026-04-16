import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { BusinessUnit, BudgetDocument } from "@shared/schema";

const RUBRIC = {
  categories: [
    {
      key: "mission_alignment",
      label: "Mission Alignment",
      weight: 0.15,
      criteria: [
        { id: "MA-1", question: "Does the plan unlock potential for EVERY kid — not just a select few?" },
        { id: "MA-2", question: "Will kids love this school / experience? Is joy and engagement central?" },
        { id: "MA-3", question: "Does it embody High Standards / High Support — rigorous academics with strong pastoral care?" },
      ],
    },
    {
      key: "academic_excellence",
      label: "Academic & Life Skills",
      weight: 0.15,
      criteria: [
        { id: "AE-1", question: "Does the plan target >2x learning pace (measured via MAP or equivalent standardized testing)?" },
        { id: "AE-2", question: "Are there 3rd-party benchmarks for life skills development (creativity, leadership, resilience)?" },
        { id: "AE-3", question: "Does the plan benchmark against the best schools globally, not just local averages?" },
      ],
    },
    {
      key: "product_pricing",
      label: "Product & Pricing Design",
      weight: 0.15,
      criteria: [
        { id: "PP-1", question: "Is there a product range spanning $150K/yr (premium) down to $1K/yr (broad access)?" },
        { id: "PP-2", question: "Are lower-price tiers used as sampling / funnel for higher-value offerings?" },
        { id: "PP-3", question: "Is the product quality genuinely world-class at each price point?" },
      ],
    },
    {
      key: "gtm_community",
      label: "GTM & Community",
      weight: 0.10,
      criteria: [
        { id: "GC-1", question: "Is the go-to-market strategy direct-to-parent (not reliant on school district sales)?" },
        { id: "GC-2", question: "Is there a community flywheel — parents referring parents, student word-of-mouth?" },
        { id: "GC-3", question: "Does the marketing spend threshold tie to proven academic results (e.g., MAP scores)?" },
      ],
    },
    {
      key: "ai_scalability",
      label: "AI & Scalability",
      weight: 0.15,
      criteria: [
        { id: "AS-1", question: "Are there AI-powered feedback loops that maintain quality as enrollment scales?" },
        { id: "AS-2", question: "Does the model have flywheel / network effects (more students = better product)?" },
        { id: "AS-3", question: "Can the platform reach 100K+ students without proportional cost increase?" },
      ],
    },
    {
      key: "financial_model",
      label: "Financial Model",
      weight: 0.15,
      criteria: [
        { id: "FM-1", question: "Does the plan demonstrate high ROIC (return on invested capital)?" },
        { id: "FM-2", question: "Is there best-in-class customer retention (>90% annual)?" },
        { id: "FM-3", question: "Is the model asset-light (minimal capital expenditure per student)?" },
      ],
    },
    {
      key: "talent_strategy",
      label: "Talent Strategy",
      weight: 0.05,
      criteria: [
        { id: "TS-1", question: "Is there a scalable talent pipeline for guides/teachers at target student volumes?" },
        { id: "TS-2", question: "Does the compensation model attract top educators while maintaining unit economics?" },
        { id: "TS-3", question: "Is there an AI-augmented coaching model that amplifies human talent?" },
      ],
    },
    {
      key: "access_funding",
      label: "Access & Funding Pathway",
      weight: 0.10,
      criteria: [
        { id: "AF-1", question: "Does the plan leverage government funding (ESA, vouchers, charter grants) for broad access?" },
        { id: "AF-2", question: "Is there a clear path from premium pricing to subsidized/free access for underserved families?" },
        { id: "AF-3", question: "Does the plan address regulatory requirements for funding eligibility?" },
      ],
    },
  ],
  thresholds: {
    APPROVE: { min_score: 7.0, no_category_below: 5.0 },
    APPROVE_WITH_FIX: { min_score: 5.0, max_critical_issues: 3 },
    REJECT: { below_score: 5.0 },
  },
};

/**
 * Extract a Google Doc ID from various URL formats
 */
function extractDocId(url: string): string | null {
  // Handle wrapped Google URLs
  const unwrapped = url.includes("url?q=")
    ? decodeURIComponent(url.split("url?q=")[1]?.split("&")[0] || "")
    : url;

  const match = unwrapped.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch plain-text content from a Google Doc
 */
async function fetchDocContent(url: string): Promise<string | null> {
  const docId = extractDocId(url);
  if (!docId) return null;

  try {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const res = await fetch(exportUrl, { redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    // Trim to reasonable size for LLM context (first 15k chars)
    return text.slice(0, 15000);
  } catch {
    return null;
  }
}

/**
 * Build the evaluation prompt for Claude
 */
function buildEvalPrompt(buName: string, docContents: { title: string; content: string }[]): string {
  const rubricText = RUBRIC.categories
    .map(
      (cat) =>
        `### ${cat.label} (Weight: ${(cat.weight * 100).toFixed(0)}%)\n` +
        cat.criteria.map((c) => `- ${c.id}: ${c.question}`).join("\n")
    )
    .join("\n\n");

  const docsText = docContents
    .map((d) => `--- ${d.title} ---\n${d.content}`)
    .join("\n\n");

  return `You are an expert education business analyst evaluating business plans for 2Hr Learning / Alpha Holdings education portfolio.

## Business Unit: ${buName}

## Joe's Education Rubric (24 criteria across 8 categories)

${rubricText}

## Scoring Rules
- Score each CATEGORY 0-10 based on how well the business plan addresses its criteria
- Weighted average of category scores = overall score
- APPROVE: overall >= 7.0 AND no category below 5.0
- APPROVE_WITH_FIX: overall >= 5.0, max 3 critical issues
- REJECT: overall < 5.0

## Business Plan Documents

${docsText}

## Required Output (JSON)

Return ONLY a valid JSON object with this exact structure:
{
  "recommendation": "APPROVE" | "APPROVE_WITH_FIX" | "REJECT",
  "overall_score": <number 0-10>,
  "confidence_score": <number 0-100>,
  "executive_summary": "<2-3 sentence assessment>",
  "key_findings": ["<positive signal 1>", "<positive signal 2>", ...],
  "critical_issues": ["<blocking concern 1>", ...],
  "financial_summary": "<revenue, margin, ROIC summary or 'Insufficient financial data'>",
  "category_scores": {
    "mission_alignment": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "academic_excellence": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "product_pricing": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "gtm_community": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "ai_scalability": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "financial_model": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "talent_strategy": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "access_funding": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" }
  }
}

Be rigorous. If the plan doesn't address a criterion, score it low with justification. Base scores on EVIDENCE in the documents, not assumptions. If a document is short or vague, reflect that uncertainty in lower confidence and scores.`;
}

/**
 * Run evaluation for a single business unit
 */
export async function evaluateBusinessUnit(buId: number): Promise<{
  success: boolean;
  evaluationId?: number;
  error?: string;
  recommendation?: string;
  overallScore?: number;
}> {
  // 1. Get BU data
  const bu = await storage.getBusinessUnit(buId);
  if (!bu) return { success: false, error: "Business unit not found" };

  // 2. Get linked documents
  const docs = await storage.getBudgetDocuments(buId);
  const businessPlanDocs = docs.filter((d) => d.documentType === "business_plan");

  if (businessPlanDocs.length === 0) {
    // Try using the BU's budgetDocUrl as fallback
    if (bu.budgetDocUrl) {
      businessPlanDocs.push({
        id: 0,
        businessUnitId: buId,
        documentType: "business_plan",
        url: bu.budgetDocUrl,
        quarter: null,
        title: "Budget Plan Doc",
        createdAt: null,
      } as BudgetDocument);
    } else {
      return { success: false, error: "No business plan documents found for this BU" };
    }
  }

  // 3. Fetch document content
  const docContents: { title: string; content: string }[] = [];
  for (const doc of businessPlanDocs) {
    const content = await fetchDocContent(doc.url);
    if (content && content.trim().length > 100) {
      docContents.push({
        title: doc.title || `Business Plan (${doc.quarter || "latest"})`,
        content,
      });
    }
  }

  // Also fetch P&L spreadsheet info if available
  const pnlDocs = docs.filter((d) => d.documentType === "pnl_spreadsheet");
  // We can't easily read Sheets, but note their existence
  const hasPnl = pnlDocs.length > 0 || !!bu.budgetPnlUrl;

  if (docContents.length === 0) {
    return { success: false, error: "Could not fetch content from any business plan documents" };
  }

  // 4. Call Claude for evaluation
  let anthropic: Anthropic;
  try {
    anthropic = new Anthropic();
  } catch (err) {
    return { success: false, error: "Anthropic SDK initialization failed. Ensure LLM API credentials are available." };
  }

  const prompt = buildEvalPrompt(bu.name, docContents);

  let llmResponse: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude_sonnet_4_6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    llmResponse = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } catch (err: any) {
    return { success: false, error: `LLM call failed: ${err.message}` };
  }

  // 5. Parse the JSON response
  let evalResult: any;
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in LLM response");
    evalResult = JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    return { success: false, error: `Failed to parse LLM response: ${err.message}` };
  }

  // 6. Build rubric scores JSON
  const rubricScores: Record<string, number> = {};
  for (const [key, val] of Object.entries(evalResult.category_scores || {})) {
    rubricScores[key] = (val as any).score || 0;
  }

  // 7. Store evaluation report
  const report = await storage.createEvaluationReport({
    businessUnitId: buId,
    createdAt: new Date().toISOString(),
    recommendation: evalResult.recommendation || "REJECT",
    overallScore: evalResult.overall_score || 0,
    confidenceScore: evalResult.confidence_score || 50,
    executiveSummary: evalResult.executive_summary || "Evaluation completed.",
    keyFindings: JSON.stringify(evalResult.key_findings || []),
    criticalIssues: JSON.stringify(evalResult.critical_issues || []),
    rubricScores: JSON.stringify(rubricScores),
    financialSummary: evalResult.financial_summary || null,
  });

  // 8. Store individual rubric criteria
  const weights: Record<string, number> = {
    mission_alignment: 0.15,
    academic_excellence: 0.15,
    product_pricing: 0.15,
    gtm_community: 0.10,
    ai_scalability: 0.15,
    financial_model: 0.15,
    talent_strategy: 0.05,
    access_funding: 0.10,
  };

  const rubricLabels: Record<string, string> = {
    mission_alignment: "Mission Alignment",
    academic_excellence: "Academic & Life Skills",
    product_pricing: "Product & Pricing Design",
    gtm_community: "GTM & Community",
    ai_scalability: "AI & Scalability",
    financial_model: "Financial Model",
    talent_strategy: "Talent Strategy",
    access_funding: "Access & Funding Pathway",
  };

  for (const [key, val] of Object.entries(evalResult.category_scores || {})) {
    const v = val as any;
    await storage.createRubricCriteria({
      evaluationId: report.id,
      criterionKey: key,
      criterionLabel: rubricLabels[key] || key,
      score: v.score || 0,
      weight: weights[key] || 0.1,
      justification: v.justification || "",
      evidence: v.evidence || null,
    });
  }

  // 9. Update the BU status
  await storage.updateBusinessUnit(buId, {
    status: evalResult.recommendation === "APPROVE"
      ? "approved"
      : evalResult.recommendation === "REJECT"
        ? "rejected"
        : "fix_required",
    updatedAt: new Date().toISOString(),
  });

  return {
    success: true,
    evaluationId: report.id,
    recommendation: report.recommendation,
    overallScore: report.overallScore,
  };
}

/**
 * Evaluate a BU using pre-assembled context (for BUs without formal business plan docs).
 * Context is assembled from P&L data, Workflowy brainlifts, and other sources.
 */
export async function evaluateWithContext(
  buId: number,
  contextSections: { title: string; content: string }[],
  dataSources: string[]
): Promise<{
  success: boolean;
  evaluationId?: number;
  error?: string;
  recommendation?: string;
  overallScore?: number;
}> {
  const bu = await storage.getBusinessUnit(buId);
  if (!bu) return { success: false, error: "Business unit not found" };

  if (contextSections.length === 0) {
    return { success: false, error: "No context provided for evaluation" };
  }

  // Build a modified prompt noting this is a synthesized evaluation
  const prompt = buildSynthesizedPrompt(bu.name, contextSections, dataSources);

  let anthropic: Anthropic;
  try {
    anthropic = new Anthropic();
  } catch (err) {
    return { success: false, error: "Anthropic SDK initialization failed." };
  }

  let llmResponse: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude_sonnet_4_6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    llmResponse = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } catch (err: any) {
    return { success: false, error: `LLM call failed: ${err.message}` };
  }

  let evalResult: any;
  try {
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in LLM response");
    evalResult = JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    return { success: false, error: `Failed to parse LLM response: ${err.message}` };
  }

  // Store results (same as standard evaluation)
  const rubricScores: Record<string, number> = {};
  for (const [key, val] of Object.entries(evalResult.category_scores || {})) {
    rubricScores[key] = (val as any).score || 0;
  }

  const report = await storage.createEvaluationReport({
    businessUnitId: buId,
    createdAt: new Date().toISOString(),
    recommendation: evalResult.recommendation || "REJECT",
    overallScore: evalResult.overall_score || 0,
    confidenceScore: evalResult.confidence_score || 50,
    executiveSummary: `[Synthesized from: ${dataSources.join(", ")}] ` + (evalResult.executive_summary || "Evaluation completed."),
    keyFindings: JSON.stringify(evalResult.key_findings || []),
    criticalIssues: JSON.stringify(evalResult.critical_issues || []),
    rubricScores: JSON.stringify(rubricScores),
    financialSummary: evalResult.financial_summary || null,
  });

  const weights: Record<string, number> = {
    mission_alignment: 0.15, academic_excellence: 0.15, product_pricing: 0.15,
    gtm_community: 0.10, ai_scalability: 0.15, financial_model: 0.15,
    talent_strategy: 0.05, access_funding: 0.10,
  };
  const rubricLabels: Record<string, string> = {
    mission_alignment: "Mission Alignment", academic_excellence: "Academic & Life Skills",
    product_pricing: "Product & Pricing Design", gtm_community: "GTM & Community",
    ai_scalability: "AI & Scalability", financial_model: "Financial Model",
    talent_strategy: "Talent Strategy", access_funding: "Access & Funding Pathway",
  };

  for (const [key, val] of Object.entries(evalResult.category_scores || {})) {
    const v = val as any;
    await storage.createRubricCriteria({
      evaluationId: report.id,
      criterionKey: key,
      criterionLabel: rubricLabels[key] || key,
      score: v.score || 0,
      weight: weights[key] || 0.1,
      justification: v.justification || "",
      evidence: v.evidence || null,
    });
  }

  await storage.updateBusinessUnit(buId, {
    status: evalResult.recommendation === "APPROVE"
      ? "approved"
      : evalResult.recommendation === "REJECT"
        ? "rejected"
        : "fix_required",
    updatedAt: new Date().toISOString(),
  });

  return {
    success: true,
    evaluationId: report.id,
    recommendation: report.recommendation,
    overallScore: report.overallScore,
  };
}

/**
 * Build evaluation prompt for synthesized context (no formal plan doc)
 */
function buildSynthesizedPrompt(
  buName: string,
  contextSections: { title: string; content: string }[],
  dataSources: string[]
): string {
  const rubricText = RUBRIC.categories
    .map(
      (cat) =>
        `### ${cat.label} (Weight: ${(cat.weight * 100).toFixed(0)}%)\n` +
        cat.criteria.map((c) => `- ${c.id}: ${c.question}`).join("\n")
    )
    .join("\n\n");

  const contextText = contextSections
    .map((s) => `--- ${s.title} ---\n${s.content}`)
    .join("\n\n");

  return `You are an expert education business analyst evaluating business units for 2Hr Learning / Alpha Holdings education portfolio.

## Business Unit: ${buName}

## IMPORTANT: This is a SYNTHESIZED evaluation
This business unit does NOT have a formal business plan document. Instead, you are evaluating based on available data from: ${dataSources.join(", ")}.

Because no formal plan was submitted:
- Adjust your CONFIDENCE SCORE downward (typically 30-60% depending on data richness)
- Flag "No formal business plan document submitted" as a critical issue
- Score categories where you have evidence; for categories with NO relevant data, score them 3/10 with justification "Insufficient data — no formal plan addresses this criterion"
- Be explicit about what data you ARE basing each score on

## Joe's Education Rubric (24 criteria across 8 categories)

${rubricText}

## Scoring Rules
- Score each CATEGORY 0-10 based on how well the available data addresses its criteria
- Weighted average of category scores = overall score
- APPROVE: overall >= 7.0 AND no category below 5.0
- APPROVE_WITH_FIX: overall >= 5.0, max 3 critical issues
- REJECT: overall < 5.0

## Available Data

${contextText}

## Required Output (JSON)

Return ONLY a valid JSON object with this exact structure:
{
  "recommendation": "APPROVE" | "APPROVE_WITH_FIX" | "REJECT",
  "overall_score": <number 0-10>,
  "confidence_score": <number 0-100>,
  "executive_summary": "<2-3 sentence assessment noting this is based on synthesized data>",
  "key_findings": ["<positive signal 1>", "<positive signal 2>", ...],
  "critical_issues": ["No formal business plan document submitted", "<other issue>", ...],
  "financial_summary": "<revenue, margin, ROIC summary from P&L data, or 'Insufficient financial data'>",
  "category_scores": {
    "mission_alignment": { "score": <0-10>, "justification": "<why>", "evidence": "<specific data cited>" },
    "academic_excellence": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "product_pricing": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "gtm_community": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "ai_scalability": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "financial_model": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "talent_strategy": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" },
    "access_funding": { "score": <0-10>, "justification": "<why>", "evidence": "<data>" }
  }
}

Be rigorous. Base scores on EVIDENCE in the provided data. Do not assume or infer what a formal plan might say.`;
}
