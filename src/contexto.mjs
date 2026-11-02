// Lee con Firecrawl la conversación del PR atascado y saca qué lo está frenando.
// Es la diferencia entre decir "sigue abierto X" y "sigue abierto X, esperando los tests".

const RECHAZO = /\b(porque|depende de|ya que|para que|debido a|gracias a|por lo tanto|entonces|mientras que|cierra|apaga|desconecta)\b/i;

export const EXTRACCION = `Mira el estado de este pull request de GitHub y dime qué lo está frenando para fusionarse.
Aplica estas reglas en orden y quédate con la primera que se cumpla:
1. Si el estado pide revisión de código o hay revisores pendientes → "una revisión de código"
2. Si hay comprobaciones o tests fallando → "los tests que fallan"
3. Si hay conflictos de fusión → "los conflictos de fusión"
4. Si en la conversación alguien pidió un cambio o una respuesta → eso, en una frase nominal
5. Si ninguna de las anteriores se cumple → "ninguna"
La respuesta es una frase nominal corta en español, de máximo 8 palabras, sin verbos conjugados, empezando con minúscula.
Ejemplos: "una revisión de código", "una respuesta del equipo de plataforma", "los conflictos de fusión", "los tests que fallan".
No inventes causas ni nombres que no aparezcan en la página.`;

// Detección determinista del bloqueo: sale del estado del PR en la API de GitHub,
// no del modelo, así que siempre devuelve la misma frase para el mismo PR.
// Solo las causas que la API declara en campos exactos, sin adivinar.
export async function bloqueoDeEstado(url, token) {
  const m = String(url ?? "").match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  const gh = (ruta) =>
    fetch(`https://api.github.com${ruta}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "cierre-de-turno",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  try {
    const r = await gh(`/repos/${m[1]}/${m[2]}/pulls/${m[3]}`);
    if (!r.ok) return null;
    const pr = await r.json();
    if (pr.mergeable_state === "dirty") return "los conflictos de fusión";
    if (pr.draft) return "su salida de borrador";
    if (pr.requested_reviewers?.length) return "una revisión de código";
    if (pr.mergeable_state === "unstable") {
      // "unstable" puede ser un test que falla o un test que todavía no corre.
      // Se distinguen con los checks del commit: fallo real contra pendiente.
      const sha = pr.head?.sha;
      if (sha) {
        const [ch, st] = await Promise.all([
          gh(`/repos/${m[1]}/${m[2]}/commits/${sha}/check-runs`),
          gh(`/repos/${m[1]}/${m[2]}/commits/${sha}/status`),
        ]);
        const checks = ch.ok ? await ch.json() : null;
        const status = st.ok ? await st.json() : null;
        const fallo =
          (checks?.check_runs ?? []).some((c) => c.conclusion === "failure" || c.conclusion === "timed_out") ||
          (status?.statuses ?? []).some((s) => s.state === "failure" || s.state === "error");
        if (fallo) return "los tests que fallan";
        const pendiente =
          (checks?.check_runs ?? []).some((c) => c.status === "queued" || c.status === "in_progress") ||
          status?.state === "pending";
        if (pendiente) return "los tests que aún no corren";
        // Todo verde y mergeable: no hay test ni revisión pendiente, solo la fusión.
        return "una decisión de quien mantiene el repo";
      }
    }
    if (pr.mergeable_state === "blocked") return "una revisión de código";
    return null;
  } catch {
    return null;
  }
}

export async function porQueAtascado(url, apiKey, modelo) {
  if (!url || !apiKey) return null;

  let markdown = "";
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"] }),
    });
    if (!r.ok) return null;
    markdown = (await r.json())?.data?.markdown ?? "";
  } catch {
    return null;
  }
  if (!markdown) return null;

  let salida = "";
  try {
    // El markdown de una página de PR es largo: se corta a lo que importa, la conversación.
    salida = await modelo.preguntar(EXTRACCION, markdown.slice(0, 8000));
  } catch {
    return null;
  }

  const frase = String(salida ?? "").trim().replace(/^["'“”]+|["'“”]+$/g, "").replace(/[.]+$/, "");
  const palabras = frase.split(/\s+/).filter(Boolean).length;
  if (!frase || /^ninguna$/i.test(frase) || palabras < 2 || palabras > 10 || RECHAZO.test(frase)) return null;
  return /^(El|La|Los|Las|Un|Una)\s/.test(frase) ? frase.charAt(0).toLowerCase() + frase.slice(1) : frase;
}
