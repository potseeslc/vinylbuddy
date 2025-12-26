import React, { useMemo, useState, useEffect } from "react";
import NowPlaying from "./NowPlaying";
import ContinuousListening from "./ContinuousListening";

export default function App() {
  const [status, setStatus] = useState("Idle");
  const [result, setResult] = useState(null);
  const [seconds, setSeconds] = useState(30);
  const [isRecording, setIsRecording] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [config, setConfig] = useState({ musicbrainz_contact: false });
  const [musicbrainzContact, setMusicbrainzContact] = useState("");
  
  // Metadata input fields
  const [artistHint, setArtistHint] = useState("");
  const [albumHint, setAlbumHint] = useState("");
  const [trackHint, setTrackHint] = useState("");

  const canUseMediaRecorder = useMemo(() => {
    return typeof navigator !== "undefined" &&
           !!navigator.mediaDevices?.getUserMedia &&
           typeof MediaRecorder !== "undefined";
  }, []);

  // Load configuration on startup
  useEffect(() => {
    fetch("/api/config")
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.log("Could not load config", err));
  }, []);

  async function recordAndUpload(method = "enhanced") {
    if (isRecording) return;
    
    setIsRecording(true);
    setResult(null);

    if (!canUseMediaRecorder) {
      setStatus("MediaRecorder not supported in this browser.");
      setIsRecording(false);
      return;
    }

    try {
      setStatus("Requesting microphone permission...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Choose a mime type the browser supports
      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
        MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" :
        "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      setStatus(`Recording ${seconds}s...`);
      recorder.start();

      // Recording duration
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

      recorder.stop();

      const blob = await new Promise((resolve) => {
        recorder.onstop = () => {
          // stop mic
          stream.getTracks().forEach(t => t.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
      });

      setStatus(`Uploading (${Math.round(blob.size / 1024)} KB)...`);

      const fd = new FormData();
      fd.append("audio", blob, "sample.webm");

      // Use different endpoints based on method
      let endpoint = "/api/identify-enhanced";
      let description = "Enhanced recognition (Shazam)";
      
      if (method === "shazam") {
        endpoint = "/api/identify-shazam";
        description = "Shazam recognition";
      }

      setStatus(`Processing with ${description}...`);

      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json();

      setResult(json);
      setStatus("Done.");
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      setResult({ error: error.message });
    } finally {
      setIsRecording(false);
    }
  }

  async function identifyWithMetadata() {
    if (!artistHint && !albumHint && !trackHint) {
      setStatus("Please enter at least one hint (artist, album, or track)");
      return;
    }

    try {
      setStatus("Searching with metadata...");
      setResult(null);

      const res = await fetch("/api/identify-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist: artistHint || undefined,
          album: albumHint || undefined,
          track: trackHint || undefined
        })
      });

      const json = await res.json();

      setResult(json);
      setStatus("Done.");
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      setResult({ error: error.message });
    }
  }

  async function saveConfig() {
    try {
      setStatus("Saving configuration...");
      
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          musicbrainzContact: musicbrainzContact || undefined
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        setConfig(data.config);
        setStatus("Configuration saved successfully!");
        // Clear the input fields
        setMusicbrainzContact("");
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      setStatus(`Error saving config: ${error.message}`);
    }
  }

  // Handle continuous listening results
  const handleContinuousResult = (result) => {
    console.log('Received continuous listening result:', result);
    setResult(result);
  };

  const handleContinuousError = (error) => {
    console.error('Continuous listening error:', error);
    setStatus(`Continuous listening error: ${error.message}`);
  };

  const handleContinuousStatus = (status) => {
    console.log('Continuous listening status:', status);
    setStatus(status);
  };

  // Toggle continuous mode
  const toggleContinuousMode = () => {
    if (continuousMode) {
      // Exiting continuous mode
      setResult(null);
    }
    setContinuousMode(!continuousMode);
  };

  // Show NowPlaying component when we have a successful result
  if (result && result.success && !continuousMode) {
    return (
      <NowPlaying
        artistName={result.release.artist}
        trackTitle={result.recording.title}
        albumTitle={result.release.title}
        albumYear={result.release.date ? result.release.date.split('-')[0] : null}
        albumArtUrl={result.coverArtUrl}
        method={result.method}
      />
    );
  }

  // Show continuous listening interface - FULL SCREEN NOW PLAYING EXPERIENCE
  if (continuousMode) {
    // Minimal SVG Turntable Icon Component
    const TurntableIcon = ({ size = 64 }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {/* Base */}
        <rect
          x="4"
          y="6"
          width="56"
          height="52"
          rx="10"
          fill="currentColor"
          opacity="0.35"
        />
        
        {/* Record */}
        <circle
          cx="30"
          cy="32"
          r="14"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.6"
        />
        <circle
          cx="30"
          cy="32"
          r="3"
          fill="currentColor"
          opacity="0.6"
        />
        
        {/* Tonearm */}
        <line
          x1="42"
          y1="18"
          x2="50"
          y2="30"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.6"
        />
        <circle
          cx="50"
          cy="30"
          r="2"
          fill="currentColor"
          opacity="0.6"
        />
      </svg>
    );

    return (
      <div style={{ position: 'relative', minHeight: '100vh' }}>
        {/* Always show NowPlaying if we have a result, otherwise show initial screen */}
        {result && result.success ? (
          <NowPlaying
            artistName={result.release.artist}
            trackTitle={result.recording.title}
            albumTitle={result.release.title}
            albumYear={result.release.date ? result.release.date.split('-')[0] : null}
            albumArtUrl={result.coverArtUrl}
            method={result.method}
          />
        ) : (
          <div style={{ 
            minHeight: '100vh',
            background: '#0b1020',
            color: '#ffffff',
            fontFamily: 'Helvetica, Arial, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{ textAlign: 'center', maxWidth: '600px' }}>
              {/* Display larger turntable icon while waiting for first detection */}
              <div className="listening-icon" style={{ 
                color: 'rgba(255, 255, 255, 0.35)',
                margin: '20px 0 30px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <TurntableIcon size={120} />
                <p style={{ 
                  margin: '20px 0 0 0',
                  fontSize: '1.4rem',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontWeight: '300'
                }}>
                  Listening for music...
                </p>
              </div>
              
              <div style={{ marginBottom: '30px' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: '10px' }}>Start playing music and we'll detect the songs automatically</p>
                <p style={{ opacity: 0.7, fontSize: '0.9rem', marginTop: '10px' }}>
                  Microphone access has been requested
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Exit button overlay */}
        <button 
          onClick={toggleContinuousMode}
          style={{ 
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(0, 0, 0, 0.5)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '0.9rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            zIndex: 1000
          }}
        >
          Exit Continuous Mode
        </button>
        
        {/* Status indicator */}
        <div style={{ 
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.5)',
          color: '#fff',
          padding: '6px 16px',
          borderRadius: '20px',
          fontSize: '0.8rem',
          zIndex: 1000
        }}>
          {status}
        </div>
        
        {/* ContinuousListening component always running in the background with autoStart */}
        <div style={{ position: 'fixed', top: '0', left: '0', width: '0', height: '0', overflow: 'hidden', zIndex: -1 }}>
          <ContinuousListening 
            onResult={handleContinuousResult}
            onError={handleContinuousError}
            onStatusUpdate={handleContinuousStatus}
            autoStart={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ 
      minHeight: '100vh',
      background: '#0b1020',
      color: '#ffffff',
      fontFamily: 'Helvetica, Arial, sans-serif'
    }}>
      <div className="now-playing-container" style={{ 
        maxWidth: '800px',
        margin: '0 auto',
        padding: '20px',
        textAlign: 'center'
      }}>
        <header style={{ marginBottom: '30px' }}>
          <h1 style={{ 
            marginTop: 10,
            fontSize: '2.2rem',
            fontWeight: '600',
            letterSpacing: '-0.5px'
          }}>Vinyl Buddy</h1>
          <p style={{ 
            opacity: 0.8, 
            marginTop: 0,
            fontSize: '1.1rem'
          }}>
            Tap to record a sample and identify the vinyl album
          </p>
        </header>

        <div style={{ 
          display: 'flex', 
          gap: 12, 
          alignItems: 'center', 
          justifyContent: 'center', 
          flexWrap: 'wrap', 
          marginBottom: 30,
          padding: '15px',
          borderRadius: '16px',
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ opacity: 0.85, fontSize: '0.9rem' }}>
              Length:
            </label>
            <input
              type="number"
              min="15"
              max="120"
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              style={{ 
                width: 70, 
                padding: '8px 12px', 
                borderRadius: '10px', 
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.2)',
                color: '#ffffff',
                textAlign: 'center'
              }}
              disabled={isRecording}
            />
            <span style={{ opacity: 0.7, fontSize: '0.9rem' }}>seconds</span>
          </div>

          <button 
            onClick={() => recordAndUpload("enhanced")} 
            style={{ 
              background: '#2d7df6',
              color: '#fff',
              border: 'none',
              padding: '12px 20px',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
            disabled={isRecording}
          >
            {isRecording ? (
              <>
                <span className="recording-indicator" style={{ 
                  width: 12, 
                  height: 12, 
                  borderRadius: '50%', 
                  background: '#ff4757',
                  animation: 'pulse 1.5s infinite'
                }}></span>
                Listening...
              </>
            ) : "Start Listening"}
          </button>
          
          <button 
            onClick={() => recordAndUpload("shazam")} 
            style={{ 
              background: '#8a2be2',
              color: '#fff',
              border: 'none',
              padding: '12px 20px',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            disabled={isRecording}
          >
            Shazam
          </button>
        </div>

        <div style={{ 
          display: 'flex', 
          gap: 10, 
          justifyContent: 'center', 
          marginBottom: 30
        }}>
          <button 
            onClick={toggleContinuousMode}
            style={{ 
              background: '#2d7df6',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Continuous Mode
          </button>
          
          <button 
            onClick={() => setShowMetadata(!showMetadata)} 
            style={{ 
              background: 'transparent',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {showMetadata ? "Hide Hints" : "Use Hints"}
          </button>
          
          <button 
            onClick={() => setShowConfig(!showConfig)} 
            style={{ 
              background: 'transparent',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {showConfig ? "Hide Config" : "API Keys"}
          </button>
        </div>

        {showMetadata && (
          <div className="metadata-box" style={{ 
            marginBottom: 30, 
            padding: '20px', 
            borderRadius: '16px', 
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Help Identify This Record</h3>
            <p style={{ opacity: 0.8, marginBottom: '20px' }}>
              Enter any information you know about the record to help with identification:
            </p>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: 15, 
              marginBottom: 15 
            }}>
              <input
                type="text"
                value={artistHint}
                onChange={(e) => setArtistHint(e.target.value)}
                placeholder="Artist (e.g., Led Zeppelin)"
                style={{ 
                  padding: '12px 15px', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: '#ffffff',
                  fontSize: '1rem'
                }}
              />
              <input
                type="text"
                value={trackHint}
                onChange={(e) => setTrackHint(e.target.value)}
                placeholder="Track/Song (e.g., Stairway)"
                style={{ 
                  padding: '12px 15px', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: '#ffffff',
                  fontSize: '1rem'
                }}
              />
            </div>
            
            <input
              type="text"
              value={albumHint}
              onChange={(e) => setAlbumHint(e.target.value)}
              placeholder="Album (optional)"
              style={{ 
                width: '100%', 
                padding: '12px 15px', 
                borderRadius: '12px', 
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.2)',
                color: '#ffffff',
                fontSize: '1rem',
                marginBottom: '20px'
              }}
            />
            
            <button 
              onClick={identifyWithMetadata}
              style={{ 
                background: '#2d7df6',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Identify with Hints
            </button>
          </div>
        )}

        {showConfig && (
          <div className="config-box" style={{ 
            marginBottom: 30, 
            padding: '25px', 
            borderRadius: '16px', 
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(10px)',
            textAlign: 'left'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>API Configuration</h3>
            
            <div style={{ marginBottom: '25px' }}>
              <p style={{ opacity: 0.8, marginBottom: '15px' }}>Current configuration status:</p>
              <ul style={{ 
                listStyle: 'none', 
                padding: 0, 
                margin: 0,
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '10px'
              }}>
                <li style={{ 
                  padding: '10px', 
                  borderRadius: '10px', 
                  background: 'rgba(0, 0, 0, 0.2)'
                }}>
                  MusicBrainz Contact: {config.musicbrainz_contact ? "✅ Set" : "❌ Not set"}
                </li>
              </ul>
            </div>
            
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                MusicBrainz Contact (URL or email):
                <input
                  type="text"
                  value={musicbrainzContact}
                  onChange={(e) => setMusicbrainzContact(e.target.value)}
                  placeholder="https://yourwebsite.com or your@email.com"
                  style={{ 
                    width: '100%', 
                    padding: '12px 15px', 
                    borderRadius: '12px', 
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    background: 'rgba(0, 0, 0, 0.2)',
                    color: '#ffffff',
                    fontSize: '1rem',
                    marginTop: '8px'
                  }}
                />
              </label>
            </div>
            
            <button 
              onClick={saveConfig}
              style={{ 
                background: '#28a745',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Save Configuration
            </button>
          </div>
        )}

        <div className="status-box" style={{ 
          margin: '20px 0 30px',
          padding: '16px 20px',
          borderRadius: '14px',
          background: 'rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ opacity: 0.8, fontSize: '0.9rem', marginBottom: '5px' }}>Status</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{status}</div>
        </div>

        {result && !result.success && (
          <div className="result-box" style={{ 
            padding: '25px', 
            borderRadius: '16px', 
            backgroundColor: 'rgba(255, 50, 50, 0.1)',
            backdropFilter: 'blur(10px)',
            textAlign: 'left',
            marginBottom: '30px'
          }}>
            <h3 style={{ 
              marginTop: 0, 
              marginBottom: '15px',
              color: '#ff6b6b'
            }}>Identification Error</h3>
            <p style={{ marginBottom: '15px' }}>Error: {result.error}</p>
            <details style={{ 
              background: 'rgba(0, 0, 0, 0.2)',
              padding: '15px',
              borderRadius: '10px',
              marginTop: '15px'
            }}>
              <summary style={{ 
                cursor: 'pointer',
                fontWeight: '500'
              }}>Technical Details</summary>
              <pre style={{ 
                fontSize: '0.8rem',
                overflow: 'auto',
                marginTop: '10px',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px'
              }}>
                {JSON.stringify(result.acoustidData || result.shazamData, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {!canUseMediaRecorder && (
          <p style={{ 
            marginTop: '20px', 
            padding: '15px',
            borderRadius: '12px',
            background: 'rgba(255, 204, 102, 0.1)',
            color: '#ffcc66',
            textAlign: 'center'
          }}>
            This browser may not support MediaRecorder. If you're on iPad Safari and it fails,
            we'll need to implement a WebAudio WAV encoder fallback.
          </p>
        )}
      </div>
      
      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
        
        .recording-indicator {
          animation: pulse 1.5s infinite;
        }
      `}</style>
    </div>
  );
}
