#!/usr/bin/env python3
"""
Hybrid Music Recognition System
Works with both high-quality and low-quality audio
"""
import requests
import json
from urllib.parse import quote
import os

class HybridMusicRecognizer:
    def __init__(self, acoustid_key=None):
        self.acoustid_key = acoustid_key or "AftSw9HPRB"  # Your key
        self.user_agent = 'VinylNowPlaying/1.0 (https://github.com)'
    
    def recognize_hybrid(self, audio_file=None, artist_hint=None, album_hint=None, track_hint=None):
        """
        Try multiple recognition methods in order of reliability
        """
        results = {
            "methods_tried": [],
            "best_match": None,
            "all_results": {}
        }
        
        # Method 1: Try audio fingerprinting (your existing method)
        if audio_file and os.path.exists(audio_file):
            print("_attempting audio fingerprinting...")
            fingerprint_result = self.identify_by_fingerprint(audio_file)
            results["methods_tried"].append("fingerprint")
            results["all_results"]["fingerprint"] = fingerprint_result
            
            if fingerprint_result.get("success"):
                results["best_match"] = {
                    "method": "fingerprint",
                    "data": fingerprint_result
                }
                return results
        
        # Method 2: Try metadata-based recognition
        print("attempting metadata recognition...")
        metadata_result = self.identify_by_metadata(artist_hint, album_hint, track_hint)
        results["methods_tried"].append("metadata")
        results["all_results"]["metadata"] = metadata_result
        
        if metadata_result.get("success"):
            results["best_match"] = {
                "method": "metadata",
                "data": metadata_result
            }
            return results
        
        # Method 3: Try heuristic-based search
        print("attempting heuristic search...")
        heuristic_result = self.identify_by_heuristics(artist_hint, album_hint, track_hint)
        results["methods_tried"].append("heuristics")
        results["all_results"]["heuristics"] = heuristic_result
        
        if heuristic_result.get("success"):
            results["best_match"] = {
                "method": "heuristics",
                "data": heuristic_result
            }
        
        return results
    
    def identify_by_fingerprint(self, audio_file):
        """
        Your existing fingerprinting approach (stub implementation)
        In practice, this would integrate with your existing system
        """
        # This would call your actual fingerprinting code
        # For now, returning failure to demonstrate fallback
        return {
            "success": False,
            "error": "Audio fingerprinting not implemented in this demo",
            "method": "fingerprint"
        }
    
    def identify_by_metadata(self, artist=None, album=None, track=None):
        """
        Identify using MusicBrainz metadata API
        """
        if not any([artist, album, track]):
            return {"success": False, "error": "No metadata provided"}
        
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
            
            url = "https://musicbrainz.org/ws/2/recording"
            params = {
                'query': query,
                'fmt': 'json',
                'limit': 5
            }
            
            headers = {'User-Agent': self.user_agent}
            
            response = requests.get(url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "method": "metadata",
                    "count": data.get('count', 0),
                    "results": data.get('recordings', [])[:3]  # Top 3 results
                }
            else:
                return {
                    "success": False,
                    "method": "metadata",
                    "error": f"API error {response.status_code}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "method": "metadata",
                "error": str(e)
            }
    
    def identify_by_heuristics(self, artist_hint=None, album_hint=None, track_hint=None):
        """
        Simple heuristic-based search using partial matches
        """
        # Combine all hints into search terms
        search_terms = [term for term in [artist_hint, album_hint, track_hint] if term]
        
        if not search_terms:
            return {"success": False, "error": "No search terms provided"}
        
        try:
            # Try broader search with OR conditions
            query = " OR ".join([f'"{term}"' for term in search_terms])
            
            url = "https://musicbrainz.org/ws/2/recording"
            params = {
                'query': query,
                'fmt': 'json',
                'limit': 10
            }
            
            headers = {'User-Agent': self.user_agent}
            
            response = requests.get(url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "method": "heuristics",
                    "count": data.get('count', 0),
                    "results": data.get('recordings', [])[:5]  # Top 5 results
                }
            else:
                return {
                    "success": False,
                    "method": "heuristics",
                    "error": f"API error {response.status_code}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "method": "heuristics",
                "error": str(e)
            }

def demo_hybrid_recognition():
    """
    Demonstrate the hybrid recognition system
    """
    recognizer = HybridMusicRecognizer()
    
    print("=== Hybrid Music Recognition Demo ===")
    print("Testing recognition with partial information that would work even with poor audio quality\n")
    
    # Test cases that would work even with degraded audio quality
    test_scenarios = [
        {
            "name": "Classic Rock - Partial Info",
            "hints": {"artist": "Led Zeppelin", "track": "Stairway"}
        },
        {
            "name": "Pop Music - Recent Hit",
            "hints": {"artist": "The Weeknd", "track": "Blinding"}
        },
        {
            "name": "Classic Album",
            "hints": {"album": "Dark Side of the Moon"}
        },
        {
            "name": "Vague Recognition",
            "hints": {"track": "Hotel California"}
        }
    ]
    
    for i, scenario in enumerate(test_scenarios, 1):
        print(f"--- Test {i}: {scenario['name']} ---")
        hints = scenario['hints']
        print(f"Input hints: {hints}")
        
        result = recognizer.recognize_hybrid(
            artist_hint=hints.get('artist'),
            album_hint=hints.get('album'),
            track_hint=hints.get('track')
        )
        
        if result["best_match"]:
            method = result["best_match"]["method"]
            data = result["best_match"]["data"]
            print(f"✅ Success using {method} method")
            print(f"   Found {data.get('count', 'unknown')} matches")
            if 'results' in data and data['results']:
                first_result = data['results'][0]
                print(f"   Top match: {first_result.get('title', 'Unknown')} by {', '.join([a.get('name', '') for a in first_result.get('artist-credit', [{'name': 'Unknown'}])])}")
        else:
            print("❌ No matches found with any method")
        
        print(f"   Methods tried: {', '.join(result['methods_tried'])}")
        print()

if __name__ == "__main__":
    demo_hybrid_recognition()
