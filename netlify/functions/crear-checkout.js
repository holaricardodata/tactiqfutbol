const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PLANES = {
  entrenador: process.env.STRIPE_PRICE_ENTRENADOR,
  analista:   process.env.STRIPE_PRICE_ANALISTA,
  elite:      process.env.STRIPE_PRICE_ELITE,
};

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

  // 1. Verificar sesión — sin esto cualquiera puede crear checkouts con userId ajeno
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
  }

  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) };
  }

  // 2. Validar plan
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body inválido' }) }; }

  const { plan } = body;
  const priceId = PLANES[plan];
  if (!priceId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Plan no válido' }) };
  }

  try {
    // 3. Buscar stripe_customer_id existente en el perfil
    const { data: perfil } = await sb
      .from('perfiles')
      .select('stripe_customer_id, plan')
      .eq('id', user.id)
      .single();

    // 4. Reusar customer o crear uno nuevo
    // Sin esto: cada pago crea un Customer duplicado y el webhook nunca linkea el plan
    let customerId = perfil?.stripe_customer_id || null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;

      // Guardar inmediatamente — el webhook puede llegar antes que esta función termine
      await sb.from('perfiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // 5. Crear sesión de checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${ORIGIN}/app.html?pago=ok&plan=${plan}`,
      cancel_url:  `${ORIGIN}/app.html?pago=cancelado`,
      metadata: { supabase_user_id: user.id, plan },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan }
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {
    console.error('Checkout error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
