// Prueba de compra de punta a punta. Pago UNICO de 5 USDC en Base mainnet.
//
// Uso (PowerShell):
//   $env:LLAVE = "0x..."   (llave privada de la wallet que paga)
//   node prueba-compra.mjs
//
// Requisitos de la wallet: 5 USDC en Base (gas lo paga el facilitador,
// no hace falta ETH). Instala la dependencia si no la tienes: npm i x402-fetch

const URL_COMPRA = "https://cierre-de-turno.petrasynthetic.workers.dev/api/comprar";
const URL_NOTA = "https://cierre-de-turno.petrasynthetic.workers.dev/api/nota";

const { wrapFetchWithPayment, createSigner } = await import("x402-fetch");
const signer = await createSigner({ network: "base", privateKey: process.env.LLAVE });
const direccion = await signer.address ?? "ver consola";
console.log("pagando desde:", direccion);

// 1. POST con x402: el cliente lee el 402 con PAYMENT-REQUIRED, paga y reintenta solo.
const fetchPago = wrapFetchWithPayment(fetch, signer);
const r = await fetchPago(URL_COMPRA);
const datos = await r.json();

if (!datos.licencia) {
  console.error("fallo la compra:", JSON.stringify(datos, null, 2));
  process.exit(1);
}
console.log("");
console.log("COMPRA LIQUIDADA. licencia:", datos.licencia.slice(0, 18) + "...");
console.log("");

// 2. Prueba el MCP con la licencia: tools/call sin licencia da SIN_LICENCIA, con ella debe contestar.
const cuerpo = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "generar_cierre", arguments: { usuario: "Luis-Cwk" } } };
const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "x-license": datos.licencia };
const init = { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "prueba", version: "1.0" } } };
const initRes = await fetch("https://cierre-de-turno.petrasynthetic.workers.dev/mcp", { method: "POST", headers, body: JSON.stringify(init) });
const llama = await fetch("https://cierre-de-turno.petrasynthetic.workers.dev/mcp", { method: "POST", headers, body: JSON.stringify(cuerpo) });
const texto = await llama.text();
const nota = (texto.match(/"text":"(.*?)"/) ?? [])[1] ?? texto;
console.log("respuesta del MCP:");
console.log(" ", nota.replace(/\\n/g, " ").slice(0, 400));
