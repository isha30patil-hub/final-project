import { useEffect, useRef, useState } from "react";
import { wsUrl } from "@/lib/api";

export type ExecutionStep = {
  id?: number;
  step_number: number;
  action?: string;
  expected_result?: string;
  actual_result?: string;
  status: "PASSED" | "FAILED";
};

export type ExecutionState = {
  status: "QUEUED" | "RUNNING" | "PASSED" | "FAILED" | "BLOCKED" | "ERROR" | "CANCELLED" | null;
  steps: ExecutionStep[];
  failureSummary: string | null;
  connected: boolean;
};

const RECONNECT_DELAYS = [1000, 2000, 4000];

export function useExecutionSocket(executionId: number | null) {
  const [state, setState] = useState<ExecutionState>({
    status: null,
    steps: [],
    failureSummary: null,
    connected: false,
  });
  const attemptRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!executionId) {
      setState({ status: null, steps: [], failureSummary: null, connected: false });
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      socket = new WebSocket(wsUrl(`/ws/executions/${executionId}`));
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setState((prev) => ({ ...prev, connected: true }));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "SNAPSHOT") {
          setState((prev) => ({
            ...prev,
            status: data.execution?.status ?? prev.status,
            steps: data.steps ?? [],
            failureSummary: data.execution?.failure_summary ?? null,
          }));
          return;
        }

        if (data.type === "STEP_PASSED" || data.type === "STEP_FAILED") {
          setState((prev) => {
            const steps = [...prev.steps];
            const idx = steps.findIndex((s) => s.step_number === data.step_number);
            const updated: ExecutionStep = {
              step_number: data.step_number,
              actual_result: data.actual_result,
              status: data.type === "STEP_PASSED" ? "PASSED" : "FAILED",
            };
            if (idx >= 0) steps[idx] = { ...steps[idx], ...updated };
            else steps.push(updated);
            return { ...prev, steps };
          });
          return;
        }

        if (data.type?.startsWith("TEST_")) {
          setState((prev) => ({
            ...prev,
            status: data.type.replace("TEST_", ""),
            failureSummary: data.failure_summary ?? prev.failureSummary,
          }));
        }
      };

      socket.onclose = () => {
        setState((prev) => ({ ...prev, connected: false }));
        if (cancelled) return;
        const terminal = ["PASSED", "FAILED", "BLOCKED", "ERROR", "CANCELLED"];
        setState((prev) => {
          if (prev.status && terminal.includes(prev.status)) return prev;
          const delay = RECONNECT_DELAYS[Math.min(attemptRef.current, RECONNECT_DELAYS.length - 1)];
          attemptRef.current += 1;
          reconnectTimer = setTimeout(connect, delay);
          return prev;
        });
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socketRef.current = null;
    };
  }, [executionId]);

  return state;
}
