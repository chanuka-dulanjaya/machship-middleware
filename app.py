from flask import Flask, request, jsonify
import requests
import os
from datetime import datetime

app = Flask(__name__)

# Configuration from environment variables
MACHSHIP_API_TOKEN = os.environ.get('MACHSHIP_API_TOKEN')
MACHSHIP_COMPANY_ID = os.environ.get('MACHSHIP_COMPANY_ID')
MACHSHIP_BASE_URL = os.environ.get('MACHSHIP_BASE_URL', 'https://live.machship.com/apiv2')

# Warehouse details
WAREHOUSE = {
    'contactName': os.environ.get('WAREHOUSE_CONTACT', 'Sky Energy Warehouse'),
    'companyName': os.environ.get('WAREHOUSE_COMPANY', 'Sky Energy Production PTY LTD'),
    'street': os.environ.get('WAREHOUSE_STREET', 'Melbourne CBD'),
    'suburb': os.environ.get('WAREHOUSE_SUBURB', 'Melbourne'),
    'state': os.environ.get('WAREHOUSE_STATE', 'VIC'),
    'postcode': os.environ.get('WAREHOUSE_POSTCODE', '3000'),
    'country': 'AU',
    'phone': os.environ.get('WAREHOUSE_PHONE', '0405050213'),
    'email': os.environ.get('WAREHOUSE_EMAIL', 'asanka@team.newgenconsulting.au')
}

# Session management
session = requests.Session()
session_initialized = False

def init_machship_session():
    """Initialize MachShip session with authentication"""
    global session_initialized
    
    print("🔐 Initializing MachShip session...")
    
    # Clean token (remove Bearer if accidentally included)
    token = MACHSHIP_API_TOKEN.strip().replace('Bearer ', '')
    
    # Set up session headers - MachShip uses 'token' header, NOT Authorization
    session.headers.update({
        'token': token,  # MachShip's custom header
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    })
    
    session_initialized = True
    print("✅ Session initialized with token header")
    return True

def call_machship(endpoint, data):
    """Call MachShip API with correct authentication"""
    
    if not session_initialized:
        init_machship_session()
    
    url = f"{MACHSHIP_BASE_URL}{endpoint}"
    token = MACHSHIP_API_TOKEN.strip().replace('Bearer ', '')
    
    print(f"📤 Calling MachShip: {endpoint}")
    
    # MachShip uses 'token' header for authentication (NOT Authorization: Bearer)
    headers = {
        'token': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
    
    print(f"Using token header (first 10 chars): {token[:10]}...")
    
    try:
        response = session.post(url, json=data, headers=headers, timeout=30)
        
        print(f"Response status: {response.status_code}")
        
        # Check if successful
        if response.status_code == 200:
            response_data = response.json()
            print("✅ MachShip responded successfully!")
            return response_data
        else:
            print(f"❌ Request failed: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            raise Exception(f"MachShip API error: {response.status_code} - {response.text[:100]}")
            
    except Exception as e:
        print(f"❌ Error calling MachShip: {str(e)}")
        raise

@app.route('/')
def home():
    """Home endpoint"""
    return jsonify({
        'status': 'OK',
        'message': 'MachShip Python Middleware',
        'timestamp': datetime.now().isoformat(),
        'version': 'Python/Flask 1.0'
    })

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'machship-python-middleware',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/test-machship-auth', methods=['GET'])
def test_auth():
    """Test MachShip authentication"""
    try:
        print("=== TESTING MACHSHIP AUTH ===")
        print(f"Token (first 10): {MACHSHIP_API_TOKEN[:10] if MACHSHIP_API_TOKEN else 'MISSING'}")
        print(f"Company ID: {MACHSHIP_COMPANY_ID}")
        
        # Test the authenticate/ping endpoint first
        token = MACHSHIP_API_TOKEN.strip().replace('Bearer ', '')
        
        print("Testing with /authenticate/ping endpoint...")
        ping_response = requests.post(
            f"{MACHSHIP_BASE_URL.replace('/apiv2', '')}/apiv2/authenticate/ping",
            headers={
                'token': token,
                'Content-Type': 'application/json'
            },
            timeout=10
        )
        
        print(f"Ping response: {ping_response.status_code}")
        print(f"Ping body: {ping_response.text}")
        
        if ping_response.status_code != 200:
            return jsonify({
                'success': False,
                'message': 'Token authentication failed',
                'status_code': ping_response.status_code,
                'response': ping_response.text
            })
        
        # Now test with actual quote request
        test_request = {
            'companyId': int(MACHSHIP_COMPANY_ID),
            'fromLocation': WAREHOUSE,
            'toLocation': {
                'contactName': 'Test Customer',
                'street': '123 Test St',
                'suburb': 'Melbourne',
                'state': 'VIC',
                'postcode': '3000',
                'country': 'AU'
            },
            'items': [{
                'quantity': 1,
                'length': 100,
                'width': 50,
                'height': 30,
                'weight': 25,
                'itemDescription': 'Test Item'
            }],
            'dangerousGoods': False,
            'tailLiftRequired': False
        }
        
        result = call_machship('/routes/returnrouteswithcomplexitems', test_request)
        
        routes_count = len(result.get('routes', [])) if isinstance(result, dict) else 0
        
        return jsonify({
            'success': True,
            'message': 'MachShip authentication working!',
            'routes_count': routes_count,
            'ping_status': 'OK'
        })
        
    except Exception as e:
        print(f"❌ Auth test failed: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'token_preview': MACHSHIP_API_TOKEN[:10] if MACHSHIP_API_TOKEN else None
        })

@app.route('/api/get-shipping-quote', methods=['POST'])
def get_shipping_quote():
    """Get shipping quote from MachShip"""
    try:
        print("=== NEW QUOTE REQUEST ===")
        print(f"Timestamp: {datetime.now().isoformat()}")
        
        data = request.get_json()
        
        destination = data.get('destination_address')
        items = data.get('items')
        forklift_available = data.get('forklift_available')
        
        print(f"Destination: {destination}")
        print(f"Items count: {len(items) if items else 0}")
        print(f"Forklift: {forklift_available}")
        
        # Validate
        if not destination or not items:
            return jsonify({
                'success': False,
                'error': 'Missing destination_address or items'
            }), 400
        
        # Build MachShip request
        machship_request = {
            'companyId': int(MACHSHIP_COMPANY_ID),
            'fromLocation': WAREHOUSE,
            'toLocation': {
                'contactName': destination.get('name', 'Customer'),
                'companyName': destination.get('company', ''),
                'street': destination.get('street'),
                'suburb': destination.get('suburb'),
                'state': destination.get('state'),
                'postcode': destination.get('postcode'),
                'country': destination.get('country', 'AU'),
                'phone': destination.get('phone', ''),
                'email': destination.get('email', '')
            },
            'items': [
                {
                    'quantity': item.get('quantity', 1),
                    'length': item.get('length', 100),
                    'width': item.get('width', 50),
                    'height': item.get('height', 30),
                    'weight': item.get('weight', 25),
                    'itemDescription': item.get('description', item.get('name', 'Battery'))
                }
                for item in items
            ],
            'dangerousGoods': True,
            'tailLiftRequired': forklift_available == False or forklift_available == 'no'
        }
        
        print("Calling MachShip API...")
        
        # Call MachShip
        response = call_machship('/routes/returnrouteswithcomplexitems', machship_request)
        
        # Check for routes
        if not response or 'routes' not in response:
            return jsonify({
                'success': False,
                'error': 'No routes in response',
                'details': response
            }), 500
        
        routes = response['routes']
        print(f"Found {len(routes)} routes")
        
        if len(routes) == 0:
            return jsonify({
                'success': False,
                'error': 'No shipping routes available'
            }), 404
        
        # Find cheapest
        cheapest = min(routes, key=lambda r: r['totalCost'])
        
        print(f"Cheapest: {cheapest['carrierName']} - ${cheapest['totalCost']}")
        
        return jsonify({
            'success': True,
            'shipping_cost': cheapest['totalCost'],
            'carrier': cheapest['carrierName'],
            'service': cheapest['serviceName'],
            'transit_days': cheapest['totalTransitDays'],
            'route_id': cheapest['routeId'],
            'all_options': [
                {
                    'carrier': route['carrierName'],
                    'service': route['serviceName'],
                    'cost': route['totalCost'],
                    'transit_days': route['totalTransitDays']
                }
                for route in routes
            ]
        })
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500

@app.route('/api/create-consignment', methods=['POST'])
def create_consignment():
    """Create consignment in MachShip"""
    try:
        print("=== NEW CONSIGNMENT REQUEST ===")
        print(f"Timestamp: {datetime.now().isoformat()}")
        
        data = request.get_json()
        
        order_number = data.get('order_number')
        destination = data.get('destination_address')
        items = data.get('items')
        forklift_available = data.get('forklift_available')
        customer_email = data.get('customer_email')
        
        print(f"Order: {order_number}")
        
        # Validate
        if not order_number or not destination or not items:
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        # Build consignment request
        consignment_request = {
            'companyId': int(MACHSHIP_COMPANY_ID),
            'fromLocation': WAREHOUSE,
            'toLocation': {
                'contactName': destination.get('name', 'Customer'),
                'companyName': destination.get('company', ''),
                'street': destination.get('street'),
                'suburb': destination.get('suburb'),
                'state': destination.get('state'),
                'postcode': destination.get('postcode'),
                'country': destination.get('country', 'AU'),
                'phone': destination.get('phone', ''),
                'email': customer_email or destination.get('email', '')
            },
            'items': [
                {
                    'quantity': item.get('quantity', 1),
                    'length': item.get('length', 100),
                    'width': item.get('width', 50),
                    'height': item.get('height', 30),
                    'weight': item.get('weight', 25),
                    'itemDescription': item.get('description', item.get('name', 'Battery')),
                    'itemReference': item.get('sku', '')
                }
                for item in items
            ],
            'dangerousGoods': True,
            'tailLiftRequired': forklift_available == False or forklift_available == 'no',
            'customerReference': order_number,
            'orderNumber': order_number
        }
        
        print("Creating consignment...")
        
        # Call MachShip
        response = call_machship('/consignments/createConsignmentwithComplexItems', consignment_request)
        
        print(f"✅ Consignment created: {response.get('consignmentId')}")
        
        return jsonify({
            'success': True,
            'consignment_id': response.get('consignmentId'),
            'tracking_number': response.get('trackingNumber'),
            'carrier': response.get('carrierName'),
            'message': 'Consignment created successfully'
        })
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500

@app.route('/api/zoho-webhook', methods=['POST'])
def zoho_webhook():
    """Handle Zoho Commerce webhook"""
    try:
        print("=== ZOHO WEBHOOK RECEIVED ===")
        print(f"Timestamp: {datetime.now().isoformat()}")
        
        order_data = request.get_json()
        print(f"Order: {order_data.get('salesorder_number')}")
        
        # Extract forklift availability
        forklift_available = False
        if order_data.get('custom_fields'):
            for field in order_data['custom_fields']:
                if field.get('customfield_id') == '171656000002394353':
                    forklift_available = field.get('value') == 'yes'
                    break
        
        # Prepare data
        shipping_addr = order_data.get('shipping_address', {})
        destination = {
            'name': shipping_addr.get('attention') or order_data.get('customer_name'),
            'company': shipping_addr.get('company_name', ''),
            'street': shipping_addr.get('address'),
            'suburb': shipping_addr.get('city'),
            'state': shipping_addr.get('state_code'),
            'postcode': shipping_addr.get('zip'),
            'country': shipping_addr.get('country_code', 'AU'),
            'phone': shipping_addr.get('phone', ''),
            'email': order_data.get('customer_email', '')
        }
        
        items = [
            {
                'quantity': item.get('quantity'),
                'length': item.get('package_details', {}).get('length', 100),
                'width': item.get('package_details', {}).get('width', 50),
                'height': item.get('package_details', {}).get('height', 30),
                'weight': item.get('package_details', {}).get('weight', 25),
                'description': item.get('name'),
                'sku': item.get('sku')
            }
            for item in order_data.get('line_items', [])
        ]
        
        # Create consignment
        consignment_data = {
            'order_number': order_data.get('salesorder_number'),
            'destination_address': destination,
            'items': items,
            'forklift_available': forklift_available,
            'customer_email': order_data.get('customer_email')
        }
        
        # Call our own endpoint
        result = requests.post(
            'https://machship-middleware.onrender.com/api/create-consignment',
            json=consignment_data,
            timeout=30
        )
        
        return jsonify({
            'success': True,
            'message': 'Order processed',
            'consignment': result.json()
        })
        
    except Exception as e:
        print(f"❌ Webhook error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print("=================================")
    print("MachShip Python Middleware")
    print("=================================")
    print(f"Port: {port}")
    print(f"Token loaded: {bool(MACHSHIP_API_TOKEN)}")
    print(f"Company ID: {MACHSHIP_COMPANY_ID}")
    print("=================================")
    app.run(host='0.0.0.0', port=port)