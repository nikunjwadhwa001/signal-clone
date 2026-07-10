import { getWsTicket } from "@/lib/api/auth";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

type Listener = (data: any) => void;

/**
 * Singleton WebSocket connection. Authenticates via a short-lived ticket
 * fetched over REST (the browser WebSocket API can't set an Authorization
 * header, and putting the long-lived JWT in the URL would leak it into
 * server access logs). Reconnects with exponential backoff + jitter, and
 * answers the server's heartbeat ping so idle-killing proxies don't drop us.
 */
class SocketManager {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private reconnectAttempt = 0;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectingPromise: Promise<void> | null = null;

  on(type: string, cb: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
    return () => this.listeners.get(type)?.delete(cb);
  }

  private emit(type: string, data: any) {
    this.listeners.get(type)?.forEach((cb) => cb(data));
    this.listeners.get("*")?.forEach((cb) => cb(data));
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connectingPromise) return this.connectingPromise;

    this.shouldReconnect = true;
    this.connectingPromise = this._connect();
    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async _connect() {
    const ticket = await getWsTicket();
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}/ws?ticket=${encodeURIComponent(ticket)}`);
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.emit("_connected", null);
        resolve();
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ping") {
            this.send({ type: "pong" });
            return;
          }
          this.emit(data.type, data);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        this.emit("_disconnected", null);
        this.ws = null;
        if (this.shouldReconnect) this.scheduleReconnect();
      };
      ws.onerror = () => {
        reject(new Error("ws error"));
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 15000);
    const jitter = Math.random() * 0.4 * delay;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) this.connect().catch(() => {});
    }, delay + jitter);
  }

  send(payload: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const socketManager = new SocketManager();
