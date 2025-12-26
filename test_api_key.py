#!/usr/bin/env python3
"""
Test script with a known working fingerprint for a popular song
"""
import requests
import json

def test_with_known_song():
    # Test with a fingerprint that SHOULD work - "Blinding Lights" by The Weeknd
    # This is a theoretical test - in reality we'd need the actual fingerprint
    
    print("Testing AcoustID with a simple parameter check...")
    
    client_key = "AftSw9HPRB"
    
    # First, test with minimal valid request
    params = {
        "client": client_key,
        "duration": 30,
        "fingerprint": "AQAB",  # Minimal valid fingerprint
        "meta": "recordings+releases",
        "format": "json"
    }
    
    try:
        response = requests.post("https://api.acoustid.org/v2/lookup", data=params, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Status: {data.get('status')}")
            if 'error' in data:
                print(f"Error: {data['error']}")
            elif 'results' in data:
                print(f"Results count: {len(data['results'])}")
        else:
            print(f"Response text: {response.text}")
            
    except Exception as e:
        print(f"Error: {e}")
    
    # Test API key validity with a different approach
    print("\nTesting API key validity with a metadata request...")
    try:
        # Try to get some metadata without fingerprint
        meta_params = {
            "client": client_key,
            "meta": "recordings+releases",
            "format": "json"
        }
        meta_response = requests.get("https://api.acoustid.org/v2/meta", params=meta_params, timeout=10)
        print(f"Meta Status Code: {meta_response.status_code}")
        if meta_response.status_code == 200:
            print("API key appears to be valid!")
        else:
            print(f"Meta response: {meta_response.text}")
            
    except Exception as e:
        print(f"Meta error: {e}")

if __name__ == "__main__":
    test_with_known_song()
