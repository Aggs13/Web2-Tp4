import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { GetProduct } from "./catalog.services.js";
import { ProponerProducto, QuitarProducto, QuitarVoto, VotarProducto } from "./list.services.js";
import { getProductsSorted } from "./list.repository.js";

const port = Number(process.env.PORT ?? 3000);
const screens = new Set<http.ServerResponse>();

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

  if (req.url == "/pantalla.css") {
    const filePath = path.join(process.cwd(), "public", "pantalla.css");
    const css = await readFile(filePath, "utf-8");

    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
    res.end(css);
    return;
  }

  if (req.url == "/pantalla") {
    const filePath = path.join(process.cwd(), "public", "pantalla.html");
    const html = await readFile(filePath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.url == "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    screens.add(res);
    res.write(`data: ${JSON.stringify({ ranking: getProductsSorted(), connectedCount: users.size })}\n\n`);
    req.on("close", () => {
      screens.delete(res);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("No encontrado");
});

const wss = new WebSocketServer({ server });
const users = new Map<WebSocket, string>();
const socketByClientId = new Map<string, WebSocket>();

wss.on("connection", (ws) => {
  console.log("Nuevo cliente conectado");

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Caso 1: el usuario se registra con su nombre
      if (msg.type === "join" && typeof msg.name === "string" && msg.name.trim() !== "") {

        const name = msg.name.trim();
        const clientId = typeof msg.clientId === "string" ? msg.clientId : "";

        if(name.length  <= 3 || name.length  >= 15){
          ws.send(JSON.stringify({ type: "error", message: "El nombre debe ser entre 4 y 14 caracteres" }));
          return;
        }

        // Si es la misma pestaña reconectándose (al volver de /pantalla o recargar), limpia su socket viejo
        if (clientId && socketByClientId.has(clientId)) {
          const oldWs = socketByClientId.get(clientId)!;
          if (oldWs !== ws) {
            users.delete(oldWs);
            oldWs.close();
          }
        }

        const nombreRepetido = [...users.values()].some((exist) => exist.toLowerCase() == name.toLowerCase())

        if(nombreRepetido) {
          ws.send(JSON.stringify({ type: "error", message: "Ese nombre ya está en uso, elegí otro" }));
          return;
        }
        
        if (clientId) {
          socketByClientId.set(clientId, ws);
        }
        users.set(ws, name);
        ws.send(JSON.stringify({ type: "joined", name: name }));

        broadcastParticipantes()
        broadcastProductos()
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

      // Caso 3: el usuario propone uno o varios productos por ID
      if (msg.type === "get_product" && Array.isArray(msg.ids) && msg.ids.every((id: unknown) => typeof id === "number" && Number.isInteger(id) && id > 0)) {

        const name = users.get(ws);
        if (!name) {
          ws.send(JSON.stringify({ type: "error", message: "No tenes nombre de usuario" }));
          return;
        }

        const result = await ProponerProducto(msg.ids, name);
        if (result.message) {
          ws.send(JSON.stringify({ type: "error", message: result.message }));
          return;
        }

        ws.send(JSON.stringify({ type: "product_result", result }));
        broadcastProductos();
        return;
      }

      // Caso 4 sumar voto
      if (msg.type === "vote" && typeof msg.id === "number") {
        if (!users.get(ws)) {
          ws.send(JSON.stringify({ type: "error", message: "Primero tenés que elegir un nombre" }));
          return;
        }
        const result = VotarProducto(msg.id);
        if (result.message) {
          ws.send(JSON.stringify({ type: "error", message: result.message }));
          return;
        }
        broadcastProductos();
        return;
      }

      // Caso 5: sacar voto
      if (msg.type === "unvote" && typeof msg.id === "number") {
        if (!users.get(ws)) {
          ws.send(JSON.stringify({ type: "error", message: "Primero tenés que elegir un nombre" }));
          return;
        }
        const result = QuitarVoto(msg.id);
        if (result.message) {
          ws.send(JSON.stringify({ type: "error", message: result.message }));
          return;
        }
        broadcastProductos();
        return;
      }

      // Caso 6: quitar producto de la lista
      if (msg.type === "remove" && typeof msg.id === "number") {
        const name = users.get(ws);
        if (!name) {
          ws.send(JSON.stringify({ type: "error", message: "Primero tenés que elegir un nombre" }));
          return;
        }

        const result = QuitarProducto(msg.id, name);
        if (result.message) {
          ws.send(JSON.stringify({ type: "error", message: result.message }));
          return;
        }
        broadcastProductos();
        return;
      }


      ws.send(JSON.stringify({ type: "error", message: "Mensaje inválido" }));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "El mensaje debe ser JSON válido" }));
    }
  });

  ws.on("close", () => {
    users.delete(ws);
    for (const [cid, sock] of socketByClientId.entries()) {
      if (sock === ws) socketByClientId.delete(cid);
    }
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
  broadcastScreen();
}


function broadcastProductos(){
  const payload = JSON.stringify({
    type: "productos",
    products: getProductsSorted()
  })

  for(const client of wss.clients){
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
  broadcastScreen();
}

function broadcastScreen() {
  const payload = `data: ${JSON.stringify({ ranking: getProductsSorted(), connectedCount: users.size })}\n\n`;
  for (const screen of screens) {
    screen.write(payload);
  }
}