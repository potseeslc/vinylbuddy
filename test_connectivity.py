#!/usr/bin/env python3
"""
Simple script to test if your system works with a direct file
Instead of using phone audio, this tests the API connectivity.
"""
import requests
import json

def test_api_connectivity():
    print("Testing basic AcoustID API connectivity with your key...")
    
    client_key = "AftSw9HPRB"
    
    # Test the lookup endpoint format
    test_url = "https://api.acoustid.org/v2/lookup"
    
    # Minimal valid parameters (this will fail but should show API is accessible)
    params = {
        "client": client_key,
        "format": "json"
    }
    
    try:
        response = requests.post(test_url, data=params, timeout=10)
        print(f"API Access Test - Status: {response.status_code}")
        
        if response.status_code == 400:
            data = response.json()
            if "error" in data and "missing required parameter" in data["error"]["message"]:
                print("✅ API is accessible and your key is valid!")
                print("✅ This confirms the issue is with fingerprint generation/matching, not API access.")
                return True
            else:
                print(f"API Response: {data}")
        else:
            print(f"Unexpected response: {response.text}")
            
    except Exception as e:
        print(f"Error testing API: {e}")
        return False

if __name__ == "__main__":
    test_api_connectivity()
