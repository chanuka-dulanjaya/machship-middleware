const express = require('express');
const axios = require('axios');
const app = express();

// Parse JSON bodies
app.use(express.json());

// Configuration from environment variables
const PORT = process.env.PORT || 3000;
const MACHSHIP_API_TOKEN = process.env.MACHSHIP_API_TOKEN;
const MACHSHIP_COMPANY_ID = process.env.MACHSHIP_COMPANY_ID;
const MACHSHIP_BASE_URL = process.env.MACHSHIP_BASE_URL || 'https://live.machship.com/apiv2';

// Warehouse details
const WAREHOUSE = {
    contactName: process.env.WAREHOUSE_CONTACT || 'Sky Energy Warehouse',
    companyName: process.env.WAREHOUSE_COMPANY || 'Sky Energy Production PTY LTD',
    street: process.env.WAREHOUSE_STREET,
    suburb: process.env.WAREHOUSE_SUBURB,
    state: process.env.WAREHOUSE_STATE,
    postcode: process.env.WAREHOUSE_POSTCODE,
    country: 'AU',
    phone: process.env.WAREHOUSE_PHONE,
    email: process.env.WAREHOUSE_EMAIL
};

// ============================================
// SESSION MANAGEMENT FOR MACHSHIP
// ============================================

let sessionCookie = null;
let sessionExpiry = null;

// Function to login to MachShip and get session cookie
const loginToMachShip = async () => {
    try {
        console.log('🔐 Attempting to login to MachShip...');
        
        const cleanToken = (MACHSHIP_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
        
        // Try the login endpoint
        const loginResponse = await axios.post(
            `${MACHSHIP_BASE_URL.replace('/apiv2', '')}/login`,
            {
                token: cleanToken
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                validateStatus: () => true // Accept any status to see response
            }
        );
        
        console.log('Login response status:', loginResponse.status);
        console.log('Login response headers:', loginResponse.headers);
        
        // Extract session cookie from response
        const cookies = loginResponse.headers['set-cookie'];
        if (cookies && cookies.length > 0) {
            sessionCookie = cookies.map(cookie => cookie.split(';')[0]).join('; ');
            sessionExpiry = Date.now() + (30 * 60 * 1000); // 30 minutes
            console.log('✅ Session cookie obtained');
            return true;
        }
        
        console.warn('⚠️ No session cookie in login response');
        return false;
        
    } catch (error) {
        console.error('❌ Login failed:', error.message);
        if (error.response) {
            console.error('Login error response:', error.response.data);
        }
        return false;
    }
};

// Check if session is valid
const isSessionValid = () => {
    const valid = sessionCookie && sessionExpiry && Date.now() < sessionExpiry;
    if (!valid && sessionCookie) {
        console.log('⏰ Session expired');
    }
    return valid;
};

// Enhanced function to call MachShip with multiple auth strategies
const callMachShip = async (endpoint, data) => {
    const url = `${MACHSHIP_BASE_URL}${endpoint}`;
    const cleanToken = (MACHSHIP_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
    
    console.log('📤 Calling MachShip:', endpoint);
    
    // Try multiple authentication strategies
    const authStrategies = [
        {
            name: 'Bearer Token',
            headers: {
                'Authorization': `Bearer ${cleanToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        },
        {
            name: 'X-API-Key',
            headers: {
                'X-API-Key': cleanToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        },
        {
            name: 'api-key',
            headers: {
                'api-key': cleanToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        },
        {
            name: 'Authorization Token',
            headers: {
                'Authorization': `Token ${cleanToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        }
    ];
    
    let lastError = null;
    
    for (const strategy of authStrategies) {
        try {
            console.log(`Trying auth strategy: ${strategy.name}`);
            
            const response = await axios.post(url, data, { 
                headers: strategy.headers,
                validateStatus: (status) => status < 500 // Don't throw on 4xx
            });
            
            // Check if successful
            if (response.status === 200 && response.data && !String(response.data).includes('Session ID')) {
                console.log(`✅ SUCCESS with ${strategy.name}`);
                console.log('Response data type:', typeof response.data);
                return response;
            } else {
                console.log(`❌ ${strategy.name} failed: ${response.status}`);
                console.log('Response:', String(response.data).substring(0, 100));
            }
            
        } catch (error) {
            console.log(`❌ ${strategy.name} errored:`, error.message);
            lastError = error;
        }
    }
    
    // If all strategies failed, throw the last error
    console.error('❌ All authentication strategies failed');
    throw lastError || new Error('All authentication methods failed');
};

// ============================================
// ENDPOINTS
// ============================================

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'MachShip Middleware is running',
        timestamp: new Date().toISOString(),
        session_active: isSessionValid()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'machship-middleware',
        timestamp: new Date().toISOString(),
        session_active: isSessionValid()
    });
});

// Test endpoint for MachShip authentication
app.get('/api/test-machship-auth', async (req, res) => {
    try {
        console.log('=== TESTING MACHSHIP AUTH ===');
        console.log('Token (first 10 chars):', MACHSHIP_API_TOKEN?.substring(0, 10));
        console.log('Company ID:', MACHSHIP_COMPANY_ID);
        console.log('Base URL:', MACHSHIP_BASE_URL);
        
        // Try to login
        const loginSuccess = await loginToMachShip();
        
        if (!loginSuccess) {
            return res.json({
                success: false,
                message: 'Login attempt completed but no session cookie received',
                has_token: !!MACHSHIP_API_TOKEN,
                has_company_id: !!MACHSHIP_COMPANY_ID,
                token_preview: MACHSHIP_API_TOKEN?.substring(0, 10) + '...'
            });
        }
        
        // Try a simple quote request
        const testRequest = {
            companyId: parseInt(MACHSHIP_COMPANY_ID),
            fromLocation: WAREHOUSE,
            toLocation: {
                contactName: "Test",
                street: "123 Test St",
                suburb: "Melbourne",
                state: "VIC",
                postcode: "3000",
                country: "AU"
            },
            items: [{
                quantity: 1,
                length: 100,
                width: 50,
                height: 30,
                weight: 25,
                itemDescription: "Test Item"
            }],
            dangerousGoods: false,
            tailLiftRequired: false
        };
        
        const response = await callMachShip('/routes/returnrouteswithcomplexitems', testRequest);
        
        console.log('✅ MachShip responded!');
        
        res.json({
            success: true,
            message: 'MachShip authentication working!',
            routes_count: response.data.routes?.length || 0,
            session_obtained: isSessionValid()
        });
        
    } catch (error) {
        console.error('❌ Auth Test Failed');
        console.error('Error:', error.message);
        
        res.json({
            success: false,
            error: error.message,
            machship_response: error.response?.data,
            token_preview: MACHSHIP_API_TOKEN?.substring(0, 10) + '...',
            company_id: MACHSHIP_COMPANY_ID
        });
    }
});

// Get Shipping Quote
app.post('/api/get-shipping-quote', async (req, res) => {
    try {
        console.log('=== NEW QUOTE REQUEST ===');
        console.log('Timestamp:', new Date().toISOString());
        
        const { destination_address, items, forklift_available } = req.body;

        console.log('Destination:', destination_address);
        console.log('Items count:', items?.length);
        console.log('Forklift available:', forklift_available);

        // Validate request
        if (!destination_address || !items || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: destination_address and items'
            });
        }

        // Build MachShip request
        const machshipRequest = {
            companyId: parseInt(MACHSHIP_COMPANY_ID),
            
            fromLocation: {
                contactName: WAREHOUSE.contactName,
                companyName: WAREHOUSE.companyName,
                street: WAREHOUSE.street,
                suburb: WAREHOUSE.suburb,
                state: WAREHOUSE.state,
                postcode: WAREHOUSE.postcode,
                country: WAREHOUSE.country,
                phone: WAREHOUSE.phone,
                email: WAREHOUSE.email
            },
            
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
                itemDescription: item.description || item.name || 'Battery'
            })),
            
            dangerousGoods: true,
            tailLiftRequired: forklift_available === false || forklift_available === 'no'
        };

        console.log('MachShip Request:', JSON.stringify(machshipRequest, null, 2));

        // Call MachShip API using our helper function
        const machshipResponse = await callMachShip('/routes/returnrouteswithcomplexitems', machshipRequest);

        console.log('MachShip response received');

        // Check if we got routes
        if (!machshipResponse.data || !machshipResponse.data.routes) {
            console.error('No routes in response:', machshipResponse.data);
            return res.status(500).json({
                success: false,
                error: 'No shipping routes available',
                details: machshipResponse.data
            });
        }

        const routes = machshipResponse.data.routes;
        console.log(`Found ${routes.length} routes`);

        if (routes.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No shipping routes available for this destination'
            });
        }

        // Find cheapest route
        const cheapestRoute = routes.reduce((prev, current) => 
            (current.totalCost < prev.totalCost) ? current : prev
        );

        console.log('Cheapest route:', {
            carrier: cheapestRoute.carrierName,
            service: cheapestRoute.serviceName,
            cost: cheapestRoute.totalCost
        });

        // Return quote
        res.json({
            success: true,
            shipping_cost: cheapestRoute.totalCost,
            carrier: cheapestRoute.carrierName,
            service: cheapestRoute.serviceName,
            transit_days: cheapestRoute.totalTransitDays,
            route_id: cheapestRoute.routeId,
            all_options: routes.map(route => ({
                carrier: route.carrierName,
                service: route.serviceName,
                cost: route.totalCost,
                transit_days: route.totalTransitDays
            }))
        });

    } catch (error) {
        console.error('Error getting quote:', error.message);
        
        if (error.response) {
            console.error('MachShip error response:', error.response.data);
            return res.status(error.response.status).json({
                success: false,
                error: 'MachShip API error',
                details: error.response.data
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Create Consignment
app.post('/api/create-consignment', async (req, res) => {
    try {
        console.log('=== NEW CONSIGNMENT REQUEST ===');
        console.log('Timestamp:', new Date().toISOString());
        
        const { order_number, destination_address, items, forklift_available, customer_email } = req.body;

        console.log('Order Number:', order_number);
        console.log('Destination:', destination_address);

        // Validate request
        if (!order_number || !destination_address || !items) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Build MachShip consignment request
        const consignmentRequest = {
            companyId: parseInt(MACHSHIP_COMPANY_ID),
            
            fromLocation: {
                contactName: WAREHOUSE.contactName,
                companyName: WAREHOUSE.companyName,
                street: WAREHOUSE.street,
                suburb: WAREHOUSE.suburb,
                state: WAREHOUSE.state,
                postcode: WAREHOUSE.postcode,
                country: WAREHOUSE.country,
                phone: WAREHOUSE.phone,
                email: WAREHOUSE.email
            },
            
            toLocation: {
                contactName: destination_address.name || 'Customer',
                companyName: destination_address.company || '',
                street: destination_address.street,
                suburb: destination_address.suburb,
                state: destination_address.state,
                postcode: destination_address.postcode,
                country: destination_address.country || 'AU',
                phone: destination_address.phone || '',
                email: customer_email || destination_address.email || ''
            },
            
            items: items.map(item => ({
                quantity: item.quantity || 1,
                length: item.length || 100,
                width: item.width || 50,
                height: item.height || 30,
                weight: item.weight || 25,
                itemDescription: item.description || item.name || 'Battery',
                itemReference: item.sku || ''
            })),
            
            dangerousGoods: true,
            tailLiftRequired: forklift_available === false || forklift_available === 'no',
            
            customerReference: order_number,
            orderNumber: order_number
        };

        console.log('Creating MachShip consignment...');

        // Call MachShip API using our helper function
        const machshipResponse = await callMachShip('/consignments/createConsignmentwithComplexItems', consignmentRequest);

        console.log('Consignment created successfully');
        console.log('Consignment ID:', machshipResponse.data.consignmentId);

        // Return success
        res.json({
            success: true,
            consignment_id: machshipResponse.data.consignmentId,
            tracking_number: machshipResponse.data.trackingNumber,
            carrier: machshipResponse.data.carrierName,
            message: 'Consignment created successfully'
        });

    } catch (error) {
        console.error('Error creating consignment:', error.message);
        
        if (error.response) {
            console.error('MachShip error response:', error.response.data);
            return res.status(error.response.status).json({
                success: false,
                error: 'MachShip API error',
                details: error.response.data
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Zoho Commerce Webhook Handler
app.post('/api/zoho-webhook', async (req, res) => {
    try {
        console.log('=== ZOHO WEBHOOK RECEIVED ===');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Webhook data:', JSON.stringify(req.body, null, 2));

        const orderData = req.body;

        // Extract forklift availability from custom fields
        let forkliftAvailable = false;
        if (orderData.custom_fields && orderData.custom_fields.length > 0) {
            const forkliftField = orderData.custom_fields.find(
                field => field.customfield_id === '171656000002394353'
            );
            if (forkliftField) {
                forkliftAvailable = forkliftField.value === 'yes';
            }
        }

        // Prepare destination address
        const destination = {
            name: orderData.shipping_address?.attention || orderData.customer_name,
            company: orderData.shipping_address?.company_name || '',
            street: orderData.shipping_address?.address,
            suburb: orderData.shipping_address?.city,
            state: orderData.shipping_address?.state_code,
            postcode: orderData.shipping_address?.zip,
            country: orderData.shipping_address?.country_code || 'AU',
            phone: orderData.shipping_address?.phone || '',
            email: orderData.customer_email || ''
        };

        // Prepare items
        const items = orderData.line_items.map(item => ({
            quantity: item.quantity,
            length: item.package_details?.length || 100,
            width: item.package_details?.width || 50,
            height: item.package_details?.height || 30,
            weight: item.package_details?.weight || 25,
            description: item.name,
            sku: item.sku
        }));

        // Create consignment
        const consignmentRequest = {
            order_number: orderData.salesorder_number,
            destination_address: destination,
            items: items,
            forklift_available: forkliftAvailable,
            customer_email: orderData.customer_email
        };

        // Call our own create consignment endpoint
        const result = await axios.post(
            `https://machship-middleware.onrender.com/api/create-consignment`,
            consignmentRequest
        );

        console.log('Webhook processing complete');

        res.json({
            success: true,
            message: 'Order processed successfully',
            consignment: result.data
        });

    } catch (error) {
        console.error('Webhook error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log('=================================');
    console.log('MachShip Middleware Server');
    console.log('=================================');
    console.log(`Status: Running`);
    console.log(`Port: ${PORT}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Token loaded: ${!!MACHSHIP_API_TOKEN}`);
    console.log(`Company ID: ${MACHSHIP_COMPANY_ID}`);
    console.log('=================================');
    console.log('Available endpoints:');
    console.log('- GET  /health');
    console.log('- GET  /api/test-machship-auth');
    console.log('- POST /api/get-shipping-quote');
    console.log('- POST /api/create-consignment');
    console.log('- POST /api/zoho-webhook');
    console.log('=================================');
});