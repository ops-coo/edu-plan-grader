import { google } from "googleapis";
import type {
  IConnector,
  ConnectorConfig,
  FetchResult,
  DiscoveredResource,
  ChangeDetection,
} from "./types";
import { computeContentHash } from "./types";

function extractDocId(url: string): string | null {
  let unwrapped = url;
  if (url.includes("url?q=")) {
    try {
      unwrapped = decodeURIComponent(url.split("url?q=")[1]?.split("&")[0] || "");
    } catch {
      return null;
    }
  }
  const match = unwrapped.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

let cachedDocsAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getAuth() {
  if (!cachedDocsAuth) {
    cachedDocsAuth = new google.auth.GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/documents.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
  }
  return cachedDocsAuth;
}

export class GoogleDocsConnector implements IConnector {
  readonly type = "google_docs" as const;

  async validateAuth(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    try {
      const auth = getAuth();
      const docs = google.docs({ version: "v1", auth });
      const testUrl = (config.config.urls as string[])?.[0] || (config.config.url as string);
      if (!testUrl) return { valid: false, error: "No document URL configured" };
      const docId = extractDocId(testUrl);
      if (!docId) return { valid: false, error: "Invalid document URL" };
      await docs.documents.get({ documentId: docId, fields: "title" });
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  async discover(config: ConnectorConfig): Promise<DiscoveredResource[]> {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    const folderId = config.config.folderId as string | undefined;
    if (folderId) {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
        fields: "files(id,name,modifiedTime,webViewLink)",
        pageSize: 100,
      });
      return (res.data.files || []).map((f) => ({
        externalId: f.id || "",
        externalUrl: f.webViewLink || "",
        title: f.name || "Untitled",
        resourceType: "document",
        lastModified: f.modifiedTime || null,
        metadata: {},
      }));
    }

    const urls = [
      ...((config.config.urls as string[]) || []),
      ...(config.config.url ? [config.config.url as string] : []),
    ];

    const resources: DiscoveredResource[] = [];
    for (const url of urls) {
      const docId = extractDocId(url);
      if (!docId) continue;
      try {
        const res = await drive.files.get({
          fileId: docId,
          fields: "id,name,modifiedTime,webViewLink",
        });
        resources.push({
          externalId: res.data.id || docId,
          externalUrl: res.data.webViewLink || url,
          title: res.data.name || "Untitled",
          resourceType: "document",
          lastModified: res.data.modifiedTime || null,
          metadata: {},
        });
      } catch {
        // skip inaccessible docs
      }
    }
    return resources;
  }

  async fetch(config: ConnectorConfig, externalId: string): Promise<FetchResult> {
    const auth = getAuth();
    const docs = google.docs({ version: "v1", auth });

    const res = await docs.documents.get({ documentId: externalId });
    const doc = res.data;
    const title = doc.title || "Untitled";

    const textParts: string[] = [];
    for (const element of doc.body?.content || []) {
      if (element.paragraph) {
        for (const el of element.paragraph.elements || []) {
          if (el.textRun?.content) {
            textParts.push(el.textRun.content);
          }
        }
      } else if (element.table) {
        for (const row of element.table.tableRows || []) {
          const cells: string[] = [];
          for (const cell of row.tableCells || []) {
            const cellText: string[] = [];
            for (const p of cell.content || []) {
              for (const el of p.paragraph?.elements || []) {
                if (el.textRun?.content) cellText.push(el.textRun.content.trim());
              }
            }
            cells.push(cellText.join(" "));
          }
          textParts.push(cells.join(" | ") + "\n");
        }
      }
    }

    const content = textParts.join("");
    const url = `https://docs.google.com/document/d/${externalId}`;

    return {
      sourceId: config.id,
      externalId,
      externalUrl: url,
      rawContent: content,
      rawFormat: "text",
      contentHash: computeContentHash(content),
      fetchedAt: new Date().toISOString(),
      metadata: { title, characterCount: content.length },
    };
  }

  async fetchAll(config: ConnectorConfig): Promise<FetchResult[]> {
    const folderId = config.config.folderId as string | undefined;
    if (folderId) {
      const discovered = await this.discover(config);
      const results: FetchResult[] = [];
      for (const doc of discovered) {
        try {
          results.push(await this.fetch(config, doc.externalId));
        } catch {
          // skip individual doc errors
        }
      }
      return results;
    }

    const urls = [
      ...((config.config.urls as string[]) || []),
      ...(config.config.url ? [config.config.url as string] : []),
    ];

    const results: FetchResult[] = [];
    for (const url of urls) {
      const docId = extractDocId(url);
      if (!docId) continue;
      try {
        results.push(await this.fetch(config, docId));
      } catch {
        // skip individual doc errors
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
    const urls = [
      ...((config.config.urls as string[]) || []),
      ...(config.config.url ? [config.config.url as string] : []),
    ];

    const folderId = config.config.folderId as string | undefined;
    if (folderId) {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and modifiedTime > '${lastCheckedAt}' and trashed=false`,
        fields: "files(id,modifiedTime)",
      });
      return (res.data.files || []).map((f) => ({
        externalId: f.id || "",
        changed: true,
        lastModified: f.modifiedTime || null,
        changeType: "modified" as const,
      }));
    }

    const changes: ChangeDetection[] = [];
    for (const url of urls) {
      const docId = extractDocId(url);
      if (!docId) continue;
      try {
        const res = await drive.files.get({
          fileId: docId,
          fields: "id,modifiedTime",
        });
        const modifiedTime = res.data.modifiedTime || null;
        const changed = modifiedTime
          ? new Date(modifiedTime) > new Date(lastCheckedAt)
          : false;
        changes.push({
          externalId: docId,
          changed,
          lastModified: modifiedTime,
          changeType: "modified",
        });
      } catch {
        // skip inaccessible docs
      }
    }
    return changes;
  }
}
