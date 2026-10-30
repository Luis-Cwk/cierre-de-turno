// El transporte del modelo. Un solo punto para que el núcleo no sepa dónde corre:
// en producción llama a Gemma 4 en Workers AI (dentro del mismo Worker), y en local
// llama a Ollama en la máquina.

export function modeloDe(env) {
  return {
    async preguntar(sistema, usuario) {
      return env.AI ? conWorkersAi(env, sistema, usuario) : conOllama(env, sistema, usuario);
    },
  };
}

async function conWorkersAi(env, sistema, usuario) {
  const r = await env.AI.run(env.LLM_MODEL ?? "@cf/google/gemma-4-26b-a4b-it", {
    messages: [
      { role: "system", content: sistema },
      { role: "user", content: usuario },
    ],
    // Gemma 4 razona antes de contestar y con presupuesto corto se queda solo pensando.
    // Con esto se contesta de frente y en una pasada.
    chat_template_kwargs: { enable_thinking: false },
    max_tokens: 400,
    temperature: 0.4,
  });
  // Workers AI contesta con forma de OpenAI, Ollama con la suya.
  return r?.choices?.[0]?.message?.content ?? r?.response ?? "";
}

async function conOllama(env, sistema, usuario) {
  const r = await fetch(`${env.OLLAMA_URL ?? "http://127.0.0.1:11434"}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.LLM_MODEL ?? "gemma4:e4b",
      stream: false,
      // Sin esto gemma4 se come el presupuesto pensando en voz alta y devuelve vacío.
      think: false,
      options: { temperature: 0.4, num_predict: 300 },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
    }),
  });
  const j = await r.json();
  return j.message?.content ?? "";
}
