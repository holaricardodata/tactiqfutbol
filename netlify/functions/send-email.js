const nodemailer = require('nodemailer');

const ALLOWED_TYPES = ['bienvenida'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { type, email, nombre } = body;

  if (!ALLOWED_TYPES.includes(type)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Tipo de email no válido' }) };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email inválido' }) };
  }
  if (!nombre || typeof nombre !== 'string' || nombre.length > 100) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nombre inválido' }) };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.IONOS_SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
      user: process.env.IONOS_SMTP_USER,
      pass: process.env.IONOS_SMTP_PASS,
    },
  });

  const nombreSafe = nombre.replace(/[<>]/g, '');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#0B1F17;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1F17;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#0e1e16;border:1px solid #1a3025;border-radius:12px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#0a1a10;padding:28px 32px;border-bottom:1px solid #1a3025;">
              <p style="margin:0;font-size:20px;font-weight:800;color:#1D9E75;letter-spacing:-0.5px;">⚽ Tactiq</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e2f0eb;">
                ¡Bienvenido/a, ${nombreSafe}!
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#7aab94;line-height:1.6;">
                Tu cuenta está creada. Confirma tu email y empieza a analizar tus partidos en minutos.
              </p>

              <!-- Pasos -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <!-- Paso 1 -->
                <tr>
                  <td style="padding:12px 16px;background:#0B1F17;border:1px solid #1a3025;border-radius:8px;margin-bottom:10px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:top;padding-right:12px;">
                          <span style="display:inline-block;background:#1D9E75;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-size:11px;font-weight:700;">1</span>
                        </td>
                        <td style="vertical-align:top;">
                          <p style="margin:0;font-size:13px;color:#c5ddd5;line-height:1.5;">
                            <strong style="color:#e2f0eb;">Sube el vídeo a YouTube como oculto</strong><br/>
                            Los vídeos privados no se pueden cargar. <em>Oculto</em> es la opción correcta.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>

                <!-- Paso 2 -->
                <tr>
                  <td style="padding:12px 16px;background:#0B1F17;border:1px solid #1a3025;border-radius:8px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:top;padding-right:12px;">
                          <span style="display:inline-block;background:#1D9E75;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-size:11px;font-weight:700;">2</span>
                        </td>
                        <td style="vertical-align:top;">
                          <p style="margin:0;font-size:13px;color:#c5ddd5;line-height:1.5;">
                            <strong style="color:#e2f0eb;">Pega la URL en la app y pulsa play</strong><br/>
                            El vídeo se cargará en el campo interactivo listo para etiquetar.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>

                <!-- Paso 3 -->
                <tr>
                  <td style="padding:12px 16px;background:#0B1F17;border:1px solid #1a3025;border-radius:8px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:top;padding-right:12px;">
                          <span style="display:inline-block;background:#1D9E75;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-size:11px;font-weight:700;">3</span>
                        </td>
                        <td style="vertical-align:top;">
                          <p style="margin:0;font-size:13px;color:#c5ddd5;line-height:1.5;">
                            <strong style="color:#e2f0eb;">Etiqueta eventos sobre el campo</strong><br/>
                            Haz clic en el campo para marcar acciones. Al terminar, revisa el análisis con IA.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                <tr>
                  <td align="center">
                    <a href="https://tactiqfutbol.netlify.app/app.html"
                       style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#1D9E75,#0F6E56);color:#fff;font-size:14px;font-weight:700;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
                      Ir a la app →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #1a3025;text-align:center;">
              <p style="margin:0;font-size:11px;color:#3d6655;">
                © 2025 Tactiq · Análisis de fútbol · Si no creaste esta cuenta, ignora este email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"Tactiq" <${process.env.IONOS_SMTP_FROM}>`,
      to: email,
      subject: `¡Bienvenido/a a Tactiq, ${nombreSafe}! Aquí tus primeros pasos`,
      html,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('send-email error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No se pudo enviar el email' }),
    };
  }
};
