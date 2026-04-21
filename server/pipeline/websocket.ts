import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

export type PipelineEventType =
  | "connected"
  | "ingestion_complete"
  | "data_changed"
  | "evaluation_triggered"
  | "evaluation_complete"
  | "pipeline_cycle_complete"
  | "error";

export interface PipelineEvent {
  type: PipelineEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

class PipelineWebSocket {
  private wss: WebSocketServer | null = null;

  init(server: Server): void {
    this.wss = new WebSocketServer({ server, path: "/ws/pipeline" });

    this.wss.on("connection", (ws) => {
      ws.send(
        JSON.stringify({
          type: "connected",
          timestamp: new Date().toISOString(),
          data: { message: "Pipeline WebSocket connected" },
        }),
      );
    });

    console.log("[pipeline-ws] WebSocket server initialized on /ws/pipeline");
  }

  broadcast(event: PipelineEvent): void {
    if (!this.wss) return;
    const msg = JSON.stringify(event);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  get clientCount(): number {
    return this.wss?.clients.size ?? 0;
  }
}

export const pipelineWs = new PipelineWebSocket();
