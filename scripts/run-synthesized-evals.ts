/**
 * Runner script for synthesized evaluations.
 * 
 * For each BU that has no existing evaluation, assembles context from:
 * 1. Brainlift text files (local workspace)
 * 2. P&L spreadsheet data (pre-fetched to local files)
 * 
 * Then POSTs to /api/evaluate-synthesized/:id
 * 
 * Usage: npx tsx scripts/run-synthesized-evals.ts [--base-url=http://localhost:5000] [--bu-ids=2,3,5]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.argv.find(a => a.startsWith("--base-url="))?.split("=")[1] || "http://localhost:5000";
const BU_IDS_ARG = process.argv.find(a => a.startsWith("--bu-ids="))?.split("=")[1];
const TARGET_IDS = BU_IDS_ARG ? BU_IDS_ARG.split(",").map(Number) : null;

// Brainlift file → BU ID mapping
const BRAINLIFT_MAP: Record<number, string> = {
  2: "2hr_evangelism_edu_media.txt",
  12: "alpha_university.txt",
  6: "alpha_ai_engineer.txt",
  10: "marriott_education.txt",
  1: "physical_private_schools.txt",
  8: "public_school_sw_sales.txt",
  11: "strata.txt",
  4: "the_alpha_fund.txt",
  5: "virtual_charter_schools.txt",
};

// P&L data file → BU ID mapping
const PNL_MAP: Record<number, string> = {
  3: "core_education.txt",
  7: "homeschool_dtc_apps.txt",
  15: "learnwithai.txt",
  16: "academics.txt",
  17: "2hr_learning.txt",
  18: "edupaid.txt",
  19: "ephor.txt",
  20: "tech_super_builders.txt",
  23: "gt_camps.txt",
  24: "alpha_camps.txt",
};

const BRAINLIFTS_DIR = path.resolve(__dirname, "../../brainlifts");
const PNL_DIR = path.resolve(__dirname, "../../pnl_data");

interface BU {
  id: number;
  name: string;
  status: string;
  budgetPnlUrl: string | null;
  budgetDocUrl: string | null;
}

async function fetchJSON(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

function readBrainlift(buId: number): string | null {
  const file = BRAINLIFT_MAP[buId];
  if (!file) return null;
  const filePath = path.join(BRAINLIFTS_DIR, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.trim().length > 50 ? content : null;
  }
  return null;
}

function readPnlData(buId: number): string | null {
  const file = PNL_MAP[buId];
  if (!file) return null;
  const filePath = path.join(PNL_DIR, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.trim().length > 50 ? content : null;
  }
  return null;
}

async function getExistingEvaluations(): Promise<Set<number>> {
  const evals = await fetchJSON(`${BASE_URL}/api/evaluations`);
  return new Set(evals.map((e: any) => e.businessUnitId));
}

async function runEvaluation(bu: BU): Promise<{ success: boolean; recommendation?: string; score?: number }> {
  console.log(`\n>>> Evaluating: ${bu.name} (ID ${bu.id})`);

  const contextSections: { title: string; content: string }[] = [];
  const dataSources: string[] = [];

  // 1. Add brainlift content if available
  const brainlift = readBrainlift(bu.id);
  if (brainlift) {
    contextSections.push({
      title: `Workflowy Brainlift — ${bu.name}`,
      content: brainlift.slice(0, 12000),
    });
    dataSources.push("Workflowy Brainlift");
    console.log(`  ✓ Brainlift loaded (${brainlift.length} chars)`);
  }

  // 2. Add P&L data if available  
  const pnlData = readPnlData(bu.id);
  if (pnlData) {
    contextSections.push({
      title: `P&L Financial Data — ${bu.name}`,
      content: pnlData.slice(0, 10000),
    });
    dataSources.push("P&L Spreadsheet");
    console.log(`  ✓ P&L data loaded (${pnlData.length} chars)`);
  } else if (bu.budgetPnlUrl) {
    // Reference the P&L sheet even if we don't have the data locally
    contextSections.push({
      title: `P&L Budget Spreadsheet Reference`,
      content: `P&L spreadsheet exists at: ${bu.budgetPnlUrl}\nFinancial data was not pre-fetched. Score financial metrics with lower confidence.`,
    });
    dataSources.push("P&L Spreadsheet");
    console.log(`  ~ P&L reference added (no local data)`);
  }

  // 3. Add budget doc reference if exists
  if (bu.budgetDocUrl) {
    contextSections.push({
      title: `Budget Plan Document Reference`,
      content: `Business plan document available at: ${bu.budgetDocUrl}`,
    });
    dataSources.push("Budget Documents");
    console.log(`  ✓ Budget doc reference added`);
  }

  if (contextSections.length === 0) {
    console.log(`  ✗ SKIPPED — no context available`);
    return { success: false };
  }

  console.log(`  → Sources: ${dataSources.join(", ")} (${contextSections.length} sections)`);

  try {
    const result = await fetchJSON(`${BASE_URL}/api/evaluate-synthesized/${bu.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contextSections, dataSources }),
    });

    if (result.success) {
      console.log(`  ✓ ${result.recommendation} (Score: ${result.overallScore?.toFixed(1)}/10, Eval ID: ${result.evaluationId})`);
      return { success: true, recommendation: result.recommendation, score: result.overallScore };
    } else {
      console.log(`  ✗ FAILED: ${result.error}`);
      return { success: false };
    }
  } catch (err: any) {
    console.log(`  ✗ ERROR: ${err.message}`);
    return { success: false };
  }
}

async function main() {
  console.log("=== Synthesized Evaluation Runner ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Brainlifts dir: ${BRAINLIFTS_DIR}`);
  console.log(`P&L data dir: ${PNL_DIR}`);

  // Get all BUs
  const allBUs: BU[] = await fetchJSON(`${BASE_URL}/api/business-units`);
  console.log(`\nTotal BUs: ${allBUs.length}`);

  // Get existing evaluations
  const evaluated = await getExistingEvaluations();
  console.log(`Already evaluated BU IDs: ${[...evaluated].join(", ")}`);

  // Filter to targets
  let targets = allBUs;
  if (TARGET_IDS) {
    targets = allBUs.filter(bu => TARGET_IDS.includes(bu.id));
    console.log(`Filtering to specified IDs: ${TARGET_IDS.join(", ")}`);
  } else {
    // By default, only evaluate BUs that don't have evaluations yet
    targets = allBUs.filter(bu => !evaluated.has(bu.id));
    console.log(`BUs without evaluations: ${targets.length}`);
  }

  console.log(`\nTargets (${targets.length}):`);
  targets.forEach(bu => {
    const hasBrainlift = !!readBrainlift(bu.id);
    const hasPnl = !!readPnlData(bu.id);
    console.log(`  ${bu.id}: ${bu.name} [brainlift: ${hasBrainlift ? "✓" : "✗"}, pnl: ${hasPnl ? "✓" : "✗"}]`);
  });

  // Run evaluations sequentially
  const results: { name: string; success: boolean; recommendation?: string; score?: number }[] = [];
  
  for (const bu of targets) {
    try {
      const result = await runEvaluation(bu);
      results.push({ name: bu.name, ...result });
    } catch (err: any) {
      console.log(`  ✗ CRASH: ${err.message}`);
      results.push({ name: bu.name, success: false });
    }
    // Delay between evals to avoid rate limiting
    await new Promise(r => setTimeout(r, 3000));
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(60));
  
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\nSucceeded (${succeeded.length}):`);
  succeeded.forEach(r => console.log(`  ✓ ${r.name}: ${r.recommendation} (${r.score?.toFixed(1)}/10)`));
  
  if (failed.length > 0) {
    console.log(`\nFailed (${failed.length}):`);
    failed.forEach(r => console.log(`  ✗ ${r.name}`));
  }
  
  console.log(`\nTotal: ${results.length}, Success: ${succeeded.length}, Failed: ${failed.length}`);
}

main().catch(console.error);
