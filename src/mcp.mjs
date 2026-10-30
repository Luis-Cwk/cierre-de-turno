// Servidor MCP sobre HTTP: una sola herramienta, `generar_cierre`.
// Es la envoltura delgada del núcleo (github.mjs + nota.mjs): la misma nota que
// sirve la página, disponible desde cualquier editor o agente que hable MCP.

import { hechosDe } from "./github.mjs";
import { armarNota } from "./nota.mjs";
import { modeloDe } from "./modelo.mjs";
import { porQueAtascado, bloqueoDeEstado } from "./contexto.mjs";
import { licenciaValida, registrarUso, precio } from "./licencia.mjs";

const PROTOCOLO = "2025-06-18";
const USUARIO = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

const HERRAMIENTA = {
  name: "generar_cierre",
  title: "Generar cierre de turno",
  description:
    "Genera la nota que cierra el día de trabajo de un desarrollador a partir de su actividad pública de GitHub: qué cerró, qué quedó abierto y por dónde empezar mañana. " +
    "Úsala cuando el usuario pida cerrar el día, resumir lo que hizo hoy, ver qué le quedó pendiente o pedir que le digan que ya puede parar. " +
    "Solo necesita su usuario de GitHub público: no lee repositorios privados ni pide contraseña. " +
    "El servicio es de pago único (" + precio() + " USDC): la licencia va en el encabezado x-license. " +
    "Errores y cómo recuperarse: " +
    "USUARIO_INVALIDO significa que el dato no es un usuario de GitHub; pídeselo sin la arroba y vuelve a llamar. " +
    "USUARIO_NO_ENCONTRADO significa que ese usuario no existe; pide el usuario exacto. " +
    "SIN_ACTIVIDAD significa que no hay actividad pública en los últimos tres días; díselo así y ofrécele igual la frase de cierre. " +
    "SIN_LICENCIA significa que falta el encabezado x-license o que el token no es válido; manda a https://cierre-de-turno.petrasynthetic.workers.dev y pide que lo agreguen a la conexión. " +
    "TOPE_ALCANZADO significa que la licencia llegó al tope mensual de llamadas; se reanuda el primer día del mes siguiente. " +
    "FALLO_TEMPORAL es un error pasajero de GitHub o del modelo; espera un momento y reintenta una sola vez.",
  inputSchema: {
    type: "object",
    properties: {
      usuario: {
        type: "string",
        description: "Usuario de GitHub público, sin la arroba. Ejemplo: octocat",
      },
    },
    required: ["usuario"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
};

export async function manejarMcp(request, env, tokenLicencia) {
  let rpc;
  try {
    rpc = await request.json();
  } catch {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }), {
      status: 400,
      headers: cabeceras(request),
    });
  }

  // Las notificaciones no llevan id y se confirman sin cuerpo.
  if (rpc?.id === undefined || rpc?.method?.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: cabeceras(request) });
  }

  const respuesta = await responder(rpc, env, tokenLicencia);
  return new Response(JSON.stringify(respuesta), { status: 200, headers: cabeceras(request) });
}

function cabeceras(request) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "MCP-Protocol-Version": PROTOCOLO,
    "Mcp-Session-Id": request.headers.get("Mcp-Session-Id") ?? crypto.randomUUID(),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function responder(rpc, env, tokenLicencia) {
  const { id, method, params } = rpc;
  const bien = (resultado) => ({ jsonrpc: "2.0", id, result: resultado });
  const mal = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

  switch (method) {
    case "initialize":
      return bien({
        protocolVersion: params?.protocolVersion ?? PROTOCOLO,
        capabilities: { tools: {} },
        serverInfo: { name: "cierre-de-turno", version: "1.1.0" },
        instructions:
          `Herramienta de cierre de turno para desarrolladores. Devuelve una nota breve en español para decir en voz alta. No es un diagnóstico ni consejo médico. ` +
          `El MCP funciona con pago único de ${precio()} USDC: la licencia va en el encabezado "x-license" de cada llamada.`,
      });
    case "tools/list":
      return bien({ tools: [HERRAMIENTA] });
    case "tools/call":
      return bien(await ejecutar(params, env, tokenLicencia));
    default:
      return mal(-32601, `Método no soportado: ${method}`);
  }
}

async function ejecutar(params, env, tokenLicencia) {
  const usuario = params?.arguments?.usuario;
  const salida = (text, isError = false) => ({ content: [{ type: "text", text }], isError });

  if (typeof usuario !== "string" || !USUARIO.test(usuario)) {
    return salida("ERROR: USUARIO_INVALIDO. El dato debe ser un usuario de GitHub sin la arroba.", true);
  }

  try {
    // La web es gratis; el MCP es el producto de pago. Sin licencia no corre.
    const licencia = await licenciaValida(env, tokenLicencia);
    if (!licencia) {
      return salida(
        `ERROR: SIN_LICENCIA. Este servicio funciona con pago único de ${precio()} USDC. Consigue tu licencia en https://cierre-de-turno.petrasynthetic.workers.dev y agrégala a la conexión del MCP como header "x-license" con el token que recibes al pagar.`,
        true
      );
    }
    const uso = await registrarUso(env, env.tokenLicencia);
    if (!uso.ok) {
      return salida(`ERROR: TOPE_ALCANZADO. Usaste las llamadas de este mes con tu licencia. Vuelve a llamar al inicio del próximo mes.`, true);
    }
    const datos = await hechosDe(usuario, env.GITHUB_TOKEN);
    if (datos.hechos.length === 0 && !datos.atascado) {
      return salida("SIN_ACTIVIDAD: no hay actividad pública en los últimos tres días de ese usuario.", true);
    }
    const modelo = modeloDe(env);
    const bloqueo = datos.atascado
      ? (await bloqueoDeEstado(datos.atascado.url, env.GITHUB_TOKEN)) ?? (await porQueAtascado(datos.atascado.url, env.FIRECRAWL_API_KEY, modelo))
      : null;
    const { guion } = await armarNota({ ...datos, bloqueo }, modelo);
    return salida(guion);
  } catch (e) {
    const mensaje = e?.message ?? "";
    const codigo = /No encontramos/.test(mensaje) ? "USUARIO_NO_ENCONTRADO" : "FALLO_TEMPORAL";
    return salida(`ERROR: ${codigo}. ${mensaje}`, true);
  }
}
