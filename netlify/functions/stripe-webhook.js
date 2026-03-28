const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PRICE_PLANES = {
  [process.env.STRIPE_PRICE_ENTRENADOR]: 'entrenador',
  [process.env.STRIPE_PRICE_ANALISTA]:   'analista',
  [process.env.STRIPE_PRICE_ELITE]:      'elite',
};

// Busca el perfil por customer_id (lo normal) o por supabase_user_id en metadata (fallback)
async function buscarPerfil(customerId, metadata) {
  const { data: porCustomer } = await sb
    .from('perfiles')
    .select('id, stripe_customer_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (porCustomer) return porCustomer;

  // Fallback: el webhook puede llegar antes de que crear-checkout guarde el customer_id
  const userId = metadata?.supabase_user_id;
  if (!userId) return null;

  const { data: porUserId } = await sb
    .from('perfiles')
    .select('id, stripe_customer_id')
    .eq('id', userId)
    .single();

  return porUserId || null;
}

exports.handler = async function(event) {

  // CRÍTICO: verificar firma — sin esto cualquiera puede enviar eventos falsos
  // y darse de alta en Elite gratis
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const data = stripeEvent.data.object;

  try {
    switch (stripeEvent.type) {

      // checkout.session.completed — primer evento fiable tras el pago
      // Lo usamos para garantizar que el stripe_customer_id queda guardado
      case 'checkout.session.completed': {
        const userId     = data.metadata?.supabase_user_id;
        const customerId = data.customer;
        if (!userId || !customerId) break;

        const { data: perfil } = await sb
          .from('perfiles')
          .select('id, stripe_customer_id')
          .eq('id', userId)
          .single();

        if (perfil && !perfil.stripe_customer_id) {
          await sb.from('perfiles')
            .update({ stripe_customer_id: customerId })
            .eq('id', userId);
          console.log(`customer_id guardado en checkout.completed: ${userId} → ${customerId}`);
        }
        break;
      }

      // Suscripción creada o actualizada (cambio de plan, renovación)
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const priceId    = data.items?.data?.[0]?.price?.id;
        const plan       = PRICE_PLANES[priceId];
        const customerId = data.customer;

        if (!plan) {
          console.warn('Webhook: priceId no reconocido:', priceId);
          break;
        }

        const perfil = await buscarPerfil(customerId, data.metadata);
        if (!perfil) {
          console.error('Webhook: perfil no encontrado para customer', customerId);
          break;
        }

        await sb.from('perfiles').update({
          plan,
          stripe_customer_id:     customerId,        // asegurar que está guardado
          stripe_subscription_id: data.id,
          stripe_status:          data.status,
          plan_renovado_en:       new Date().toISOString()
        }).eq('id', perfil.id);

        console.log(`Plan actualizado: ${perfil.id} → ${plan} (${data.status})`);
        break;
      }

      // Pago de renovación mensual — resetear ciclo de partidos
      case 'invoice.payment_succeeded': {
        // Solo procesar facturas de suscripción, no de one-time
        if (data.billing_reason !== 'subscription_cycle' &&
            data.billing_reason !== 'subscription_update') break;

        const customerId = data.customer;
        const perfil = await buscarPerfil(customerId, null);
        if (!perfil) break;

        await sb.from('perfiles').update({
          plan_renovado_en: new Date().toISOString()
        }).eq('id', perfil.id);

        console.log(`Ciclo renovado: ${perfil.id}`);
        break;
      }

      // Suscripción cancelada — volver a trial
      case 'customer.subscription.deleted': {
        const customerId = data.customer;
        const perfil = await buscarPerfil(customerId, null);
        if (!perfil) break;

        await sb.from('perfiles').update({
          plan:           'trial',
          stripe_status:  'canceled'
        }).eq('id', perfil.id);

        console.log(`Suscripción cancelada: ${perfil.id} → trial`);
        break;
      }

      // Pago fallido — marcar para que el usuario lo sepa
      case 'invoice.payment_failed': {
        const customerId = data.customer;
        const perfil = await buscarPerfil(customerId, null);
        if (!perfil) break;

        await sb.from('perfiles').update({
          stripe_status: 'past_due'
        }).eq('id', perfil.id);

        console.log(`Pago fallido: ${perfil.id}`);
        break;
      }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
