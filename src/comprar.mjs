// La tienda. Sin pago responde 402 con los requisitos en el encabezado PAYMENT-REQUIRED
// (forma estándar x402), para que cualquier wallet o cliente x402 pague sin leer nada.
// Con el pago en X-PAYMENT se verifica y liquida on-chain, y sale el token de licencia.

import { verificarPago, crearLicencia, precio } from "./licencia.mjs";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export async function comprar(request, env, json) {
  if (!env.LICENCIAS) {
    return json({ error: "La tienda no está disponible en este momento." }, 503);
  }
  const requisitos = requisitosDe(env);

  if (request.method === "GET") {
    return json(
      {
        error: "Se requiere pago.",
        como_pagar:
          "Con un cliente x402 (x402-fetch, Dexter, tu agente): esta respuesta lleva los requisitos en el encabezado PAYMENT-REQUIRED; paga y reintenta con el encabezado X-PAYMENT.",
        precio: precio(),
        payTo: env.PAY_TO_WALLET,
        docs: "https://github.com/Luis-Cwk/cierre-de-turno/blob/main/docs/mcp.md",
      },
      402,
      { "PAYMENT-REQUIRED": btoa(JSON.stringify({ x402Version: 1, accepts: [requisitos] })) }
    );
  }

  const wallet = await verificarPago(env, request.headers.get("X-PAYMENT"));
  if (!wallet) {
    return json(
      {
        error: "No se verificó el pago.",
        como_pagar: "El pago es por el protocolo x402 (USDC en Base mainnet): paga los requisitos del 402 y reintenta con el encabezado X-PAYMENT.",
        precio: precio(),
        payTo: env.PAY_TO_WALLET,
      },
      402,
      { "PAYMENT-REQUIRED": btoa(JSON.stringify({ x402Version: 1, accepts: [requisitos] })) }
    );
  }

  const token = await crearLicencia(env, wallet);
  return json({ licencia: token, wallet, precio: precio(), como_usar: { "x-license": token } });
}

function requisitosDe(env) {
  return {
    scheme: "exact",
    network: "base",
    maxAmountRequired: (Number(precio()) * 1e6).toString(),
    payTo: env.PAY_TO_WALLET,
    asset: USDC_BASE,
    description: "Cierre de turno: licencia de por vida del MCP (pago único)",
    mimeType: "application/json",
    maxTimeoutSeconds: 120,
    extra: { name: "USDC", version: "2" },
  };
}
