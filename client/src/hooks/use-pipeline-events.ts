import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface PipelineEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export function usePipelineEvents() {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<PipelineEvent | null>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const mountedRef = useRef(true);
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/pipeline`);

    ws.onopen = () => {
      setConnected(true);
      reconnectDelay.current = 1000;
    };
    ws.onclose = () => {
      setConnected(false);
      if (!mountedRef.current) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
    };

    ws.onmessage = (msg) => {
      try {
        const event: PipelineEvent = JSON.parse(msg.data);
        setLastEvent(event);
        setEvents((prev) => [event, ...prev].slice(0, 100));

        if (event.type === "ingestion_complete" || event.type === "data_changed") {
          queryClient.invalidateQueries({ queryKey: ["/api/data-records"] });
          queryClient.invalidateQueries({ queryKey: ["/api/ingestion-events"] });
          queryClient.invalidateQueries({ queryKey: ["/api/pipeline/status"] });
        }
        if (event.type === "evaluation_complete") {
          queryClient.invalidateQueries({ queryKey: ["/api/business-units"] });
          queryClient.invalidateQueries({ queryKey: ["/api/evaluations"] });
        }
      } catch {
        // ignore parse errors
      }
    };

    wsRef.current = ws;
  }, [queryClient]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, lastEvent, events };
}
