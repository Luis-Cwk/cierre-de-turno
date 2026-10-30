# MCP de Cierre de turno

Un servidor MCP con una sola herramienta para cerrar el día de trabajo desde el editor o el agente que ya uses. No hay cuenta, no hay contraseña, no hay SDK que instalar: solo una URL y una licencia.

## Endpoint

```
https://cierre-de-turno.petrasynthetic.workers.dev/mcp
```

En local, mientras se desarrolla: `http://127.0.0.1:8787/mcp`.

## Precio y licencia

El MCP funciona con **pago único de 5 USDC en Base mainnet** (protocolo x402, sin suscripción). La web es gratis; el MCP es la versión para tu editor.

1. Desde una wallet o cliente que hable x402 (x402-fetch, Dexter, tu agente), haz `POST https://cierre-de-turno.petrasynthetic.workers.dev/api/comprar`: el pago viaja en el encabezado `X-PAYMENT`, se verifica y liquida on-chain, y la respuesta trae tu licencia.
2. Agrega el token como encabezado en la conexión del MCP:

```jsonc
{
  "mcpServers": {
    "cierre-de-turno": {
      "url": "https://cierre-de-turno.petrasynthetic.workers.dev/mcp",
      "headers": { "x-license": "ct_tu_token_aqui" }
    }
  }
}
```

La licencia no caduca y funciona en cualquier editor. Tiene un tope de 200 llamadas al mes para mantener el servicio vivo; se reanuda el primer día del mes.

## Herramientas

| Nombre | Para qué sirve | Argumentos | Devuelve |
|---|---|---|---|
| `generar_cierre` | Genera la nota que cierra el día de un desarrollador con su actividad pública de GitHub: qué cerró, qué quedó abierto y por dónde empezar mañana | `usuario` (string, requerido): usuario de GitHub público, sin la arroba | Una frase en español lista para decir en voz alta |

La herramienta es de solo lectura e idempotente: llamarla dos veces con el mismo usuario devuelve lo mismo, no cambia nada.

## Cómo conectar

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "cierre-de-turno": {
      "url": "https://cierre-de-turno.petrasynthetic.workers.dev/mcp",
      "headers": { "x-license": "ct_tu_token_aqui" }
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add --transport http cierre-de-turno https://cierre-de-turno.petrasynthetic.workers.dev/mcp \
  --header "x-license: ct_tu_token_aqui"
```

**OpenCode** (`opencode.jsonc`):

```jsonc
{
  "mcp": {
    "cierre-de-turno": {
      "type": "remote",
      "url": "https://cierre-de-turno.petrasynthetic.workers.dev/mcp",
      "headers": { "x-license": "ct_tu_token_aqui" },
      "enabled": true
    }
  }
}
```

## Probarlo sin cliente

```bash
curl -X POST https://cierre-de-turno.petrasynthetic.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

Y luego una llamada real:

```bash
curl -X POST https://cierre-de-turno.petrasynthetic.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"generar_cierre","arguments":{"usuario":"octocat"}}}'
```

## Errores y qué hacer

| Código | Qué significa | Qué hace el cliente |
|---|---|---|
| `USUARIO_INVALIDO` | El dato no es un usuario de GitHub | Pedirlo sin la arroba y volver a llamar |
| `USUARIO_NO_ENCONTRADO` | Ese usuario no existe | Pedir el usuario exacto |
| `SIN_ACTIVIDAD` | No hay actividad pública en los últimos tres días | Decirlo así, y ofrecer igual la frase de cierre |
| `SIN_LICENCIA` | Falta el encabezado `x-license` o el token no es válido | Mandar a https://cierre-de-turno.petrasynthetic.workers.dev y pedir que la agreguen a la conexión |
| `TOPE_ALCANZADO` | La licencia usó sus 200 llamadas del mes | Reanudar el primer día del mes siguiente |
| `FALLO_TEMPORAL` | Falló GitHub o el modelo | Esperar un momento y reintentar una sola vez |

## Límites conocidos

- Solo lee actividad **pública**. Los repositorios privados no aparecen, y eso está bien: la nota no debería contar lo que no es tuyo mostrar.
- La ventana son los últimos tres días, no las últimas veinticuatro horas, porque nadie trabaja todos los días.
- No guarda nada: cada llamada es independiente, sin historial ni base de datos. (El servicio sí guarda un hash de tu licencia y un contador de uso, para cobrar y aplicar el tope; nada sobre tus notas.)
