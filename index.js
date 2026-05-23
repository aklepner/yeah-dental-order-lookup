const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Zoho credentials - set these as environment variables in Render
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

// Cache the access token in memory
let cachedToken = null;
let tokenExpiry = null;

// Get a fresh access token using the refresh token
async function getAccessToken() {
  // Return cached token if still valid (with 5 min buffer)
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

// Look up order from Zoho Commerce
async function lookupOrder(orderNumber) {
  const token = await getAccessToken();

  // Try multiple API endpoint formats for Zoho Commerce
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

  throw new Error('Order not found across all endpoints');
}

// Main order lookup endpoint - called by GHL Voice AI
app.post('/order-lookup', async (req, res) => {
  const { order_number } = req.body;

  if (!order_number) {
    return res.status(400).json({
      success: false,
      message: 'I need an order number to look that up for you.'
    });
  }

  const cleanOrderNumber = order_number.toString().trim().toUpperCase();

  try {
    const data = await lookupOrder(cleanOrderNumber);

    // Handle different response structures
    const orders = data.salesorders || data.data || [];
    const order = Array.isArray(orders) ? orders[0] : orders;

    if (!order) {
      return res.json({
        success: false,
        message: `I was unable to find an order with number ${cleanOrderNumber}. Please double check the order number and try again.`
      });
    }

    // Extract the key fields
    const orderNumber = order.salesorder_number || order.so_number || cleanOrderNumber;
    const status = order.status || order.order_status || 'Unknown';
    const customerName = order.customer_name || order.contact_name || 'Customer';
    const total = order.total || order.grand_total || '0';
    const date = order.date || order.created_time || '';
    const shipDate = order.shipment_date || order.shipped_date || '';
    const items = order.line_items || order.items || [];
    const itemCount = items.length;

    // Build a natural language response for the Voice AI to read
    let message = `I found your order ${orderNumber}. The current status is ${status}.`;

    if (customerName) {
      message += ` This order is for ${customerName}.`;
    }

    if (total) {
      message += ` The order total is $${parseFloat(total).toFixed(2)}.`;
    }

    if (itemCount > 0) {
      message += ` It contains ${itemCount} item${itemCount > 1 ? 's' : ''}.`;
    }

    if (shipDate) {
      message += ` Estimated ship date is ${shipDate}.`;
    }

    if (status.toLowerCase() === 'confirmed') {
      message += ' Your order has been confirmed and is being processed.';
    } else if (status.toLowerCase() === 'shipped') {
      message += ' Your order has been shipped.';
    } else if (status.toLowerCase() === 'delivered') {
      message += ' Your order has been delivered.';
    } else if (status.toLowerCase() === 'draft') {
      message += ' This order is still in draft status.';
    }

    return res.json({
      success: true,
      message,
      order_number: orderNumber,
      status,
      customer_name: customerName,
      total,
      item_count: itemCount,
      ship_date: shipDate,
      date
    });

  } catch (error) {
    console.error('Order lookup error:', error.message);
    return res.json({
      success: false,
      message: `I was unable to retrieve the order information right now. Please try again or contact our support team for assistance with order ${cleanOrderNumber}.`
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Yeah Dental Order Lookup API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
