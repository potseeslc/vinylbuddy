import requests
import sys

# Your API key
api_key = "7mDeTlOno2"

print(f"Testing AcoustID API key: {api_key}")

# Test endpoint - this is a simple test that doesn't require audio
url = "https://api.acoustid.org/v2/lookup"

# Simple test parameters (this will fail because we don't have a fingerprint, but should give us a different error if the key is valid)
params = {
    "client": api_key,
    "duration": 30,
    "meta": "recordings+releases",
    "format": "json"
}

try:
    response = requests.post(url, data=params, timeout=10)
    print(f"Response status code: {response.status_code}")
    print(f"Response headers: {dict(response.headers)}")
    
    try:
        json_response = response.json()
        print(f"Response JSON: {json_response}")
        
        if "error" in json_response:
            error_info = json_response["error"]
            print(f"Error code: {error_info.get('code', 'N/A')}")
            print(f"Error message: {error_info.get('message', 'N/A')}")
            
            if "invalid fingerprint" in error_info.get("message", "").lower():
                print("✓ API key appears to be valid! (Got 'invalid fingerprint' error which is expected)")
            elif "invalid API key" in error_info.get("message", "").lower():
                print("✗ API key is invalid")
            else:
                print("? Unclear if API key is valid - got different error")
        else:
            print("✓ API key appears to be valid! (Got successful response)")
            
    except ValueError:
        print(f"Response text (not JSON): {response.text}")
        
except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")

print("\nTest completed.")
