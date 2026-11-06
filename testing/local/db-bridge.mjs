/**
 * Runs a real PostgreSQL that the app's own driver can talk to, with no change
 * to any production file.
 *
 * The app uses @neondatabase/serverless, which speaks the Postgres wire
 * protocol over a WebSocket to Neon's proxy. There is no Neon here and no
 * outbound network, so this supplies both halves locally:
 *
 *   PGlite (PostgreSQL 18 compiled to WASM, in-process)
 *     -> PGLiteSocketServer, which speaks the real wire protocol over TCP
 *       -> this WebSocket-to-TCP bridge
 *         -> @neondatabase/serverless, pointed at it by neonConfig.wsProxy
 *
 * The alternative was an env-gated second driver inside server/db.ts. That
 * would have meant `export let db` with a union type across two drizzle
 * adapters, loosening the type that every storage query depends on, in a file
 * whose whole job is refusing to connect to the wrong database. This keeps
 * production code untouched and the test rig entirely outside it.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { WebSocketServer } from "ws";
import net from "net";

const TCP_PORT = Number(process.env.PGLITE_TCP_PORT ?? 55432);
const WS_PORT = Number(process.env.PGLITE_WS_PORT ?? 55433);
const DATA_DIR = process.env.PGLITE_DIR ?? undefined; // undefined = in-memory

export async function startDatabase() {
  const pglite = await PGlite.create(DATA_DIR);
  // maxConnections defaults to 1, and the app's pool opens several. With the
  // default, concurrent connections are dropped and every query fails with
  // "Connection terminated unexpectedly" -- which drizzle reports as a failed
  // query, so it reads like a schema problem rather than a transport one.
  // Above 1, pglite-socket multiplexes over its single underlying connection.
  const tcp = new PGLiteSocketServer({
    db: pglite,
    port: TCP_PORT,
    host: "127.0.0.1",
    maxConnections: Number(process.env.PGLITE_MAX_CONNECTIONS ?? 20),
  });
  await tcp.start();

  // The driver wants a WebSocket; PGLiteSocketServer offers TCP. Splice them.
  const wss = new WebSocketServer({ port: WS_PORT });
  wss.on("connection", (ws) => {
    const sock = net.connect(TCP_PORT, "127.0.0.1");
    const pending = [];
    let open = false;

    sock.on("connect", () => {
      open = true;
      for (const chunk of pending) sock.write(chunk);
      pending.length = 0;
    });
    // A client can send its startup packet before the TCP leg is up; buffer it
    // rather than dropping it, or the connection hangs at authentication.
    ws.on("message", (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (open) sock.write(buf);
      else pending.push(buf);
    });
    sock.on("data", (buf) => {
      if (ws.readyState === ws.OPEN) ws.send(buf);
    });

    const shut = () => {
      try { sock.destroy(); } catch {}
      try { ws.close(); } catch {}
    };
    ws.on("close", shut);
    ws.on("error", shut);
    sock.on("close", shut);
    sock.on("error", shut);
  });
  await new Promise((r) => wss.once("listening", r));

  return {
    pglite,
    url: `postgres://postgres:postgres@127.0.0.1:${TCP_PORT}/postgres`,
    wsPort: WS_PORT,
    async stop() {
      wss.close();
      await tcp.stop();
      await pglite.close();
    },
  };
}
