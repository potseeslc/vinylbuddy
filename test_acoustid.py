#!/usr/bin/env python3
"""
Test script to debug AcoustID recognition issues
"""
import requests
import json

def test_acoustid_api():
    # Test with a known good fingerprint from the AcoustID database
    # This is from the official AcoustID documentation
    print("Testing AcoustID API with a known good fingerprint...")
    
    # Using a known good client key
    client_key = "AftSw9HPRB"
    
    # Test parameters with a generic fingerprint format
    params = {
        "client": client_key,
        "duration": 30,
        "fingerprint": "AQABzqSSjEoWCTk0ZY8RJjq-HPeJByee5QiS52jCB2WW431wHk8UnApyaA-mPAh6KfCVYptRJjpxP0jmI1XDBv2PkzueCCdyaLnQPwlyVPyNKkkSGW8e4o-KXhkaJ8rxK7hzWMmIi1HSDM8lnIkOZd2O5wn-4BeaH72O_7h0PMOfIPk5hGNsPBvuCT4mvQmuHFeCN0fyHg1q9dDSfOgPrYyo4l6yIFSOK0VPGT6PdNC-OMg_oT-M8ngY4ykeGcfzRHjYUOiVHE2PPBeh50a6cB5-BD3h38IkSkmCv8SrutByOgmFI_jRH7sp_PiQE1qfDWnypvh6uMTTJUfIBtqPH3VCR9AV78i3oGjG4GOGZ4zxHAjzQz_C5MJ_NM2EWsNDHr-R74GeR0Na9Xh03EezvBF6XUMe_HiPSosUNNIuxPrRB94SCs9u_Eif5YFGJrqRb2hGKQrqJHhCxHwyNMn4QLs-PAe0jJmPMn_wr9CdI_0oPDkqK4OT5uiPkEmOhMzRjAxu48nE4C-ao4_gJSGha1GC3yFOH_X4oGkqAye8PFqKiBeeI9KPwz7K6A3-oqmkoo-SaWgmHuELPTvCDH17PFN2NOklBbUjjThxlBIaTsWnisGZGzU3OId_dN-Cyx-axQnxG8mpo1eHXIuKPktRJg6LK8fhB9dxXgmeoAlD9CYaTS3qKDf6tImQntDmG-GP5scZtIkG7zH640ce6D_ypXjyoMtmyQizwDm-HA_C52iqPMWzjviFPziP90HOQ88kxF4VdA4c4tPxMUgnO8KTC-mZoy6uKEdQ24FjpoIcZhmDvMKPs2MQPhp05UTIH7_gMcSuw0_wg9KkJOiHC8lFIcybo3ke3DY-7FkDV8lxHs-Pp6GioKKOZ2iuOMUpEw--Bel_KG-OnGDHK3jOEM2OK6h8fEp1nGmc4LOGB4GWpwgpqRgn4tGRP9CiZoGmI__xHM2Wo2-FyUoPHwy7Hnk-aJeQPocfN2BkY3rQaKnxKQvCHMl6_LhyPCl-4fBOIk-WSkLyBP0SPHBueChzCecQ_oF4Hv2FPD9-5MmhB7GzRoGrJXh_XB_CqUo1aBkT4dOHmDnOHOF3NONO6MjXYg8ubT2qZAnBJMqIPFlUQx_yo5eKZnh4Jcg5SDFFGnmDejmOKX5QU_lw4ygZRmiWpMePn_ATHbmmFEmZCPfwJ8EToT-aycTDHWeTHEkz58gj_MYfBWUlWOoL58gTLcV1Qj_C_sKLJuQV1Aly5ThzJD3Kp0LD9HiStbjr4HrRpM2CkFIOnRfyVLiIO8E34WJO9JmVIuGDkMbTC1-Y44py_EiWH5H2RLhZcD_qND7S8UjGkMS5HeeN7zhxHRd5NONzAMSoQURAxhxBChCEjEKwUiGEEk4YAoxCDAqigSCAGSOYAAQwAJAQAkiklBCMAMIMAxIYQxDhgCDDFEAKAKsccAQhoSyRyhEmFECGQECkEEQAACzSQjnGkACEEECEJYYQC4QjQEihHSEEEaEAQgBRYoQQklmkjAHYEIIBEIQqg5BTAgCFCBDMEKiYQApBToAgTAACDCAKIMSIEgYIIgAAgDKihAHGAKEIYsIKQhiCghgijABIEaCIVEIhhYRhUBjnQDCIMAGFQUQpAwkyTACjECEaAGKMMUwYqghhHABgkGKGQAIUMMgwSgUBgilgiINGGOAoEMAJIwgxjgkBgRCGEGAFsMAjgoAjBSDhDAFACWEEIoYQoTxAhBhhFBMEAFAMAYgbiQiwSCAlSAMIcQCAEQxxIYhiQIBoABSUEAAIMEQww4QTTgGBGAKSGIKAoAYRhxBwFEgInBDIMIAIUxIBAgA",
        "meta": "recordings+releases",
        "format": "json"
    }
    
    try:
        response = requests.post("https://api.acoustid.org/v2/lookup", data=params, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Status: {data.get('status')}")
            if 'results' in data:
                print(f"Results count: {len(data['results'])}")
                if data['results']:
                    print("First result:")
                    print(json.dumps(data['results'][0], indent=2))
                else:
                    print("No matches found - this indicates the fingerprint is valid but not in database")
            else:
                print("No results key in response")
        else:
            print("API request failed")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_acoustid_api()
