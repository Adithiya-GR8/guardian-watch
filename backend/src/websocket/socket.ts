import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

class SocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  public init(server: Server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on("connection", (ws) => {
      console.log("New frontend client connected via WebSocket");
      this.clients.add(ws);

      ws.on("close", () => {
        this.clients.delete(ws);
      });
    });
  }

  public broadcast(data: any) {
    const message = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

export const socketServer = new SocketServer();
