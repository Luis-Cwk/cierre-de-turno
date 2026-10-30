// La cerradura comercial: pago único por x402 en USDC de Base mainnet y una
// licencia ligada a la wallet que pagó. En KV solo vive un hash del token:
// si el KV se compromete, no sirve para falsificar licencias.

import { sha256 } from "./hash.mjs";

// Precio único. No hay suscripción: se vende una vez.
const PRECIO_USDC = "5";

// Dexter: facilitador público y gratuito para Base mainnet, sin cuenta ni llave.
// Verificación y liquidación vía https://x402.dexter.cash.
const X402_VERIFICA = "https://x402.dexter.cash/verify";
const X402_LIQUIDA = "https://x402.dexter.cash/settle";

export function precio() {
  return PRECIO_USDC;
}

// La llave de licencia es un identificador que el cliente pega en su editor:
// x-license: <token>
export async function crearLicencia(env, wallet) {
  const token = `ct_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const huella = await sha256(token);
  // La wallet que pagó es la identidad de la licencia; el token es la credencial.
  await env.LICENCIAS.put(`lic:${huella}`, JSON.stringify({ wallet, creado: Date.now() }));
  return token;
}

export async function licenciaValida(env, token) {
  if (!token) return null;
  const huella = await sha256(token);
  const crudo = await env.LICENCIAS.get(`lic:${huella}`);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo);
  } catch {
    return null;
  }
}

// Verifica el pago x402 y lo liquida on-chain. Devuelve la wallet que pagó o null.
// Facilitador por defecto: Dexter (público, gratuito, Base mainnet). Si algún día
// se cambia a CDP u otro, basta con poner X402_VERIFICA_URL y X402_SETTLE_URL.
// El pago acepta esquema exact sobre Base con USDC (EIP-3009), igual que el flujo
// que ya corre en entropia. La red se valida contra Base mainnet, sin testnets.
export async function verificarPago(env, encabezadoPago) {
  if (!encabezadoPago) return null;
  const pago = decodificarPago(encabezadoPago);
  if (!pago) return null;
  // El cliente declara la red: solo aceptamos Base mainnet, sin atajos de testnet.
  if (!/base$|8453/i.test(pago?.scheme_info?.network ?? pago?.network ?? "")) return null;

  const cuerpo = {
    paymentHeader: encabezadoPago,
    paymentRequirements: requisitosPago(pago),
  };
  try {
    const verifica = await llamarFacilitador(env, env.X402_VERIFICA_URL ?? X402_VERIFICA, cuerpo);
    if (!verifica?.isValid) return null;
    const liquida = await llamarFacilitador(env, env.X402_SETTLE_URL ?? X402_LIQUIDA, cuerpo);
    if (!liquida?.success) return null;
    return liquida?.payer ?? verifica?.payer ?? pago?.from ?? null;
  } catch {
    return null;
  }
}

// El facilitador de mainnet exige credenciales del respaldo (x402 pro); si no hay
// llave, el pago no se puede verificar y la compra no concluye. Sin nada silencioso.
async function llamarFacilitador(env, url, cuerpo) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.X402_API_KEY ? { Authorization: `Bearer ${env.X402_API_KEY}` } : {}),
    },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) return null;
  return r.json();
}

function requisitosPago(pago) {
  return {
    scheme: "exact",
    network: "base",
    maxAmountRequired: (Number(PRECIO_USDC) * 1e6).toString(),
    payTo: pago?.to ?? "",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    extra: pago?.scheme_info?.extra ?? {},
  };
}

function decodificarPago(encabezado) {
  try {
    const crudo = encabezado.replace(/^X-PAYMENT:\s*/i, "");
    return JSON.parse(atob(crudo));
  } catch {
    return null;
  }
}

// Límite de uso por licencia, para que un comprador pesado no nos cueste más de lo que pagó.
// Mensual, en llamadas a generar_cierre. KV es eventualmente consistente: el límite
// es aproximado y puede pasarse por decenas bajo concurrencia extrema, no es una caja fuerte.
const TOPE_MENSUAL = 200;

export async function registrarUso(env, token) {
  if (!token) return { ok: true, restante: null };
  const huella = await sha256(token);
  const llave = `uso:${huella}:${new Date().toISOString().slice(0, 7)}`;
  const usados = Number(await env.LICENCIAS.get(llave) ?? 0);
  if (usados >= TOPE_MENSUAL) return { ok: false, restante: 0 };
  await env.LICENCIAS.put(llave, String(usados + 1), { expirationTtl: 60 * 60 * 24 * 40 });
  return { ok: true, restante: TOPE_MENSUAL - usados - 1 };
}
