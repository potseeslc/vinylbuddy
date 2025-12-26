#!/usr/bin/env python3
"""
Simple metadata-based music recognition for vinyl collections
"""
import requests
import json
from urllib.parse import quote

def identify_by_metadata(artist=None, album=None, track=None):
    """
    Identify music using metadata instead of audio fingerprinting
    """
    if not any([artist, album, track]):
        return {"error": "At least one of artist, album, or track is required"}
    
    # Try MusicBrainz API first
    results = search_musicbrainz(artist, album, track)
    
    if results and results.get('count', 0) > 0:
        return {
            "success": True,
            "method": "metadata",
            "results": results
        }
    
    # Fall back to AcoustID metadata search if available
    return {
        "success": False,
        "method": "metadata",
        "message": "No matches found in metadata databases"
    }

def search_musicbrainz(artist=None, album=None, track=None):
    """
    Search MusicBrainz database using metadata
    """
    try:
        # Build search query
        query_parts = []
        if artist:
            query_parts.append(f'artist:"{artist}"')
        if album:
            query_parts.append(f'release:"{album}"')
        if track:
            query_parts.append(f'recording:"{track}"')
        
        query = " AND ".join(query_parts)
        encoded_query = quote(query)
        
        url = f"https://musicbrainz.org/ws/2/recording"
        params = {
            'query': query,
            'fmt': 'json',
            'limit': 10
        }
        
        headers = {
            'User-Agent': 'VinylNowPlaying/1.0 (https://github.com)'
        }
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"MusicBrainz API error: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"Error searching MusicBrainz: {e}")
        return None

def simple_recognition_demo():
    """
    Demo of simple recognition approaches
    """
    print("=== Simple Metadata-Based Recognition Demo ===")
    
    # Example: If you know partial information
    test_cases = [
        {"artist": "Led Zeppelin", "track": "Stairway to Heaven"},
        {"artist": "The Weeknd", "track": "Blinding Lights"},
        {"album": "Rumours", "artist": "Fleetwood Mac"}
    ]
    
    for i, case in enumerate(test_cases, 1):
        print(f"\nTest Case {i}: {case}")
        result = identify_by_metadata(**case)
        if result.get("success"):
            print(f"✅ Found {result.get('results', {}).get('count', 0)} matches")
        else:
            print(f"❌ No matches found")

if __name__ == "__main__":
    simple_recognition_demo()
