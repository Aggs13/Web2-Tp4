import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

// WebSocket 
import { WebSocketServer,WebSocket } from "ws";


const port = Number(process.env.PORT ?? 3000);

const server = http.createServer(async(req,res) => {

  if(req.url == "/"){
    const filePath = path.join(process.cwd(), "public","index.html");
    const html = await readFile(filePath, "utf-8");

    res.writeHead(200,{ "Content-Type": "text/html; charset=utf-8"});
    res.end(html);
    return
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("No encontrado");

});

const wss = new WebSocketServer({server}); // Http y WebSocket comparten el mismo puerto
const users = new Map<WebSocket,string>(); // guarda que nombre eligio cada conexion

// Se ejecuta cada vez que un navegador abre una conexion WebSocket
wss.on("connection", (ws) => {
  console.log("Nuevo cliente conectado");

  // Se ejecuta cada vez que ese cliente envia un mensaje al servidor
  ws.on("message", (raw) => {
    try {
      // Convierte el texto recibido a objeto JSON (si no es JSON valido, salta al catch)
      const msg = JSON.parse(raw.toString());

      // Caso 1: el usuario se registra con su nombre
      if (msg.type === "join" && typeof msg.name === "string" && msg.name.trim() !== "") {
        users.set(ws, msg.name.trim()); // asocia esta conexion con su nombre limpio
        return;
      }

      // Caso 2: el usuario envia un mensaje de chat
      if (msg.type === "chat" && typeof msg.text === "string" && msg.text.trim() !== "") {
        const name = users.get(ws); // busca el nombre guardado en el servidor para esta conexion
        if (!name) {
          ws.send(JSON.stringify({ type: "error", message: "Primero tenés que elegir un nombre" }));
          return;
        }

        // Prepara el mensaje una sola vez con el nombre real del servidor
        const payload = JSON.stringify({ type: "chat", name, text: msg.text.trim() });

        // Reenvia el mensaje a todos los clientes que sigan conectados
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
        return;
      }

      // Si llego un JSON valido pero con tipo desconocido o campos faltantes
      ws.send(JSON.stringify({ type: "error", message: "Mensaje inválido" }));
    } catch {
      // Si el cliente mando texto que no es JSON valido, no se cae el servidor
      ws.send(JSON.stringify({ type: "error", message: "El mensaje debe ser JSON válido" }));
    }
  });

  // Se ejecuta cuando el cliente cierra la pestaña o pierde conexion
  ws.on("close", () => {
    users.delete(ws); // libera la memoria asociada a esa conexion
    console.log("Cliente desconectado");
  });
});

server.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});