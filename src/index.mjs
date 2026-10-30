import { hechosDe } from "./github.mjs";
import { armarNota } from "./nota.mjs";
import { modeloDe } from "./modelo.mjs";
import { porQueAtascado, bloqueoDeEstado } from "./contexto.mjs";
import { verificarPago, crearLicencia, precio } from "./licencia.mjs";
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
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" }, ...cors() });
      return comprar(request, env);
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

function json(datos, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Compra: entra el pago x402 en el encabezado X-PAYMENT, se verifica y liquida
// on-chain vía facilitador, y sale un token de licencia ligado a la wallet que pagó.
async function comprar(request, env) {
  if (!env.LICENCIAS) {
    return json({ error: "La tienda no está disponible en este momento." }, 503);
  }
  const pago = request.headers.get("X-PAYMENT");
  const wallet = await verificarPago(env, pago);
  if (!wallet) {
    return json(
      {
        error: "No se verificó el pago.",
        como_pagar:
          "El pago es por el protocolo x402 (USDC en Base mainnet). Con una wallet que lo hable (o con x402-fetch), haz POST a /api/comprar y el pago viaja en el encabezado X-PAYMENT.",
        precio: precio(),
        payTo: env.PAY_TO_WALLET ?? null,
      },
      402
    );
  }
  const token = await crearLicencia(env, wallet);
  return json({ licencia: token, wallet, precio: precio(), como_usar: { "x-license": token } });
}

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let salida = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    salida += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(salida);
}
