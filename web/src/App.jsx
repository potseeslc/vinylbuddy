import React, { useState, useEffect, useRef } from "react";
import NowPlaying from "./NowPlaying";
import ContinuousListening from "./ContinuousListening";

export default function App() {
  const [status, setStatus] = useState("Idle");
  const [result, setResult] = useState(null);
  const [continuousMode, setContinuousMode] = useState(false); // Start on initial screen
  const [config, setConfig] = useState({ musicbrainz_contact: false });
  const [lastDetectionTime, setLastDetectionTime] = useState(null); // Track last detection time
  const inactivityTimeout = 5 * 60 * 1000; // 5 minutes inactivity timeout
  const inactivityTimerRef = useRef(null);

  // Load configuration on startup
  useEffect(() => {
    fetch("/api/config")
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.log("Could not load config", err));
  }, []);

  // Handle continuous listening results
  const handleContinuousResult = (result) => {
    console.log('Received continuous listening result:', result);
    setResult(result);
    setLastDetectionTime(Date.now()); // Update last detection time
    setStatus("Track detected");
  };

  const handleContinuousError = (error) => {
    console.error('Continuous listening error:', error);
    setStatus(`Continuous listening error: ${error.message}`);
  };

  const handleContinuousStatus = (status) => {
    console.log('Continuous listening status:', status);
    setStatus(status);
  };

  // Start continuous listening
  const startContinuousListening = async () => {
    try {
      // First, show a message to the user about microphone access
      setStatus("Please allow microphone access when prompted...");
      
      // Small delay to let the user see the message
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if MediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API is not supported in this browser');
      }
      
      // Request microphone access with simple constraints
      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Successfully got microphone access
      console.log('Microphone access granted');
      setContinuousMode(true);
      setResult(null);
      setStatus("Microphone access granted - starting continuous listening...");
      
      // Stop the stream immediately as ContinuousListening component will request it again
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      console.error('Microphone access error:', error);
      
      // Provide clear error messages
      let errorMessage = "Microphone access denied - please check browser permissions";
      
      if (error.name === 'NotAllowedError') {
        errorMessage = "Please tap the lock icon in the address bar and allow microphone access";
      } else if (error.name === 'NotFoundError') {
        errorMessage = "No microphone found - please connect a microphone";
      } else if (error.name === 'NotReadableError') {
        errorMessage = "Microphone is busy - close other apps using microphone";
      }
      
      setStatus(errorMessage);
      
      // Still start continuous mode so user can see the error and try again
      setContinuousMode(true);
      setResult(null);
    }
  };

  // Check for inactivity and return to initial screen if needed
  useEffect(() => {
    if (result && result.success && lastDetectionTime) {
      // Clear any existing timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      // Set new timer to return to initial screen after inactivity
      inactivityTimerRef.current = setTimeout(() => {
        setContinuousMode(false);
        setResult(null);
        setLastDetectionTime(null);
        setStatus("Returned to initial screen for privacy");
      }, inactivityTimeout);
    }

    // Cleanup timer on unmount
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [result, lastDetectionTime, inactivityTimeout]);

  // Show continuous listening interface - FULL SCREEN NOW PLAYING EXPERIENCE
  if (continuousMode) {
    // Minimal SVG Turntable Icon Component
    const TurntableIcon = ({ size = 64, isSpinning = false }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        style={isSpinning ? { animation: 'spin 2s linear infinite' } : {}}
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
        
        <style jsx>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
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
            background: 'linear-gradient(135deg, #0a0a1e, #0b1020, #0c1525)',
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
                <TurntableIcon size={120} isSpinning={true} />
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

  // Initial screen with start button
  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a1e, #0b1020, #0c1525)',
      color: '#ffffff',
      fontFamily: 'Helvetica, Arial, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        {/* Display larger turntable icon for starting */}
        <div 
          onClick={startContinuousListening}
          style={{ 
            color: 'rgba(255, 255, 255, 0.85)',
            margin: '20px 0 30px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'transform 0.2s ease',
          }}
          onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
        >
          <svg
            width={120}
            height={120}
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
          <p style={{ 
            margin: '20px 0 0 0',
            fontSize: '1.4rem',
            color: 'rgba(255, 255, 255, 0.85)',
            fontWeight: '300'
          }}>
            Start Vinyl Buddy
          </p>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '10px' }}>Click the record player to start detecting music</p>
          <p style={{ opacity: 0.7, fontSize: '0.9rem', marginTop: '10px' }}>
            For privacy, the app will return to this screen after 5 minutes of inactivity
          </p>
          <p style={{ 
            opacity: 0.9, 
            fontSize: '0.9rem', 
            marginTop: '20px', 
            padding: '10px', 
            backgroundColor: 'rgba(255, 204, 102, 0.2)', 
            borderRadius: '8px' 
          }}>
            <strong>Important:</strong> You'll need to allow microphone access when prompted. 
            If no prompt appears, check your browser's site permissions.
          </p>
        </div>
      </div>
      
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
    </div>
  );
}
