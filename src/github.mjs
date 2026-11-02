// Lee la actividad pública de un usuario de GitHub y la reduce a hechos independientes.
// Cada hecho es una unidad suelta: nada aquí describe relaciones entre hechos.

const API = "https://api.github.com";
const MS_DIA = 24 * 60 * 60 * 1000;

async function api(ruta, token) {
  const r = await fetch(`${API}${ruta}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "cierre-de-turno",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  return r.json();
}

export async function hechosDe(usuario, token) {
  const respuesta = await api(`/users/${encodeURIComponent(usuario)}/events/public?per_page=100`, token);
  if (respuesta === null) throw new Error("No encontramos ese usuario de GitHub.");
  const eventos = respuesta ?? [];
  // Ventana de 3 días: la gente no trabaja todos los días y el demo tampoco puede
  // depender de que alguien haya empujado código en las últimas 24 horas.
  const ahora = Date.now();
  const desde = ahora - MS_DIA * 3;
  const hechos = [];
  const vistos = new Set();

  const agregar = (tipo, titulo, cuando) => {
    if (!titulo || vistos.has(titulo)) return;
    vistos.add(titulo);
    hechos.push({ tipo, titulo, hace: Math.max(0, Math.round((ahora - cuando) / 3600000)) });
  };

  for (const e of eventos) {
    const fecha = new Date(e.created_at).getTime();
    if (fecha < desde) continue;
    const pieza = e.payload?.pull_request ?? e.payload?.issue;
    const titulo = pieza?.title ?? "";
    switch (e.type) {
      case "PullRequestEvent":
        if (e.payload.action === "closed" && pieza.merged) agregar("cerrado", titulo, fecha);
        else if (e.payload.action === "opened") agregar("abierto", titulo, fecha);
        break;
      case "PullRequestReviewEvent":
        agregar("revision", titulo, fecha);
        break;
      case "IssuesEvent":
        if (e.payload.action === "closed") agregar("cerrado", titulo, fecha);
        else if (e.payload.action === "opened") agregar("abierto", titulo, fecha);
        break;
      case "PushEvent":
        agregar("trabajo", e.repo?.name?.split("/")[1] ?? "", fecha);
        break;
      case "IssueCommentEvent":
        agregar("comentario", titulo, fecha);
        break;
      default:
        break;
    }
  }

  // Lo más reciente primero: el corte a 5 debe quedarse con lo de hoy, no con lo que
  // la API devuelva primero.
  hechos.sort((a, b) => a.hace - b.hace);

  // Lo atascado viene de otra consulta: lo más viejo que sigue abierto.
  const atascado = await prAtascado(usuario, token);
  return { hechos: hechos.slice(0, 5), atascado };
}

async function prAtascado(usuario, token) {
  const consulta = encodeURIComponent(`is:open is:pr author:${usuario}`);
  const r = await api(`/search/issues?q=${consulta}&sort=created&order=asc&per_page=1`, token);
  const item = r?.items?.[0];
  if (!item) return null;
  // El retraso se mide desde la última actividad, no desde que se abrió: un PR que
  // recibió push o comentario ayer no está "sin avance".
  const ultimo = new Date(item.updated_at ?? item.created_at).getTime();
  const dias = Math.max(1, Math.round((Date.now() - ultimo) / MS_DIA));
  // Más de dos meses sin tocarse no es "atascado", es abandonado: no entra en la nota.
  if (dias > 60) return null;
  const cuanto = dias === 1 ? "un día" : `${dias} días`;
  return { titulo: item.title, cuanto, dias, url: item.html_url };
}
