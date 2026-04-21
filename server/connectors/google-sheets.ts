import { google } from "googleapis";
import type {
  IConnector,
  ConnectorConfig,
  FetchResult,
  DiscoveredResource,
  ChangeDetection,
} from "./types";
import { computeContentHash } from "./types";

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

let cachedSheetsAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getAuth() {
  if (!cachedSheetsAuth) {
    cachedSheetsAuth = new google.auth.GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
  }
  return cachedSheetsAuth;
}

export class GoogleSheetsConnector implements IConnector {
  readonly type = "google_sheets" as const;

  async validateAuth(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    try {
      const auth = getAuth();
      const sheets = google.sheets({ version: "v4", auth });
      const testUrl = (config.config.urls as string[])?.[0] || (config.config.url as string);
      if (!testUrl) return { valid: false, error: "No spreadsheet URL configured" };
      const spreadsheetId = extractSpreadsheetId(testUrl);
      if (!spreadsheetId) return { valid: false, error: "Invalid spreadsheet URL" };
      await sheets.spreadsheets.get({ spreadsheetId, fields: "properties.title" });
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  async discover(config: ConnectorConfig): Promise<DiscoveredResource[]> {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const urls = (config.config.urls as string[]) || [];
    if (config.config.url) urls.push(config.config.url as string);

    const resources: DiscoveredResource[] = [];
    for (const url of urls) {
      const spreadsheetId = extractSpreadsheetId(url);
      if (!spreadsheetId) continue;
      try {
        const res = await sheets.spreadsheets.get({ spreadsheetId });
        const title = res.data.properties?.title || spreadsheetId;
        const sheetNames = res.data.sheets?.map((s) => s.properties?.title) || [];
        resources.push({
          externalId: spreadsheetId,
          externalUrl: url,
          title,
          resourceType: "spreadsheet",
          lastModified: null,
          metadata: { sheetNames },
        });
      } catch {
        // skip inaccessible sheets
      }
    }
    return resources;
  }

  async fetch(config: ConnectorConfig, externalId: string): Promise<FetchResult> {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const range = (config.config.range as string) || "A:ZZ";
    const sheetName = config.config.sheetName as string | undefined;
    const fullRange = sheetName ? `'${sheetName}'!${range}` : range;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: externalId,
      range: fullRange,
    });

    const rows = res.data.values || [];
    if (rows.length === 0) {
      const url = `https://docs.google.com/spreadsheets/d/${externalId}`;
      return {
        sourceId: config.id,
        externalId,
        externalUrl: url,
        rawContent: "[]",
        rawFormat: "json" as const,
        contentHash: computeContentHash("[]"),
        fetchedAt: new Date().toISOString(),
        metadata: { rowCount: 0, headers: [], sheetName: sheetName || null },
      };
    }
    const headers = rows[0];
    const seen = new Map<string, number>();
    const uniqueHeaders = headers.map((h: string) => {
      const count = seen.get(h) || 0;
      seen.set(h, count + 1);
      return count > 0 ? `${h}_${count}` : h;
    });

    const dataRows = rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      uniqueHeaders.forEach((h: string, i: number) => {
        obj[h] = row[i] || "";
      });
      return obj;
    });

    const content = JSON.stringify(dataRows, null, 2);
    const url = `https://docs.google.com/spreadsheets/d/${externalId}`;

    return {
      sourceId: config.id,
      externalId,
      externalUrl: url,
      rawContent: content,
      rawFormat: "json",
      contentHash: computeContentHash(content),
      fetchedAt: new Date().toISOString(),
      metadata: { rowCount: dataRows.length, headers, sheetName: sheetName || null },
    };
  }

  async fetchAll(config: ConnectorConfig): Promise<FetchResult[]> {
    const urls = (config.config.urls as string[]) || [];
    if (config.config.url) urls.push(config.config.url as string);

    const results: FetchResult[] = [];
    for (const url of urls) {
      const id = extractSpreadsheetId(url);
      if (!id) continue;
      try {
        results.push(await this.fetch(config, id));
      } catch {
        // skip errors on individual sheets
      }
    }
    return results;
  }

  async checkForChanges(
    config: ConnectorConfig,
    lastCheckedAt: string,
  ): Promise<ChangeDetection[]> {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const urls = (config.config.urls as string[]) || [];
    if (config.config.url) urls.push(config.config.url as string);

    const changes: ChangeDetection[] = [];
    for (const url of urls) {
      const id = extractSpreadsheetId(url);
      if (!id) continue;
      try {
        const res = await drive.files.get({
          fileId: id,
          fields: "id,modifiedTime",
        });
        const modifiedTime = res.data.modifiedTime || null;
        const changed = modifiedTime
          ? new Date(modifiedTime) > new Date(lastCheckedAt)
          : false;
        changes.push({
          externalId: id,
          changed,
          lastModified: modifiedTime,
          changeType: "modified",
        });
      } catch {
        // skip inaccessible files
      }
    }
    return changes;
  }
}
