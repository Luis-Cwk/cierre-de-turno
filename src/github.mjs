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
  const desde = Date.now() - MS_DIA * 3;
  const hechos = [];
  const vistos = new Set();

  const agregar = (tipo, titulo) => {
    if (!titulo || vistos.has(titulo)) return;
    vistos.add(titulo);
    hechos.push({ tipo, titulo });
  };

  for (const e of eventos) {
    if (new Date(e.created_at).getTime() < desde) continue;
    const pieza = e.payload?.pull_request ?? e.payload?.issue;
    const titulo = pieza?.title ?? "";
    switch (e.type) {
      case "PullRequestEvent":
        if (e.payload.action === "closed" && pieza.merged) agregar("cerrado", titulo);
        else if (e.payload.action === "opened") agregar("abierto", titulo);
        break;
      case "PullRequestReviewEvent":
        agregar("revision", titulo);
        break;
      case "IssuesEvent":
        if (e.payload.action === "closed") agregar("cerrado", titulo);
        else if (e.payload.action === "opened") agregar("abierto", titulo);
        break;
      case "PushEvent":
        agregar("trabajo", e.repo?.name?.split("/")[1] ?? "");
        break;
      case "IssueCommentEvent":
        agregar("comentario", titulo);
        break;
      default:
        break;
    }
  }

  // Lo atascado viene de otra consulta: lo más viejo que sigue abierto.
  const atascado = await prAtascado(usuario, token);
  return { hechos: hechos.slice(0, 5), atascado };
}

async function prAtascado(usuario, token) {
  const consulta = encodeURIComponent(`is:open is:pr author:${usuario}`);
  const r = await api(`/search/issues?q=${consulta}&sort=created&order=asc&per_page=1`, token);
  const item = r?.items?.[0];
  if (!item) return null;
  const dias = Math.max(1, Math.round((Date.now() - new Date(item.created_at).getTime()) / MS_DIA));
  // Más de dos meses sin avance no es "atascado", es abandonado: no entra en la nota.
  if (dias > 60) return null;
  const cuanto = dias === 1 ? "un día" : `${dias} días`;
  return { titulo: item.title, cuanto, dias, url: item.html_url };
}
