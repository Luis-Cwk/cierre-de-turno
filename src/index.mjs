import { hechosDe } from "./github.mjs";
import { armarNota } from "./nota.mjs";
import { modeloDe } from "./modelo.mjs";
import { porQueAtascado, bloqueoDeEstado } from "./contexto.mjs";
import { verificarPago, crearLicencia, precio } from "./licencia.mjs";
import { comprar as tienda } from "./comprar.mjs";
import { sha256 } from "./hash.mjs";
import { manejarMcp } from "./mcp.mjs";
import { sintetizar } from "./voz.mjs";

const USUARIO = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      return manejarMcp(request, env, request.headers.get("x-license"));
    }
    if (url.pathname === "/api/nota") {
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      return nota(request, env);
    }
    if (url.pathname === "/api/comprar") {
      if (request.method !== "POST" && request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET, POST" }, ...cors() });
      return tienda(request, env, json);
    }
    return new Response("No encontrado", { status: 404 });
  },
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function nota(request, env) {
  let usuario;
  try {
    ({ usuario } = await request.json());
  } catch {
    return json({ error: "Falta el usuario de GitHub." }, 400);
  }
  if (typeof usuario !== "string" || !USUARIO.test(usuario)) {
    return json({ error: "Ese usuario de GitHub no es válido." }, 400);
  }

  const modelo = modeloDe(env);

  try {
    const datos = await hechosDe(usuario, env.GITHUB_TOKEN);
    const bloqueo = datos.atascado
      ? (await bloqueoDeEstado(datos.atascado.url, env.GITHUB_TOKEN)) ?? (await porQueAtascado(datos.atascado.url, env.FIRECRAWL_API_KEY, modelo))
      : null;
    const { guion, manana } = await armarNota({ ...datos, bloqueo }, modelo);
    const audio = await sintetizar(guion, {
      apiKey: env.ELEVENLABS_API_KEY,
      voiceId: env.ELEVENLABS_VOICE_ID,
    });
    return json({ usuario, guion, manana, bloqueo, hechos: datos.hechos, atascado: datos.atascado, audio: audio ? base64(audio) : null });
  } catch (e) {
    return json({ error: e?.message ?? "Algo falló." }, 502);
  }
}

function json(datos, status = 200, extra = {}) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

// Compra: ver src/comprar.mjs (402 estándar x402 más liquidación y licencia).
async function comprar(request, env) {
  return tienda(request, env, json);
}

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let salida = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    salida += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(salida);
}
