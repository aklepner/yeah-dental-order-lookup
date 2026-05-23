# Yeah Dental Order Lookup API

Real-time Zoho Commerce order lookup middleware for GHL Voice AI.

## How It Works

1. GHL Voice AI receives a call and collects the order number from the caller
2. GHL sends the order number to this API via a POST request
3. The API authenticates with Zoho Commerce and fetches the order
4. The API returns order status in plain language for the Voice AI to read back

## Deploy to Render.com

1. Create a free account at render.com
2. Click "New" and select "Web Service"
3. Connect your GitHub repo containing this code
4. Set the following environment variables:
   - ZOHO_CLIENT_ID
   - ZOHO_CLIENT_SECRET
   - ZOHO_REFRESH_TOKEN
5. Deploy -- Render gives you a permanent HTTPS URL

## Environment Variables

| Variable | Value |
|---|---|
| ZOHO_CLIENT_ID | Your Zoho API Client ID |
| ZOHO_CLIENT_SECRET | Your Zoho API Client Secret |
| ZOHO_REFRESH_TOKEN | Your Zoho Refresh Token |

## GHL Voice AI Setup

- Endpoint: https://your-render-url.onrender.com/order-lookup
- Method: POST
- Body: { "order_number": "{{order_number}}" }

## Endpoints

- GET / -- Health check
- POST /order-lookup -- Look up an order by SO number
