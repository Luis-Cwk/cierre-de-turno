// Convierte hechos sueltos en el guion de la nota.
// Regla central del proyecto: las oraciones son MARCOS que nosotros escribimos, y el modelo
// solo produce la frase nominal del medio. Así el verbo nunca se invierte y no puede inventar
// relaciones entre hechos.

const FRASES_NOMINALES = `Convierte cada título técnico de software en una frase nominal corta en español, para decirlo en voz alta.
- Entre 4 y 8 palabras, con artículo inicial, empezando con minúscula.
- Traduce de forma natural, nunca palabra por palabra. Mantén los nombres propios (Kitty, React, npm, x402).
- Sin verbo conjugado, sin comillas, sin punto final, sin tecnicismos innecesarios.
Devuelve UNA línea por título, en el mismo orden, sin numerar, sin nada más.
Ejemplos:
"fix: el login fallaba en Safari" → "el login que fallaba en Safari"
"Kitty keyboard auto-detect reply is echoed and can leak to the shell" → "el eco del teclado Kitty que se filtra al shell"
"feat: MergeInsertions" → "la fusión de inserciones"`;

// Si el modelo inventa una relación causal, se manda a parar o se desvía del título, se descarta
// y queda el título recortado. El cierre es lo único que puede mandar a apagar.
const RECHAZO = /\b(porque|depende de|ya que|para que|debido a|gracias a|por lo tanto|entonces|mientras que|cierra|apaga|desconecta|abre|empieza)\b/i;

// Cada hecho trae su antigüedad en horas (github.mjs). El tiempo va al inicio de la
// frase para que la nota distinga lo de hoy de lo de hace dos días y no repita el
// mismo guion como si todo hubiera pasado hoy.
const cuandoDe = (hace) => {
  if (hace == null) return "Hoy";
  if (hace <= 24) return "Hoy";
  if (hace <= 48) return "Ayer";
  return `Hace ${Math.round(hace / 24)} días`;
};

const MARCOS = {
  cerrado: (np, t) => (t ? `${t} cerraste ${np}.` : `Cerraste ${np}.`),
  abierto: (np, t) => (t ? `${t} abriste ${np}.` : `Abriste ${np}.`),
  revision: (np, t) => (t ? `${t} revisaste ${np}.` : `Revisaste ${np}.`),
  comentario: (np, t) => (t ? `${t} comentaste en ${np}.` : `Comentaste en ${np}.`),
  trabajo: (np, t) => (t ? `${t} subiste cambios en ${np}.` : `Subiste cambios en ${np}.`),
};

// El cierre es UNA sola oración: el validador corta en el último punto y todo lo que
// esté antes no puede mandar a parar. Con dos oraciones se rompe esa regla.
const CIERRES = {
  normal: [
    "Ya puedes apagar la laptop.",
    "Esto es todo por hoy, cierra la laptop.",
    "Ya terminaste por hoy, apaga cuando quieras.",
  ],
  flojo: [
    "Hoy no era día de cerrar cosas, y también cuenta.",
    "Hoy no se cerró nada, y eso también cuenta.",
    "Hoy fue un día de sostener, no de cerrar.",
  ],
  // Días sin actividad pública nueva: la nota lo dice en vez de repetir lo viejo.
  sin_hoy: [
    "Hoy no quedó rastro público y el día se cierra igual.",
    "Hoy no hubo actividad pública, pero el día se acaba igual.",
    "Hoy no se movió nada en público, y el día se cierra igual.",
  ],
  vacio: ["Hoy no se ve nada que cerrar, igual cierra la laptop, que mañana sigue."],
};

// El artículo inicial baja a minúscula porque el marco ya trae el verbo.
const limpiar = (t) => {
  const s = t.replace(/[\s:,.\-–`"'“”]+$/, "");
  return /^(El|La|Los|Las|Un|Una)\s/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
};

// Si el modelo falla, queda el título recortado para que se pueda decir en voz alta.
const respaldo = (t) => limpiar(String(t).split(/\s+/).slice(0, 6).join(" "));

// Un solo llamado para todos los títulos: el modelo local atiende de a una petición,
// así que pedirlos uno por uno cuesta un segundo por hecho.
export async function frasesNominales(titulos, modelo) {
  if (titulos.length === 0) return [];
  const entrada = titulos.map((t, i) => `${i + 1}. ${t}`).join("\n");
  let contenido = "";
  try {
    contenido = await modelo.preguntar(FRASES_NOMINALES, entrada);
  } catch {
    return titulos.map(respaldo);
  }
  const lineas = String(contenido ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  if (lineas.length !== titulos.length) return titulos.map(respaldo);
  return titulos.map((t, i) => {
    const s = limpiar(lineas[i]);
    const palabras = s.split(/\s+/).filter(Boolean).length;
    return !s || palabras < 2 || palabras > 10 || RECHAZO.test(s) ? respaldo(t) : s;
  });
}

const ORDEN = { cerrado: 0, revision: 1, comentario: 2, trabajo: 3, abierto: 4 };

export async function armarNota({ hechos, atascado, bloqueo }, modelo) {
  if (hechos.length === 0 && !atascado) {
    return { guion: CIERRES.vacio[0], manana: null, frases: [] };
  }

  const ordenados = [...hechos].sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);

  // Lo que se reescribe: todo menos el nombre del repositorio, que es un identificador.
  const aReescribir = ordenados.filter((h) => h.tipo !== "trabajo").map((h) => h.titulo);
  const posicionAtascado = atascado ? aReescribir.length : -1;
  if (atascado) aReescribir.push(atascado.titulo);
  const np = await frasesNominales(aReescribir, modelo);

  const frases = [];
  let k = 0;
  let ultimoTiempo = null;
  for (const h of ordenados) {
    // El tiempo se dice una vez por bloque: "Hoy cerraste A. Cerraste B." y no
    // "Hoy cerraste A. Hoy cerraste B." que suena a relleno.
    const t = cuandoDe(h.hace);
    const repetido = t === ultimoTiempo;
    frases.push(MARCOS[h.tipo](h.tipo === "trabajo" ? h.titulo : np[k++], repetido ? "" : t));
    ultimoTiempo = t;
  }

  let manana = null;
  if (atascado) {
    // Un PR de ayer no está atascado: solo se marca el retraso cuando ya son varios días.
    const retraso = atascado.dias >= 3 ? `, sin avance desde hace ${atascado.cuanto}` : "";
    // Firecrawl aporta qué lo frenó: es lo que hace la frase concreta en vez de un resumen.
    const espera = bloqueo ? `, esperando ${bloqueo}` : "";
    // "Queda pendiente" no concuerda en género con la frase nominal, que puede ser
    // masculina o femenina según el título del PR.
    frases.push(`Queda pendiente ${np[posicionAtascado]}${retraso}${espera}.`);
    manana = "Y mañana empiezas por ahí.";
  }

  const hoy = hechos.filter((h) => (h.hace ?? 999) <= 24);
  const hayCierreHoy = hoy.some((h) => h.tipo === "cerrado");
  const tipo = hayCierreHoy ? "normal" : hoy.length > 0 ? "flojo" : "sin_hoy";
  const dia = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const cierre = CIERRES[tipo][dia % CIERRES[tipo].length];

  return { guion: [...frases, manana, cierre].filter(Boolean).join(" "), manana, frases };
}
