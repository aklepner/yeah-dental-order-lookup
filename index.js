const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }
  try {
    const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token'
      }
    });
    cachedToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    return cachedToken;
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    throw new Error('Failed to refresh access token');
  }
}

async function lookupOrder(orderNumber) {
  const token = await getAccessToken();
  const endpoints = [
    `https://commerce.zoho.com/api/v1/salesorders?salesorder_number=${orderNumber}`,
    `https://www.zohoapis.com/commerce/v1/salesorders?salesorder_number=${orderNumber}`,
    `https://commerce.zoho.com/store/api/v1/salesorders?salesorder_number=${orderNumber}`
  ];
  for (const url of endpoints) {
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.data && (response.data.salesorders || response.data.data)) {
        return response.data;
      }
    } catch (error) {
      console.log(`Endpoint ${url} failed:`, error.response?.status, error.response?.data);
      continue;
    }
  }
  throw new Error('Order not found');
}

app.post('/order-lookup', async (req, res) => {
  const order_number = req.body.order_number
    || req.body.parameters?.order_number
    || req.query.order_number
    || (req.body.parameters && JSON.parse(req.body.parameters)?.order_number);

  console.log('Incoming request body:', JSON.stringify(req.body));
  console.log('Extracted order_number:', order_number);

  if (!order_number) {
    return res.status(200).json({
      success: false,
      result: 'error',
      message: 'I need an order number to look that up. Could you please provide your order number?',
      say: 'I need an order number to look that up. Could you please provide your order number?'
    });
  }

  const cleanOrderNumber = order_number.toString().trim().toUpperCase();

  try {
    const data = await lookupOrder(cleanOrderNumber);
    const orders = data.salesorders || data.data || [];
    const order = Array.isArray(orders) ? orders[0] : orders;

    if (!order) {
      return res.json({
        success: false,
        result: 'not_found',
        message: `I was not able to find order number ${cleanOrderNumber} in our system. Please double check the number and try again, or I can connect you with the team.`,
        say: `I was not able to find order number ${cleanOrderNumber} in our system. Please double check the number and try again, or I can connect you with the team.`
      });
    }

    const orderNumber = order.salesorder_number || order.so_number || cleanOrderNumber;
    const status = order.status || order.order_status || 'unknown';
    const customerName = order.customer_name || order.contact_name || '';
    const total = order.total || order.grand_total || '0';
    const date = order.date || order.created_time || '';
    const shipDate = order.shipment_date || order.shipped_date || '';
    const items = order.line_items || order.items || [];
    const itemCount = items.length;

    // Build full spoken message
    let message = `I found your order ${orderNumber}. The current status is ${status}.`;
    if (customerName) message += ` This order is for ${customerName}.`;
    if (total) message += ` The order total is $${parseFloat(total).toFixed(2)}.`;
    if (itemCount > 0) message += ` It contains ${itemCount} item${itemCount > 1 ? 's' : ''}.`;
    if (shipDate) message += ` The estimated ship date is ${shipDate}.`;
    if (date) message += ` This order was placed on ${date}.`;

    if (status.toLowerCase() === 'confirmed') message += ' Your order has been confirmed and is being processed.';
    else if (status.toLowerCase() === 'shipped') message += ' Your order has been shipped.';
    else if (status.toLowerCase() === 'delivered') message += ' Your order has been delivered.';
    else if (status.toLowerCase() === 'draft') message += ' This order is still in draft status.';

    console.log('Returning message:', message);

    return res.json({
      success: true,
      result: 'found',
      message,
      say: message,
      order_number: orderNumber,
      status,
      customer_name: customerName,
      total: parseFloat(total).toFixed(2),
      item_count: itemCount,
      ship_date: shipDate,
      date
    });

  } catch (error) {
    console.error('Order lookup error:', error.message);
    const errorMsg = `I was not able to retrieve order ${cleanOrderNumber} right now. Let me connect you with the team who can look into this for you.`;
    return res.json({
      success: false,
      result: 'error',
      message: errorMsg,
      say: errorMsg
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'Yeah Dental Order Lookup API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
