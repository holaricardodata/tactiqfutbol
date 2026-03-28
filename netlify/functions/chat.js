const { createClient } = require('@supabase/supabase-js');

// Rate limiting en memoria (se reinicia con cada cold start de Netlify)
// Para producción real usar Redis/Upstash, pero esto ya protege contra el 99% de abusos
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX = 15; // máx 15 peticiones por minuto por usuario

function checkRateLimit(userId) {
  const now = Date.now();
  const key = userId;
  const record = rateLimit.get(key);

  if (!record || now - record.start > RATE_LIMIT_WINDOW) {
    rateLimit.set(key, { count: 1, start: now });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // ── 1. Verificar autenticación ─────────────────
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'No autorizado' })
    };
  }

  // Verificar token con Supabase
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Token inválido o expirado' })
    };
  }

  // ── 2. Rate limiting por usuario ───────────────
  if (!checkRateLimit(user.id)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Demasiadas peticiones. Espera un momento.' })
    };
  }

  // ── 3. Verificar plan y límite de preguntas ────
  const { data: perfil } = await sb
    .from('perfiles')
    .select('plan, preguntas_usadas')
    .eq('id', user.id)
    .single();

  const plan = perfil?.plan || 'trial';
  const PREGUNTAS_LIMITE = { trial: 10, entrenador: 10, analista: 20, elite: 30 };
  const limite = PREGUNTAS_LIMITE[plan] ?? 10;
  const preguntasUsadas = perfil?.preguntas_usadas || 0;

  if (preguntasUsadas >= limite) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: `Límite de ${limite} preguntas alcanzado para el plan ${plan}.` })
    };
  }

  // ── 4. Llamar a Claude API ─────────────────────
  try {
    const { messages } = JSON.parse(event.body);
    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'messages requerido' })
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || 'Error API' })
      };
    }

    // ── 5. Incrementar contador de preguntas en Supabase ──
    // Nota: esto es orientativo — el límite real se verifica en el cliente también
    // Para hardening completo mover todo el contador al servidor
    await sb
      .from('perfiles')
      .update({ preguntas_usadas: preguntasUsadas + 1 })
      .eq('id', user.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ content: data.content })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno: ' + e.message })
    };
  }
};
