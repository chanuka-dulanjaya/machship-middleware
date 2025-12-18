const express = require('express');
const axios = require('axios');
const app = express();

// Parse JSON bodies
app.use(express.json());

// Configuration from environment variables
const PORT = process.env.PORT || 3000;
const MACHSHIP_API_TOKEN = process.env.MACHSHIP_API_TOKEN;
const MACHSHIP_COMPANY_ID = process.env.MACHSHIP_COMPANY_ID;
// IMPORTANT: Ensure this is https://live.machship.com/apiv2 in Render for production
const MACHSHIP_BASE_URL = process.env.MACHSHIP_BASE_URL || 'https://live.machship.com/apiv2';

// Warehouse details (Ensure these are set in Render Environment Variables)
const WAREHOUSE = {
    contactName: process.env.WAREHOUSE_CONTACT || 'Sky Energy Warehouse',
    companyName: process.env.WAREHOUSE_COMPANY || 'Sky Energy Production PTY LTD',
    street: process.env.WAREHOUSE_STREET || 'Melbourne CBD',
    suburb: process.env.WAREHOUSE_SUBURB || 'Melbourne',
    state: process.env.WAREHOUSE_STATE || 'VIC',
    postcode: process.env.WAREHOUSE_POSTCODE || '3000',
    country: 'AU',
    phone: process.env.WAREHOUSE_PHONE || '0400000000',
    email: process.env.WAREHOUSE_EMAIL || 'asanka@team.newgenconsulting.au'
};

// --- HELPER FUNCTIONS ---

// Function to call MachShip - This avoids the "localhost" loop error
const callMachShip = async (endpoint, data) => {
    const url = `${MACHSHIP_BASE_URL}${endpoint}`;
    console.log(`Calling MachShip: ${url}`);
    
    // Safety check: ensure token doesn't have double "Bearer"
    const cleanToken = MACHSHIP_API_TOKEN.replace('Bearer ', '');
    
    return await axios.post(url, data, {
        headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json'
        }
    });
};

// --- ENDPOINTS ---

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// 1. Get Shipping Quote
app.post('/api/get-shipping-quote', async (req, res) => {
    try {
        console.log('=== QUOTE REQUEST RECEIVED ===');
        const { destination_address, items, forklift_available } = req.body;

        if (!destination_address || !items) {
            return res.status(400).json({ success: false, error: 'Missing address or items' });
        }

        const machshipRequest = {
            companyId: parseInt(MACHSHIP_COMPANY_ID),
            fromLocation: WAREHOUSE,
            toLocation: {
                contactName: destination_address.name || 'Customer',
                companyName: destination_address.company || '',
                street: destination_address.street,
                suburb: destination_address.suburb,
                state: destination_address.state,
                postcode: destination_address.postcode,
                country: destination_address.country || 'AU',
                phone: destination_address.phone || '',
                email: destination_address.email || ''
            },
            items: items.map(item => ({
                quantity: item.quantity || 1,
                length: item.length || 100,
                width: item.width || 50,
                height: item.height || 30,
                weight: item.weight || 25,
                itemDescription: item.description || 'Battery'
            })),
            dangerousGoods: true,
            tailLiftRequired: forklift_available === false || forklift_available === 'no'
        };

        const response = await callMachShip('/routes/returnrouteswithcomplexitems', machshipRequest);
        
        const routes = response.data.routes || [];
        if (routes.length === 0) throw new Error('No routes returned from MachShip');

        const cheapest = routes.reduce((prev, curr) => (curr.totalCost < prev.totalCost) ? curr : prev);

        res.json({
            success: true,
            shipping_cost: cheapest.totalCost,
            carrier: cheapest.carrierName,
            service: cheapest.serviceName,
            transit_days: cheapest.totalTransitDays
        });

    } catch (error) {
        console.error('Quote Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: 'MachShip API error',
            details: error.response?.data || error.message
        });
    }
});

// 2. Create Consignment & 3. Zoho Webhook (Combined logic)
app.post('/api/zoho-webhook', async (req, res) => {
    try {
        console.log('=== ZOHO WEBHOOK RECEIVED ===');
        const orderData = req.body;

        // Custom field logic for forklift
        let forkliftAvailable = false;
        if (orderData.custom_fields) {
            const field = orderData.custom_fields.find(f => f.customfield_id === '171656000002394353');
            if (field) forkliftAvailable = field.value === 'yes';
        }

        const consignmentRequest = {
            companyId: parseInt(MACHSHIP_COMPANY_ID),
            fromLocation: WAREHOUSE,
            toLocation: {
                contactName: orderData.shipping_address?.attention || orderData.customer_name,
                companyName: orderData.shipping_address?.company_name || '',
                street: orderData.shipping_address?.address,
                suburb: orderData.shipping_address?.city,
                state: orderData.shipping_address?.state_code,
                postcode: orderData.shipping_address?.zip,
                country: orderData.shipping_address?.country_code || 'AU'
            },
            items: orderData.line_items.map(item => ({
                quantity: item.quantity,
                length: 100, width: 50, height: 30, weight: 25, // Fallbacks
                itemDescription: item.name
            })),
            dangerousGoods: true,
            tailLiftRequired: !forkliftAvailable,
            customerReference: orderData.salesorder_number,
            orderNumber: orderData.salesorder_number
        };

        const response = await callMachShip('/consignments/createConsignmentwithComplexItems', consignmentRequest);
        
        res.json({
            success: true,
            consignment_id: response.data.consignmentId,
            tracking_number: response.data.trackingNumber
        });

    } catch (error) {
        console.error('Webhook Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Base URL: ${MACHSHIP_BASE_URL}`);
    console.log(`Token Loaded: ${MACHSHIP_API_TOKEN ? 'YES' : 'NO'}`);
});