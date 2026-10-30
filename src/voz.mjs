// Voz de la nota. Sin llave de ElevenLabs devuelve null y la nota queda en texto.

export async function sintetizar(guion, voz) {
  if (!voz.apiKey || !voz.voiceId) return null;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz.voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": voz.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: guion,
      model_id: voz.modelo ?? "eleven_multilingual_v2",
      language_code: "es",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 0.95 },
    }),
  });
  if (!r.ok) return null;
  return await r.arrayBuffer();
}
