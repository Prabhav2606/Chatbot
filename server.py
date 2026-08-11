from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
from boto3.dynamodb.conditions import Key
import json
import os
import hashlib
import re
import time
from decimal import Decimal

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# --- CONFIGURATION ---
# When deployed on Render, boto3 will automatically read your AWS keys from environment variables.
REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
MODEL_ID = "us.amazon.nova-micro-v1:0"

bedrock_client = boto3.client("bedrock-runtime", region_name=REGION)
dynamodb_client = boto3.client("dynamodb", region_name=REGION)

def get_dynamo_resource():
    return boto3.resource("dynamodb", region_name=REGION)

# --- DATABASE FUNCTIONS ---

def init_db():
    """Creates DynamoDB tables in AWS if they do not already exist."""
    
    # 1. Create Users Table
    try:
        dynamodb_client.create_table(
            TableName='NovaChatUsers',
            KeySchema=[{'AttributeName': 'email', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'email', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        print("Creating NovaChatUsers table in AWS... (This takes a few seconds)")
        get_dynamo_resource().Table('NovaChatUsers').wait_until_exists()
    except dynamodb_client.exceptions.ResourceInUseException:
        pass # Table already exists

    # 2. Create Messages Table
    try:
        dynamodb_client.create_table(
            TableName='NovaChatMessages',
            KeySchema=[
                {'AttributeName': 'user_id', 'KeyType': 'HASH'},
                {'AttributeName': 'timestamp', 'KeyType': 'RANGE'} # Sort key to keep messages in order
            ],
            AttributeDefinitions=[
                {'AttributeName': 'user_id', 'AttributeType': 'S'},
                {'AttributeName': 'timestamp', 'AttributeType': 'N'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        print("Creating NovaChatMessages table in AWS... (This takes a few seconds)")
        get_dynamo_resource().Table('NovaChatMessages').wait_until_exists()
    except dynamodb_client.exceptions.ResourceInUseException:
        pass # Table already exists

def load_history(user_id):
    table = get_dynamo_resource().Table('NovaChatMessages')
    
    # Fetch all messages for the user, ordered oldest to newest
    response = table.query(
        KeyConditionExpression=Key('user_id').eq(user_id),
        ScanIndexForward=True 
    )
    
    items = response.get('Items', [])
    
    # If new user, seed the greeting
    if len(items) == 0:
        greeting = "Hello! How can I help you today?"
        save_message(user_id, 'assistant', greeting)
        items = [{'role': 'assistant', 'text_content': greeting}]
        
    history = []
    for item in items:
        history.append({
            "role": item['role'],
            "content": [{"text": item['text_content']}]
        })
    return history

def save_message(user_id, role, text):
    table = get_dynamo_resource().Table('NovaChatMessages')
    table.put_item(
        Item={
            'user_id': user_id,
            'timestamp': Decimal(str(time.time())), # High-precision timestamp for sorting
            'role': role,
            'text_content': text
        }
    )

def clear_db(user_id):
    table = get_dynamo_resource().Table('NovaChatMessages')
    
    # Fetch all items for the user so we can delete them
    response = table.query(
        KeyConditionExpression=Key('user_id').eq(user_id)
    )
    
    # Batch delete is much faster and cheaper in DynamoDB
    with table.batch_writer() as batch:
        for item in response.get('Items', []):
            batch.delete_item(
                Key={
                    'user_id': user_id,
                    'timestamp': item['timestamp']
                }
            )
            
    # Add the initial greeting back
    save_message(user_id, 'assistant', "Hello! How can I help you today?")

# --- VALIDATION HELPERS ---

def is_valid_email(email):
    return re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", email)

def is_valid_password(password):
    if len(password) < 8: return False
    if not re.search(r"[A-Z]", password): return False
    if not re.search(r"[a-z]", password): return False
    if not re.search(r"\d", password): return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password): return False
    return True

# --- AUTHENTICATION ROUTES ---

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.json
    email = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()
    
    if not is_valid_email(email):
        return jsonify({"error": "Invalid email address format."}), 400
    if not is_valid_password(password):
        return jsonify({"error": "Password must be at least 8 characters long, include an uppercase letter, a lowercase letter, a number, and a special character."}), 400

    hashed_pw = hashlib.sha256(password.encode()).hexdigest()
    table = get_dynamo_resource().Table('NovaChatUsers')
    
    # Check if user exists
    response = table.get_item(Key={'email': email})
    if 'Item' in response:
        return jsonify({"error": "An account with this email already exists."}), 400
        
    table.put_item(
        Item={
            'email': email,
            'password_hash': hashed_pw
        }
    )
    return jsonify({"status": "success"})

@app.route("/api/signin", methods=["POST"])
def signin():
    data = request.json
    email = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()
    hashed_pw = hashlib.sha256(password.encode()).hexdigest()

    try:
        table = get_dynamo_resource().Table('NovaChatUsers')
        response = table.get_item(Key={'email': email})
        item = response.get('Item')
    
        if item and item.get('password_hash') == hashed_pw:
            return jsonify({"status": "success", "user_id": email})
        else:
            return jsonify({"error": "Invalid email or password"}), 401

    except Exception as e:
        # This will catch AWS errors and send them to your browser console as JSON!
        print(f"DynamoDB Error: {str(e)}")
        return jsonify({"error": f"Database Connection Error: {str(e)}"}), 500

@app.route("/api/delete_account", methods=["POST"])
def delete_account():
    data = request.json
    user_id = data.get("user_id")
    password = data.get("password")
    
    if not user_id or not password:
        return jsonify({"error": "Email and password are required"}), 400
        
    hashed_pw = hashlib.sha256(password.encode()).hexdigest()
        
    try:
        # 1. Verify User Credentials First
        users_table = get_dynamo_resource().Table('NovaChatUsers')
        response = users_table.get_item(Key={'email': user_id})
        item = response.get('Item')
        
        if not item or item.get('password_hash') != hashed_pw:
            return jsonify({"error": "Incorrect password."}), 401
            
        # 2. Password is correct. Delete all messages from Chat table
        messages_table = get_dynamo_resource().Table('NovaChatMessages')
        msg_response = messages_table.query(
            KeyConditionExpression=Key('user_id').eq(user_id)
        )
        with messages_table.batch_writer() as batch:
            for msg_item in msg_response.get('Items', []):
                batch.delete_item(
                    Key={
                        'user_id': user_id,
                        'timestamp': msg_item['timestamp']
                    }
                )
        
        # 3. Delete the user from the Users table
        users_table.delete_item(
            Key={'email': user_id}
        )
        
        return jsonify({"status": "deleted"})
        
    except Exception as e:
        print(f"DynamoDB Delete Error: {str(e)}")
        return jsonify({"error": f"Database Connection Error: {str(e)}"}), 500

# --- CHAT ROUTES ---

@app.route("/")
def home():
    return app.send_static_file("index.html")

@app.route("/api/history", methods=["GET"])
def get_history():
    user_id = request.args.get("user_id")
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"history": load_history(user_id)})

@app.route("/api/clear", methods=["POST"])
def clear_history():
    data = request.json
    user_id = data.get("user_id")
    if user_id: clear_db(user_id)
    return jsonify({"status": "cleared"})

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    new_message_text = data.get("message", "")
    user_id = data.get("user_id")

    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    if not new_message_text: return jsonify({"error": "No message provided"}), 400

    save_message(user_id, "user", new_message_text)
    history = load_history(user_id)

    api_messages = history.copy()
    if len(api_messages) > 0 and api_messages[0]["role"] == "assistant":
        api_messages.pop(0)

    payload = {
        "messages": api_messages,
        "inferenceConfig": {"maxTokens": 1024, "temperature": 0.7}
    }

    try:
        response = bedrock_client.invoke_model(
            modelId=MODEL_ID, contentType="application/json", accept="application/json", body=json.dumps(payload)
        )
        response_body = json.loads(response['body'].read())
        assistant_reply = response_body['output']['message']['content'][0]['text']
        save_message(user_id, "assistant", assistant_reply)
        return jsonify({"reply": assistant_reply})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

try:
    init_db()
except Exception as e:
    print("Database init skipped/failed:", e)

if __name__ == "__main__":
    print("Server starting on http://127.0.0.1:3008")
    app.run(host="0.0.0.0", port=3008, debug=True)
