import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";
import type { FetchResult, ConnectorConfig } from "../connectors/types";
import type { BusinessUnit } from "@shared/schema";

export interface ContextualizedData {
  canonicalTitle: string;
  contentType: string;
  summary: string;
  normalizedContent: string | null;
  structuredMetadata: {
    businessUnitName?: string;
    quarter?: string;
    dateRange?: { start: string; end: string };
    keyMetrics?: Record<string, number | string>;
    people?: string[];
    tags?: string[];
    sentiment?: "positive" | "neutral" | "negative" | "mixed";
    completeness?: "complete" | "partial" | "draft";
  };
  dataQualityScore: number;
  contextConfidence: number;
  relatedBusinessUnitIds: number[];
  tags: string[];
}

function buildContextualizationPrompt(
  fetchResult: FetchResult,
  sourceType: string,
  businessUnits: BusinessUnit[],
): string {
  const buList = businessUnits
    .map((bu) => `  - ID ${bu.id}: "${bu.name}" (GM: ${bu.gm || "unknown"})`)
    .join("\n");

  const contentPreview =
    fetchResult.rawContent.length > 8000
      ? fetchResult.rawContent.slice(0, 8000) + "\n\n[... truncated ...]"
      : fetchResult.rawContent;

  return `You are a data contextualization agent for an education portfolio analytics system (2Hr Learning / Alpha Holdings).

Your job is to analyze raw data from a ${sourceType} source and extract structured metadata.

## Known Business Units
${buList}

## Source Information
- Source type: ${sourceType}
- External ID: ${fetchResult.externalId}
- URL: ${fetchResult.externalUrl}
- Format: ${fetchResult.rawFormat}

## Raw Content
${contentPreview}

## Task
Analyze this content and return a JSON object with:

{
  "canonical_title": "<clear, descriptive title for this data>",
  "content_type": "<one of: business_plan, financial_data, brainlift, project_status, milestone, pnl, meeting_notes, other>",
  "summary": "<2-3 sentence summary of what this data contains and its significance>",
  "business_unit_name": "<name of the most relevant business unit from the list above, or null if unclear>",
  "business_unit_ids": [<array of matching BU IDs from above, empty if none match>],
  "quarter": "<e.g. Q2-26, or null if not quarter-specific>",
  "key_metrics": {<extracted numeric/financial metrics as key-value pairs, e.g. "revenue": "$1.2M", "students": 500>},
  "people": [<names of people mentioned>],
  "tags": [<topic tags, e.g. "enrollment", "P&L", "marketing", "AI", "curriculum">],
  "sentiment": "<positive|neutral|negative|mixed — overall tone of the data>",
  "completeness": "<complete|partial|draft — how complete is this data>",
  "data_quality_score": <0-100, how useful and reliable is this data for evaluation>,
  "confidence": <0-100, your confidence in the metadata extraction>
}

Return ONLY valid JSON. Match business units by name similarity — don't guess if unclear.`;
}

export async function contextualizeData(
  fetchResult: FetchResult,
  sourceConfig: ConnectorConfig,
): Promise<ContextualizedData> {
  const businessUnits = storage.getBusinessUnits();
  const prompt = buildContextualizationPrompt(
    fetchResult,
    sourceConfig.type,
    businessUnits,
  );

  let anthropic: Anthropic;
  try {
    anthropic = new Anthropic();
  } catch {
    return fallbackContextualization(fetchResult, sourceConfig);
  }

  try {
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackContextualization(fetchResult, sourceConfig);

    const parsed = JSON.parse(jsonMatch[0]);

    const buIds: number[] = parsed.business_unit_ids || [];
    if (buIds.length === 0 && parsed.business_unit_name) {
      const match = businessUnits.find(
        (bu) =>
          bu.name.toLowerCase().includes(parsed.business_unit_name.toLowerCase()) ||
          parsed.business_unit_name.toLowerCase().includes(bu.name.toLowerCase()),
      );
      if (match) buIds.push(match.id);
    }

    return {
      canonicalTitle: parsed.canonical_title || fetchResult.externalId,
      contentType: parsed.content_type || "other",
      summary: parsed.summary || "No summary available.",
      normalizedContent: null,
      structuredMetadata: {
        businessUnitName: parsed.business_unit_name || undefined,
        quarter: parsed.quarter || undefined,
        keyMetrics: parsed.key_metrics || undefined,
        people: parsed.people || undefined,
        tags: parsed.tags || undefined,
        sentiment: parsed.sentiment || undefined,
        completeness: parsed.completeness || undefined,
      },
      dataQualityScore: parsed.data_quality_score ?? 50,
      contextConfidence: parsed.confidence ?? 50,
      relatedBusinessUnitIds: buIds,
      tags: parsed.tags || [],
    };
  } catch {
    return fallbackContextualization(fetchResult, sourceConfig);
  }
}

function fallbackContextualization(
  fetchResult: FetchResult,
  sourceConfig: ConnectorConfig,
): ContextualizedData {
  return {
    canonicalTitle: `${sourceConfig.name} — ${fetchResult.externalId}`,
    contentType: "other",
    summary: `Raw ${fetchResult.rawFormat} data from ${sourceConfig.type} source.`,
    normalizedContent: null,
    structuredMetadata: {},
    dataQualityScore: 30,
    contextConfidence: 10,
    relatedBusinessUnitIds: [],
    tags: [sourceConfig.type],
  };
}
