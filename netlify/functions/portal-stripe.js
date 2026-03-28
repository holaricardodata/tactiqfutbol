const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

  // 1. Verificar sesión
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
  }

  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) };
  }

  try {
    // 2. Obtener stripe_customer_id
    const { data: perfil } = await sb
      .from('perfiles')
      .select('stripe_customer_id, plan')
      .eq('id', user.id)
      .single();

    if (!perfil?.stripe_customer_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'No tienes una suscripción activa. Escríbenos a soporte@tactiqfutbol.es si crees que es un error.'
        })
      };
    }

    // 3. Crear sesión del portal de Stripe
    const session = await stripe.billingPortal.sessions.create({
      customer:   perfil.stripe_customer_id,
      return_url: `${ORIGIN}/app.html`,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {
    console.error('Portal error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
