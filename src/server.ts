import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.PORT ?? 3000);

const server = http.createServer(async (req, res) => {
  if (req.url == "/") {
    const filePath = path.join(process.cwd(), "public", "index.html");
    const html = await readFile(filePath, "utf-8");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.url == "/styles.css") {
    const filePath = path.join(process.cwd(), "public", "styles.css");
    const css = await readFile(filePath, "utf-8");

    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
    res.end(css);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("No encontrado");
});

const wss = new WebSocketServer({ server });
const users = new Map<WebSocket, string>();

wss.on("connection", (ws) => {
  console.log("Nuevo cliente conectado");

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Caso 1: el usuario se registra con su nombre
      if (msg.type === "join" && typeof msg.name === "string" && msg.name.trim() !== "") {

        const name = msg.name.trim();
        const nombreRepetido = [...users.values()].some((exist) => exist.toLowerCase() == name.toLowerCase())

        if(name.length  <= 3 || name.length  >= 15){
          ws.send(JSON.stringify({ type: "error", message: "El nombre debe ser entre 4 y 14 caracteres" }));
          return;
        }

        if(nombreRepetido) {
          ws.send(JSON.stringify({ type: "error", message: "Ese nombre ya está en uso, elegí otro" }));
          return;
        }
        
        users.set(ws, msg.name.trim());
        ws.send(JSON.stringify({ type: "joined", name: name }));

        broadcastParticipantes()
        return;
      }

      // Caso 2: el usuario envia un mensaje de chat
      if (msg.type === "chat" && typeof msg.text === "string" && msg.text.trim() !== "") {
        const name = users.get(ws);
        if (!name) {
          ws.send(JSON.stringify({ type: "error", message: "Primero tenés que elegir un nombre" }));
          return;
        }

        const payload = JSON.stringify({ type: "chat", name, text: msg.text.trim() });

        // Envia el mensaje a los demas clientes conectados
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
        return;
      }

      ws.send(JSON.stringify({ type: "error", message: "Mensaje inválido" }));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "El mensaje debe ser JSON válido" }));
    }
  });

  ws.on("close", () => {
    users.delete(ws);
    console.log("Cliente desconectado");
    broadcastParticipantes()
  });
});

server.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});

function broadcastParticipantes() {
  const payload = JSON.stringify({
    type: "participantes",
    participants: [...users.values()], // convierte el Map en ["Usuario1", "Usuario2", ...]
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}