# TP4 · Asincronismo e integración con Node.js y TypeScript

Aplicación de lista compartida en tiempo real para elegir un regalo grupal, construida con **Node.js (LTS)** y **TypeScript** en un único servidor y puerto. Integra el catálogo externo de **DummyJSON** de manera asíncrona y paralela, sincronizando participantes por **WebSocket** y una pantalla compartida por **Server-Sent Events (SSE)**.

---

## 1. Instalación y ejecución

### Requisitos
- **Node.js** v20+ / v22 LTS.

### Pasos
1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Configurar variables de entorno copiando `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
   Variables disponibles en `.env`:
   ```env
   PORT=3000
   CATALOG_URL=https://dummyjson.com/products
   CATALOG_TIMEOUT_MS=3000
   CATALOG_DELAY_MS=0
   ```
3. Ejecutar en modo desarrollo (recarga automática con `tsx`):
   ```bash
   npm run dev
   ```
4. Verificar tipos o compilar para producción:
   ```bash
   npm run typecheck
   npm run build
   npm start
   ```

### Rutas de la aplicación
- **Vista de Participante (WebSocket):** `http://localhost:3000/`
- **Vista de Pantalla Compartida (SSE):** `http://localhost:3000/pantalla`
- **Stream SSE:** `http://localhost:3000/events`

### Cómo simular un catálogo lento sin modificar el código
En el archivo `.env` (o en las variables de entorno del servidor), modificar `CATALOG_DELAY_MS` indicando la demora en milisegundos que DummyJSON aplicará mediante el parámetro `?delay=`:
- **Catálogo lento pero dentro del tiempo límite** (ej. tarda 2 segundos y responde mientras los demás siguen votando):
  ```env
  CATALOG_TIMEOUT_MS=3000
  CATALOG_DELAY_MS=2000
  ```
- **Catálogo que excede el tiempo máximo de espera** (dispara error de timeout a los 3 segundos):
  ```env
  CATALOG_TIMEOUT_MS=3000
  CATALOG_DELAY_MS=4500
  ```

---

## 2. Contrato de mensajes

Todos los mensajes intercambiados son objetos **JSON** con la propiedad discriminante `type`.

### A. Participante → Servidor (WebSocket)

| Tipo (`type`) | Dirección | Campos | Ejemplo | Cuándo se envía |
| :--- | :--- | :--- | :--- | :--- |
| `join` | Cliente → Servidor | `name: string`, `clientId?: string` | `{"type":"join","name":"Agus","clientId":"abc123"}` | Cuando el participante ingresa su nombre en el modal inicial o se reconecta en la misma pestaña. |
| `get_product` | Cliente → Servidor | `ids: number[]` (1 a 10 enteros positivos) | `{"type":"get_product","ids":[1, 2, 9999]}` | Cuando el participante propone uno o hasta 10 productos por ID separados por coma. |
| `vote` | Cliente → Servidor | `id: number` | `{"type":"vote","id":1}` | Cuando el participante vota un producto de la lista. |
| `unvote` | Cliente → Servidor | `id: number` | `{"type":"unvote","id":1}` | Cuando el participante retira su voto de un producto. |
| `remove` | Cliente → Servidor | `id: number` | `{"type":"remove","id":1}` | Cuando el participante solicita quitar un producto de la lista. |
| `chat` | Cliente → Servidor | `text: string` | `{"type":"chat","text":"Hola!"}` | Cuando el participante envía un mensaje al chat grupal. |

### B. Servidor → Participante (WebSocket)

| Tipo (`type`) | Dirección | Destinatario | Campos | Cuándo se envía |
| :--- | :--- | :--- | :--- | :--- |
| `joined` | Servidor → Cliente | Solo quien se unió | `name: string` | Confirmación tras aceptar el nombre del participante (inmediatamente seguido del estado completo de participantes y productos). |
| `participantes` | Servidor → Cliente | Todos (*Broadcast*) | `participants: string[]` | Cada vez que un participante entra o cierra su pestaña/conexión. |
| `productos` | Servidor → Cliente | Todos (*Broadcast*) / Individual al entrar | `products: Product[]` (`id`, `title`, `price`, `thumbnail`, `proposedBy`, `votes`) | Al entrar un participante nuevo y cada vez que se agrega, vota, retira voto o quita un producto (ordenados de mayor a menor por votos). |
| `product_result` | Servidor → Cliente | Solo quien propuso | `result: { idsParaBuscar: number[], failed: { id?: number, message: string }[] }` | Al finalizar la consulta al catálogo de una propuesta, detallando los fallos individuales si los hubo. |
| `chat` | Servidor → Cliente | Todos (*Broadcast*) | `name: string`, `text: string` | Cuando un participante registrado envía un mensaje al chat. |
| `error` | Servidor → Cliente | Solo quien envió el mensaje inválido | `message: string` | Cuando llega un mensaje que no es JSON válido, tiene tipo desconocido, campos faltantes/fuera de rango o pide una acción no permitida. |

### C. Servidor → Pantalla (Server-Sent Events en `GET /events`)

| Evento | Dirección | Formato (`data:`) | Campos | Cuándo se envía |
| :--- | :--- | :--- | :--- | :--- |
| `message` | Servidor → Pantalla | `data: {"ranking":[...],"connectedCount":3}\n\n` | `ranking: Product[]`, `connectedCount: number` | Al conectarse la pantalla por primera vez y automáticamente cada vez que cambia la lista de productos/votos o la cantidad de participantes conectados. |

---

## 3. Decisiones de diseño

1. **Qué nombres de participantes se aceptan:**
   - Se aplica `.trim()` para eliminar espacios al inicio y al final.
   - Debe tener entre **4 y 14 caracteres** (`name.length >= 4 && name.length <= 14`).
   - **No se permiten nombres repetidos** entre usuarios activos (comparación insensible a mayúsculas/minúsculas con `.toLowerCase()`). Si el nombre está ocupado por otro participante, el servidor responde `type: "error"` únicamente a quien intentó entrar y el modal permanece abierto para que elija otro.
   - Se incluye un `clientId` por pestaña (`sessionStorage`) para permitir la reconexión automática al navegar entre `/` y `/pantalla` sin pedir el nombre nuevamente.

2. **Qué pasa con un producto repetido:**
   - Si un participante propone uno o varios IDs y alguno ya existe en la lista (`ExistProduct(id)`), **solo ese ID se rechaza** con el motivo `"El producto ya esta en la lista"` dentro de `failed`, mientras que el resto de los IDs válidos de la misma propuesta se consultan y agregan normalmente.
   - Además, se vuelve a verificar `ExistProduct(p.id)` **después** del `await GetSimultaneo(...)` antes de insertar en memoria, garantizando consistencia si dos participantes proponen el mismo ID simultáneamente mientras la consulta al catálogo está en vuelo.

3. **Quién puede quitar productos:**
   - **Solo el participante que propuso el producto** (`p.proposedBy === nombreUsuario`) puede quitarlo de la lista. La regla se valida en el servidor (`QuitarProducto`); si otro participante intenta quitarlo, recibe un mensaje `error` individual (`"Solo quien lo propuso puede quitarlo"`).

4. **Tiempo máximo de espera elegido para el catálogo y justificación:**
   - Se eligió un timeout por defecto de **`3000` ms (3 segundos)** configurable mediante `CATALOG_TIMEOUT_MS` y aplicado con `AbortSignal.timeout(config.catalogTimeoutMs)`.
   - **Justificación:** En condiciones normales, DummyJSON responde en ~200–500 ms. Un límite de 3 segundos absorbe fluctuaciones normales de red sin abortar prematuramente, pero evita que una caída o demora excesiva del servicio externo deje al participante esperando indefinidamente. Además, todas las consultas de una propuesta múltiple (hasta 10 IDs) se ejecutan en paralelo con `Promise.all`, por lo que el tiempo total de espera para 10 productos sigue acotado a un único ventana de 3 segundos (y no 30 segundos).

---

## 4. Qué ve cada usuario cuando el catálogo falla o tarda

- **Cuando el catálogo falla (o hay fallos parciales en una propuesta múltiple):**
  - **Quien hizo la propuesta:** ve agregarse inmediatamente en la lista los productos válidos de su propuesta y recibe en su panel de mensajes, en color rojo, el motivo puntual de cada ID que falló:
    - `"Producto inexistente"` (cuando DummyJSON devuelve HTTP `404`).
    - `"El catálogo no respondió a tiempo"` (cuando se cumple el timeout de `AbortSignal.timeout`).
    - `"El producto ya esta en la lista"` (cuando el ID ya había sido agregado).
  - **Los demás participantes y la pantalla:** **no reciben ningún mensaje de error ajeno**; únicamente ven actualizarse la lista en vivo con los productos que efectivamente se agregaron.

- **Cuando el catálogo tarda (catálogo lento):**
  - **Quien hizo la propuesta:** espera la respuesta de su consulta asíncrona hasta que el catálogo conteste o venza el timeout de 3000 ms.
  - **Los demás participantes y la pantalla:** **no sufren ningún bloqueo**. Como la consulta usa `fetch` asíncrono no bloqueante sobre el event loop de Node.js, mientras esa promesa está pendiente el servidor sigue procesando votos, quitas, mensajes de chat y nuevas conexiones en tiempo real con total normalidad.

---

## 5. WebSocket vs. Server-Sent Events (SSE) vs. Polling

### ¿Por qué los participantes usan WebSocket y la pantalla usa SSE?
- **Participantes → WebSocket:** Los participantes tienen una interacción **bidireccional** constante. Necesitan enviar acciones al servidor en cualquier momento (`join`, `get_product`, `vote`, `unvote`, `remove`, `chat`) y recibir tanto respuestas individuales (`joined`, `product_result`, `error`) como actualizaciones globales (`productos`, `participantes`, `chat`) con mínima latencia sobre una única conexión persistente.
- **Pantalla → Server-Sent Events (SSE):** La pantalla compartida es un cliente **exclusivamente de lectura** (*unidireccional*: Servidor → Cliente) que nunca envía datos al servidor. SSE (`EventSource`) es ideal para este caso porque funciona sobre HTTP estándar, es más simple y liviano que levantar un canal bidireccional innecesario, y el navegador gestiona la reconexión automática de forma nativa si se corta momentáneamente la red.

### ¿Qué cambiaría si la pantalla usara *polling*?
Si la pantalla usara *polling* (por ejemplo, un `setInterval` haciendo `fetch("/api/ranking")` cada 2 o 5 segundos):
1. **Mayor latencia (sin tiempo real verdadero):** Los votos o cambios en los participantes no se verían al instante, sino con una demora de hasta el intervalo configurado.
2. **Tráfico y carga innecesaria en el servidor:** Si nadie vota ni entra durante 10 minutos, la pantalla seguiría enviando cientos de peticiones HTTP redundantes con sus respectivos headers, consumiendo recursos en vano. Con SSE, el servidor envía bytes **únicamente cuando ocurre un cambio real** en el estado.

---

## 6. Evidencia y Demostración

Los videos de prueba se encuentran incluidos en la carpeta [`./evidencia/`](./evidencia/):

### 1. Sincronización en tiempo real: 3 participantes (WebSocket) + Pantalla de Ranking (SSE)
- **Archivo:** [`evidencia/demo-sincronizacion.mp4`](./evidencia/demo-sincronizacion.mp4)
- **Qué demuestra:**
  - Ingreso de 3 participantes (`Agus`, `Jose`, `Anaa`) y actualización en vivo de la lista de conectados.
  - Propuesta simultánea de múltiples productos (`1, 4, 6`, `78`, `123, 7`) consultando DummyJSON.
  - Votación, retiro de votos y reordenamiento automático del ranking tanto en los participantes como en la pantalla SSE (`/pantalla`).
  - Validación de permisos al quitar un producto: rechazo con error cuando otro participante intenta eliminar un producto ajeno (`"Solo quien lo propuso puede quitarlo"`) y eliminación exitosa por parte de quien lo propuso.

<video src="./evidencia/demo-sincronizacion.mp4" controls width="100%"></video>

### 2. Propuesta múltiple con fallos parciales (producto repetido + producto inexistente)
- **Archivo:** [`evidencia/demo-pruebas.mp4`](./evidencia/demo-pruebas.mp4)
- **Qué demuestra:**
  - Propuesta conjunta de `1, 2, 99999`.
  - El producto válido (`#2 Eyeshadow Palette with Mirror`) se agrega a la lista compartida y a la pantalla SSE para todos los usuarios.
  - Únicamente quien realizó la propuesta recibe el detalle de cada fallo individual (`Producto 1: El producto ya esta en la lista` y `Producto 99999: Producto inexistente`), sin afectar ni mostrar errores a los demás participantes.

<video src="./evidencia/demo-pruebas.mp4" controls width="100%"></video>
