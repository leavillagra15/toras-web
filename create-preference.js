// Genera un link de pago de Mercado Pago (Checkout Pro) a medida del carrito
// que mandó la página. Corre en el servidor de Netlify, así que el Access
// Token de Mercado Pago nunca queda expuesto en el navegador.
//
// Configuración necesaria en Netlify:
//   Project configuration > Environment variables > agregar MP_ACCESS_TOKEN
//   con el Access Token de PRODUCCIÓN de tu cuenta de Mercado Pago Developers
//   (empieza con "APP_USR-...").
//
// Los precios están fijados acá, no en el navegador, para que nadie pueda
// manipular el monto antes de pagar. Si cambiás un precio, actualizalo:
//   1. Acá abajo, en CATALOGO
//   2. En index.html, en la constante PRECIOS (solo afecta lo que se ve en pantalla)

const CATALOGO = {
  "remera-S": { title: "Remera Toras - Talle S", unit_price: 35000 },
  "remera-M": { title: "Remera Toras - Talle M", unit_price: 35000 },
  "remera-L": { title: "Remera Toras - Talle L", unit_price: 35000 },
  "remera-XL": { title: "Remera Toras - Talle XL", unit_price: 35000 },
  "gorra": { title: "Gorra Team ARG", unit_price: 25000 },
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!process.env.MP_ACCESS_TOKEN) {
    console.error("Falta configurar MP_ACCESS_TOKEN en Netlify");
    return { statusCode: 500, body: "El sitio todavía no tiene configurado el cobro. Avisale a Lea." };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "JSON inválido" };
  }

  const { items, pedidoId, nombre } = payload;

  if (!Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, body: "El carrito está vacío" };
  }

  const mpItems = [];
  for (const it of items) {
    const cat = CATALOGO[it.sku];
    const cantidad = Number(it.cantidad);
    if (!cat || !Number.isInteger(cantidad) || cantidad < 1) {
      return { statusCode: 400, body: `Ítem inválido: ${it.sku}` };
    }
    mpItems.push({
      title: cat.title,
      quantity: cantidad,
      unit_price: cat.unit_price,
      currency_id: "ARS",
    });
  }

  const siteUrl = process.env.URL || `https://${event.headers.host}`;

  const preference = {
    items: mpItems,
    external_reference: pedidoId || Date.now().toString(),
    payer: nombre ? { name: nombre } : undefined,
    back_urls: {
      success: `${siteUrl}/?pago=exito`,
      pending: `${siteUrl}/?pago=pendiente`,
      failure: `${siteUrl}/?pago=fallo`,
    },
    auto_return: "approved",
    statement_descriptor: "TORAS MERCH",
  };

  try {
    const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("Error de Mercado Pago:", data);
      return { statusCode: 502, body: "No se pudo generar el link de pago" };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_point: data.init_point }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Error interno" };
  }
};
