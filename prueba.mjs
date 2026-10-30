// Prueba rápida contra el servidor local: node prueba.mjs usuario1 usuario2 ...
// Falla si el guión viene vacío, se le cuela una relación causal, manda a parar
// fuera del cierre o no cierra con punto.

const CAUSAL = /\b(porque|depende de|ya que|para que|debido a|gracias a|por lo tanto|entonces|mientras que)\b/i;
const MANDATO = /\b(cierra|apaga|desconecta)\b/i;

const usuarios = process.argv.slice(2);
if (usuarios.length === 0) {
  console.log("Uso: node prueba.mjs <usuario-github>...");
  process.exit(0);
}

let fallos = 0;
for (const usuario of usuarios) {
  const r = await fetch(process.env.URL_API ?? "https://cierre-de-turno.petrasynthetic.workers.dev/api/nota", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario }),
  });
  const datos = await r.json();
  if (!r.ok) {
    console.log(`✗ ${usuario}: ${datos.error}\n`);
    fallos++;
    continue;
  }

  const guion = datos.guion ?? "";
  // El cierre es la última oración: fuera de ahí no se manda a parar.
  const oraciones = guion.split(/(?<=\.)\s+/).filter(Boolean);
  const cuerpo = oraciones.slice(0, -1).join(" ");
  const problemas = [];
  if (guion.length < 20) problemas.push("guion vacío");
  if (!guion.endsWith(".")) problemas.push("no cierra con punto");
  if (CAUSAL.test(guion)) problemas.push("relación causal inventada");
  if (MANDATO.test(cuerpo)) problemas.push("manda a parar antes del cierre");

  console.log((problemas.length === 0 ? "✓ " : "✗ ") + usuario + (problemas.length ? ": " + problemas.join(", ") : ""));
  console.log(`  ${guion}\n`);
  if (problemas.length > 0) fallos++;
}

process.exit(fallos === 0 ? 0 : 1);
