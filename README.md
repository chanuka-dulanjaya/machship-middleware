# MachShip + Zoho Commerce Middleware

Middleware server for integrating Zoho Commerce with MachShip shipping API.

## Features

- Get real-time shipping quotes from MachShip
- Create consignments automatically
- Handle dangerous goods (batteries)
- Support forklift availability logic
- Process Zoho Commerce webhooks

## Setup Instructions

### 1. Local Testing (Optional)

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your credentials
nano .env

# Run server
npm start
```

Server will start at: http://localhost:3000

### 2. Deploy to Heroku

```bash
# Login to Heroku
heroku login

# Create new app
heroku create your-app-name

# Set environment variables
heroku config:set MACHSHIP_API_TOKEN=your_token
heroku config:set MACHSHIP_COMPANY_ID=95679739783
heroku config:set WAREHOUSE_STREET="Melbourne CBD"
heroku config:set WAREHOUSE_SUBURB="Melbourne"
heroku config:set WAREHOUSE_STATE="VIC"
heroku config:set WAREHOUSE_POSTCODE="3000"
heroku config:set WAREHOUSE_PHONE="0405050213"
heroku config:set WAREHOUSE_EMAIL="asanka@team.newgenconsulting.au"

# Deploy
git push heroku main

# Check logs
heroku logs --tail
```

## API Endpoints

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "service": "machship-middleware",
  "timestamp": "2025-12-18T15:00:00.000Z"
}
```

### POST /api/get-shipping-quote
Get shipping quote from MachShip

**Request:**
```json
{
  "destination_address": {
    "name": "John Doe",
    "street": "123 Test St",
    "suburb": "Sydney",
    "state": "NSW",
    "postcode": "2000",
    "phone": "0400000000"
  },
  "items": [
    {
      "quantity": 2,
      "length": 100,
      "width": 50,
      "height": 30,
      "weight": 25,
      "description": "Battery 12V"
    }
  ],
  "forklift_available": false
}
```

**Response:**
```json
{
  "success": true,
  "shipping_cost": 85.50,
  "carrier": "Allied Express",
  "service": "Road Express",
  "transit_days": 2,
  "route_id": "123456"
}
```

### POST /api/create-consignment
Create consignment in MachShip

**Request:**
```json
{
  "order_number": "SO-00123",
  "destination_address": { ... },
  "items": [ ... ],
  "forklift_available": true,
  "customer_email": "customer@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "consignment_id": "C123456",
  "tracking_number": "TRACK123",
  "carrier": "Allied Express"
}
```

### POST /api/zoho-webhook
Webhook endpoint for Zoho Commerce orders

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| MACHSHIP_API_TOKEN | MachShip API token | Yes |
| MACHSHIP_COMPANY_ID | MachShip company ID | Yes |
| MACHSHIP_BASE_URL | MachShip API base URL | No (defaults to live) |
| WAREHOUSE_STREET | Warehouse street address | Yes |
| WAREHOUSE_SUBURB | Warehouse suburb | Yes |
| WAREHOUSE_STATE | Warehouse state | Yes |
| WAREHOUSE_POSTCODE | Warehouse postcode | Yes |
| WAREHOUSE_PHONE | Warehouse phone | Yes |
| WAREHOUSE_EMAIL | Warehouse email | Yes |
| PORT | Server port | No (Heroku sets this) |

## Testing

### Test Quote Endpoint

```bash
curl -X POST https://your-app.herokuapp.com/api/get-shipping-quote \
  -H "Content-Type: application/json" \
  -d '{
    "destination_address": {
      "name": "Test Customer",
      "street": "123 Test St",
      "suburb": "Sydney",
      "state": "NSW",
      "postcode": "2000"
    },
    "items": [{
      "quantity": 1,
      "length": 100,
      "width": 50,
      "height": 30,
      "weight": 25,
      "description": "Battery"
    }],
    "forklift_available": false
  }'
```

## Zoho Commerce Integration

1. Go to Zoho Commerce → Settings → Webhooks
2. Add webhook URL: `https://your-app.herokuapp.com/api/zoho-webhook`
3. Event: "Order Created" or "Order Confirmed"
4. Save

## Support

For issues:
- Check Heroku logs: `heroku logs --tail`
- MachShip API docs: https://developers.live.machship.com
- Zoho Commerce docs: https://help.zoho.com/portal/en/kb/commerce

## License

MIT
