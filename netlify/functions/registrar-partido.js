const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PLAN_LIMITES = { trial: 1, entrenador: 3, analista: 5, elite: 10 };

const ORIGIN = 'https://tactiqfutbol.es';

const headers = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // ── 1. Auth ───────────────────────────────────────────────────────────
  const token = (event.headers.authorization || event.headers.Authorization || '')
    .replace('Bearer ', '').trim();
  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
  }

  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido o expirado' }) };
  }

  // ── 2. Validar cuerpo ─────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cuerpo inválido' }) };
  }

  const { local, visitante, jornada, fecha, rol, formacion, scoreLocal, scoreVisitante, eventos } = body;

  if (!local || typeof local !== 'string' ||
      !visitante || typeof visitante !== 'string' ||
      !['Local', 'Visitante'].includes(rol) ||
      !Array.isArray(eventos)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Datos del partido incompletos o inválidos' }) };
  }

  if (local.length > 100 || visitante.length > 100) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nombre de equipo demasiado largo' }) };
  }

  // ── 3. Verificar límite del plan ──────────────────────────────────────
  const { data: perfil } = await sb
    .from('perfiles')
    .select('plan, created_at, plan_renovado_en')
    .eq('id', user.id)
    .single();

  const plan = perfil?.plan || 'trial';
  const limite = PLAN_LIMITES[plan] ?? 1;

  // Contar partidos en el ciclo actual
  let countQuery = sb.from('partidos')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (plan !== 'trial') {
    // Ciclo de 30 días desde el inicio de la suscripción (plan_renovado_en),
    // no desde el registro (created_at), para alinearse con el ciclo de Stripe.
    const base = new Date(perfil?.plan_renovado_en || perfil?.created_at || Date.now());
    const ahora = new Date();
    const ciclosCompletos = Math.floor((ahora - base) / (30 * 24 * 60 * 60 * 1000));
    const inicioCiclo = new Date(base.getTime() + ciclosCompletos * 30 * 24 * 60 * 60 * 1000);
    countQuery = countQuery.gte('created_at', inicioCiclo.toISOString());
  }
  // Trial: cuenta todos los partidos históricos (límite vitalicio de 1)

  const { count } = await countQuery;
  if ((count || 0) >= limite) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: `Límite de ${limite} partido${limite === 1 ? '' : 's'} alcanzado para el plan ${plan}.`
      })
    };
  }

  // ── 4. Insertar partido ───────────────────────────────────────────────
  // user_id viene del token verificado, nunca del body
  const { data, error } = await sb.from('partidos').insert({
    user_id:         user.id,
    local:           local.slice(0, 100),
    visitante:       visitante.slice(0, 100),
    jornada:         jornada != null && !isNaN(parseInt(jornada)) ? parseInt(jornada) : null,
    fecha:           fecha ? String(fecha).slice(0, 20) : null,
    rol,
    formacion:       formacion ? String(formacion).slice(0, 50) : null,
    score_local:     typeof scoreLocal === 'number' ? Math.round(scoreLocal) : null,
    score_visitante: typeof scoreVisitante === 'number' ? Math.round(scoreVisitante) : null,
    eventos
  }).select().single();

  if (error) {
    console.error('registrar-partido insert error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error guardando partido' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ data }) };
};
