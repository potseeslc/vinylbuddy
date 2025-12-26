import React, { useState, useEffect, useRef } from 'react';
import NowPlaying from './NowPlaying';

const ContinuousListening = ({ onResult, onError, onStatusUpdate, autoStart = false }) => {
  const [isListening, setIsListening] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('Ready to listen');
  const [detectionCount, setDetectionCount] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const chunkBufferRef = useRef([]);
  const hasStartedRef = useRef(false);

  // Update status callback
  const updateStatus = (status) => {
    setCurrentStatus(status);
    if (onStatusUpdate) onStatusUpdate(status);
  };

  // Normalize string for comparison (remove extra spaces, convert to lowercase)
  const normalizeString = (str) => {
    if (!str) return '';
    return str.toLowerCase().trim();
  };

  // Check if two songs are the same
  const isSameSong = (song1, song2) => {
    if (!song1 || !song2) return false;
    
    const title1 = normalizeString(song1.recording.title);
    const title2 = normalizeString(song2.recording.title);
    const artist1 = normalizeString(song1.release.artist);
    const artist2 = normalizeString(song2.release.artist);
    
    console.log('Comparing songs:');
    console.log('  Song 1: ', title1, 'by', artist1);
    console.log('  Song 2: ', title2, 'by', artist2);
    
    // If titles and artists match exactly, it's the same song
    if (title1 === title2 && artist1 === artist2) {
      console.log('  Result: Exact match');
      return true;
    }
    
    // If titles match and artists are similar (contain each other or share common words)
    if (title1 === title2) {
      // Check if artists are similar
      if (artist1.includes(artist2) || artist2.includes(artist1)) {
        console.log('  Result: Same title, similar artists');
        return true;
      }
    }
    
    console.log('  Result: Different songs');
    return false;
  };

  // Start continuous listening
  const startListening = async () => {
    console.log('startListening called, isListening:', isListening, 'hasStartedRef:', hasStartedRef.current);
    // Reset the hasStartedRef flag when starting
    hasStartedRef.current = false;
    
    if (isListening || hasStartedRef.current) {
      console.log('Already listening, returning early');
      return;
    }

    try {
      updateStatus('Requesting microphone permission...');
      console.log('Requesting microphone permission...');
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log('Microphone access granted');

      // Set up MediaRecorder with a more compatible format
      let mimeType = "";
      // Try WebM with Opus codec first as it's widely supported
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
        console.log("Using WebM with Opus codec");
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
        console.log("Using WebM format");
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
        console.log("Using OGG with Opus codec");
      } else {
        console.log("No supported MIME type found, using default format");
      }
      
      console.log("Using MIME type:", mimeType || "default");
      
      const recorderOptions = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      // Handle recorded data
      recorder.ondataavailable = (e) => {
        console.log('MediaRecorder ondataavailable event:', e);
        if (e.data) {
          console.log('Data size:', e.data.size, 'bytes');
          console.log('Data type:', e.data.type);
          
          // Check if data is valid
          if (e.data.size > 0) {
            chunkBufferRef.current.push(e.data);
            console.log('Audio data available:', e.data.size, 'bytes');
            console.log('Total chunks in buffer:', chunkBufferRef.current.length);
          } else {
            console.log('Received empty data chunk');
          }
        } else {
          console.log('No data in event');
        }
      };

      // Handle recorder errors
      recorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        updateStatus('MediaRecorder error: ' + e.error.message);
      };

      // Handle recorder state changes
      recorder.onstart = () => {
        console.log('MediaRecorder started');
      };
      
      recorder.onstop = () => {
        console.log('MediaRecorder stopped');
        // Process the recorded data when recorder stops
        if (chunkBufferRef.current.length > 0) {
          console.log('Processing recorded data after recorder stop');
          const blob = new Blob(chunkBufferRef.current, { type: recorder.mimeType || "audio/webm" });
          chunkBufferRef.current = [];
          
          // Check if we have enough data (at least 50KB for a reasonable audio sample)
          if (blob.size >= 50000) {
            console.log('Sending recorded audio for processing:', blob.size, 'bytes');
            processAudioChunk(blob);
          } else {
            console.log('Audio data too small, skipping processing:', blob.size, 'bytes');
            updateStatus(`Audio data too small (${Math.round(blob.size / 1024)} KB) - skipping`);
          }
        }
      };
      
      recorder.onpause = () => {
        console.log('MediaRecorder paused');
      };
      
      recorder.onresume = () => {
        console.log('MediaRecorder resumed');
      };

      // Start recording (no time slice for now, we'll manually stop and process)
      recorder.start();
      updateStatus('Microphone active - Listening for music...');
      console.log('MediaRecorder started with state:', recorder.state);
      hasStartedRef.current = true;

      // Set up interval for periodic recognition - stop, process, then restart
      let counter = 0;
      intervalRef.current = setInterval(async () => {
        counter++;
        console.log(`Processing interval #${counter}`);
        
        // Stop current recording and process the data
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          updateStatus(`Processing audio chunk #${counter}...`);
          console.log('Stopping recorder to process data');
          mediaRecorderRef.current.stop();
          
          // Wait a bit for the stop event to process
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Restart recording
          console.log('Restarting recorder');
          const newRecorder = new MediaRecorder(stream, recorderOptions);
          newRecorder.ondataavailable = recorder.ondataavailable;
          newRecorder.onerror = recorder.onerror;
          newRecorder.onstart = recorder.onstart;
          newRecorder.onstop = recorder.onstop;
          newRecorder.onpause = recorder.onpause;
          newRecorder.onresume = recorder.onresume;
          
          mediaRecorderRef.current = newRecorder;
          newRecorder.start();
          console.log('MediaRecorder restarted with state:', newRecorder.state);
        } else {
          updateStatus(`No active recording - attempt #${counter}`);
        }
      }, 15000); // Check every 15 seconds for better audio quality

      setIsListening(true);
      console.log('Listening state set to true');
    } catch (error) {
      console.error('Error starting listening:', error);
      updateStatus(`Error: ${error.message}`);
      if (onError) onError(error);
      stopListening();
    }
  };

  // Process audio chunk for recognition (using Shazam only)
  const processAudioChunk = async (blob) => {
    try {
      updateStatus(`Processing audio (${Math.round(blob.size / 1024)} KB)...`);
      setDetectionCount(prev => prev + 1);

      // Log blob information for debugging
      console.log('Processing audio chunk:');
      console.log('  Blob type:', blob.type);
      console.log('  Blob size:', blob.size);
      
      // Check if blob is valid
      if (blob.size === 0) {
        updateStatus(`Empty audio data - attempt #${detectionCount + 1}`);
        return;
      }

      // Log blob content for debugging (first few bytes)
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      console.log('  First 10 bytes:', Array.from(uint8Array.slice(0, 10)));
      
      const fd = new FormData();
      // Use appropriate file extension based on mime type
      let filename = "sample.webm";
      if (blob.type.includes("wav")) {
        filename = "sample.wav";
      } else if (blob.type.includes("webm")) {
        filename = "sample.webm";
      } else if (blob.type.includes("ogg")) {
        filename = "sample.ogg";
      }
      fd.append("audio", blob, filename);
      
      console.log('  Sending file with name:', filename);

      // Use Shazam recognition only for best results
      updateStatus(`Sending to Shazam recognition service...`);
      
      console.log('Sending request to /api/identify-shazam');
      const res = await fetch("/api/identify-shazam", { 
        method: "POST", 
        body: fd,
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(30000)
      });
      
      console.log('Received response from server, status:', res.status);
      updateStatus(`Received response from recognition service`);
      const json = await res.json();
      console.log('Recognition result:', json);

      if (json.success) {
        // Check if this is a different song than the last one
        const sameSong = isSameSong(lastResult, json);
        
        console.log('Song comparison - Last:', lastResult ? `${lastResult.recording.title} by ${lastResult.release.artist}` : 'None',
                    'Current:', `${json.recording.title} by ${json.release.artist}`,
                    'Same song:', sameSong);
        
        if (!sameSong) {
          setLastResult(json);
          updateStatus(`Found: ${json.recording.title} by ${json.release.artist}`);
          
          // Pass result to parent component
          if (onResult) onResult(json);
          
          // Add a small delay before next detection to ensure proper state update
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          updateStatus(`Same song detected - #${detectionCount + 1}`);
        }
      } else {
        updateStatus(`No music detected - attempt #${detectionCount + 1}`);
        console.log('No music detected:', json.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Recognition error:', error);
      if (error.name === 'AbortError') {
        updateStatus(`Recognition timeout - attempt #${detectionCount + 1}`);
      } else {
        updateStatus(`Recognition error: ${error.message} - attempt #${detectionCount + 1}`);
      }
      if (onError) onError(error);
    }
  };

  // Stop continuous listening
  const stopListening = () => {
    console.log('stopListening called');
    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current && 
        (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('Error stopping recorder:', e);
      }
    }

    // Stop all audio tracks
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn('Error stopping tracks:', e);
      }
    }

    // Close audio context
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.warn('Error closing audio context:', e);
      }
    }

    setIsListening(false);
    hasStartedRef.current = false;
    updateStatus('Stopped listening');
    chunkBufferRef.current = [];
  };

  // Auto-start when component mounts if requested
  useEffect(() => {
    console.log('useEffect triggered, autoStart:', autoStart);
    if (autoStart) {
      console.log('Auto-start requested, scheduling startListening');
      // Add a small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        console.log('Auto-start timer fired, calling startListening');
        startListening();
      }, 100);
      
      return () => {
        console.log('Cleaning up auto-start timer');
        clearTimeout(timer);
      };
    }
  }, [autoStart]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      console.log('Component unmounting, calling stopListening');
      stopListening();
    };
  }, []);

  // For the continuous mode UI, we want to hide the controls but keep the component running
  if (autoStart) {
    return (
      <div className="continuous-listening-container" style={{
        position: 'fixed',
        top: '0',
        left: '0',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: -1
      }}>
        <div style={{ fontSize: '1px', color: 'transparent' }}>
          Continuous Listening Active - Status: {currentStatus}
        </div>
        <div style={{ fontSize: '1px', color: 'transparent' }}>
          Detections: {detectionCount}
        </div>
      </div>
    );
  }

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
    <div className="continuous-listening-container" style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div className="controls" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        alignItems: 'center',
        marginBottom: '30px'
      }}>
        <button
          onClick={isListening ? stopListening : startListening}
          style={{
            background: isListening ? '#ff4757' : '#2d7df6',
            color: '#fff',
            border: 'none',
            padding: '15px 30px',
            borderRadius: '12px',
            fontSize: '1.1rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            minWidth: '200px'
          }}
        >
          {isListening ? 'Stop Listening' : 'Start Continuous Listening'}
        </button>

        <div className="status-info" style={{
          display: 'flex',
          gap: '20px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <div className="status-box" style={{
            padding: '15px 20px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(10px)',
            minWidth: '200px'
          }}>
            <div style={{ opacity: 0.8, fontSize: '0.9rem', marginBottom: '5px' }}>Status</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{currentStatus}</div>
          </div>

          <div className="detection-count" style={{
            padding: '15px 20px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(10px)',
            minWidth: '200px'
          }}>
            <div style={{ opacity: 0.8, fontSize: '0.9rem', marginBottom: '5px' }}>Detections</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{detectionCount} attempts</div>
          </div>
        </div>

        {/* Display turntable icon when not listening or waiting for first detection */}
        {(!isListening || (isListening && detectionCount === 0 && !lastResult)) && (
          <div className="listening-icon" style={{ 
            color: 'rgba(255, 255, 255, 0.35)',
            margin: '20px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <TurntableIcon size={48} />
            <p style={{ 
              margin: '10px 0 0 0',
              fontSize: '1rem',
              color: 'rgba(255, 255, 255, 0.5)'
            }}>
              {isListening ? 'Listening for music...' : 'Ready to detect music'}
            </p>
          </div>
        )}

        <div className="info-text" style={{
          maxWidth: '600px',
          padding: '15px',
          borderRadius: '12px',
          background: 'rgba(255, 204, 102, 0.1)',
          color: '#ffcc66',
          fontSize: '0.9rem'
        }}>
          <p style={{ margin: 0 }}>
            Continuous listening checks for music every 15 seconds. 
            The system will automatically detect new songs as they play.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContinuousListening;
