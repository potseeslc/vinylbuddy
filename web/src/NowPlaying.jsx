import React, { useState, useEffect } from 'react';
import { extractColorsFromImage } from './colorUtils';

// Helper function to calculate luminance of a color
const getLuminance = (hex) => {
  if (!hex) return 0.5;
  
  // Convert hex to RGB
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  // Apply gamma correction
  const a = [r, g, b].map(v => {
    return (v <= 0.03928) ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  
  // Calculate luminance
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
};

// Helper function to adjust color (desaturate and darken for moody dark mode effect)
const adjustColor = (hex, saturationFactor = 0.7, lightnessFactor = 0.7) => {
  if (!hex) return hex;
  
  // Convert hex to RGB first to check if it's valid
  if (!/^#([A-Fa-f0-9]{6})$/.test(hex)) {
    return hex; // Return original if not valid hex
  }
  
  // Convert hex to HSL
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: h = 0;
    }
    h /= 6;
  }
  
  // Adjust saturation and lightness for darker, moodier effect
  s = Math.min(1, s * saturationFactor);
  l = Math.min(1, l * lightnessFactor * 0.8); // Even darker
  
  // Convert back to hex
  let rNew, gNew, bNew;
  
  if (s === 0) {
    rNew = gNew = bNew = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rNew = hue2rgb(p, q, h + 1/3);
    gNew = hue2rgb(p, q, h);
    bNew = hue2rgb(p, q, h - 1/3);
  }
  
  const toHex = (c) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(rNew)}${toHex(gNew)}${toHex(bNew)}`;
};

const NowPlaying = ({ 
  artistName, 
  trackTitle, 
  albumTitle, 
  albumYear, 
  albumArtUrl,
  method
}) => {
  const [colors, setColors] = useState({
    bg1: '#0a0a1e',
    bg2: '#0b1020',
    bg3: '#0c1525',
    text: '#fff'
  });

  // Extract colors from album art when component mounts or albumArtUrl changes
  useEffect(() => {
    const extractColors = async () => {
      try {
        const extractedColors = await extractColorsFromImage(albumArtUrl);
        console.log('Extracted colors:', extractedColors);
        
        // Create darker, moodier colors for dark mode effect
        const darkModeColors = createDarkModeColors(extractedColors);
        
        setColors(darkModeColors);
      } catch (error) {
        console.error('Error extracting colors:', error);
        // Fallback to default dark colors
        setColors({
          bg1: '#0a0a1e',
          bg2: '#0b1020',
          bg3: '#0c1525',
          text: '#fff'
        });
      }
    };

    if (albumArtUrl) {
      extractColors();
    }
  }, [albumArtUrl]);

  // Create deeper, moodier colors for dark mode effect
  const createDarkModeColors = (extractedColors) => {
    // Use extracted colors but adjust them for a darker, more dramatic effect
    const bg1 = extractedColors.darkVibrant || extractedColors.vibrant || '#0a0a1e';
    const bg2 = extractedColors.dominant || extractedColors.muted || '#0b1020';
    const bg3 = extractedColors.muted || extractedColors.lightMuted || '#0c1525';
    
    // Apply stronger darkening and desaturation for moodier effect
    const adjustedBg1 = adjustColor(bg1, 0.7, 0.6); // More desaturation, darker
    const adjustedBg2 = adjustColor(bg2, 0.6, 0.5); // Even more desaturation, darker
    const adjustedBg3 = adjustColor(bg3, 0.6, 0.4); // Most desaturation, darkest
    
    return {
      bg1: adjustedBg1,
      bg2: adjustedBg2,
      bg3: adjustedBg3,
      text: '#fff'
    };
  };

  // Calculate text color based on background luminance
  const calculateTextColor = () => {
    const dominantColor = colors.bg2 || '#16213e';
    const luminance = getLuminance(dominantColor);
    // Use white text for dark backgrounds, black text for light backgrounds
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  // Calculate text shadow for better contrast
  const calculateTextShadow = () => {
    const dominantColor = colors.bg2 || '#16213e';
    const luminance = getLuminance(dominantColor);
    // Use darker shadow for light backgrounds, lighter shadow for dark backgrounds
    if (luminance > 0.5) {
      return '0 2px 12px rgba(0,0,0,0.4), 0 0 2px rgba(0,0,0,0.6)';
    } else {
      return '0 2px 12px rgba(0,0,0,0.6), 0 0 2px rgba(255,255,255,0.2)';
    }
  };

  const textColor = calculateTextColor();
  const textShadow = calculateTextShadow();
  const backgroundGradient = `linear-gradient(135deg, ${colors.bg1}, ${colors.bg2}, ${colors.bg3})`;

  return (
    <div className="now-playing-wrapper" style={{
      minHeight: '100vh',
      background: backgroundGradient,
      padding: 'clamp(32px, 5vw, 80px)',
      transition: 'background 0.5s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div className="content" style={{
        width: 'min(1200px, 95vw)'
      }}>
        <div style={{
          display: 'flex',
          gap: 'clamp(40px, 5vw, 64px)',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          {/* Album art */}
          <div className="album-art" style={{
            flex: '1 1 360px',
            maxWidth: '420px',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.3), 0 0 80px rgba(255, 255, 255, 0.1)'
          }}>
            {albumArtUrl ? (
              <img 
                src={albumArtUrl} 
                alt={`${albumTitle} cover art`}
                style={{
                  width: '100%',
                  display: 'block'
                }}
              />
            ) : (
              <div style={{
                width: '100%',
                background: `linear-gradient(135deg, ${colors.bg2}, ${colors.bg3})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'clamp(2rem, 8vw, 4rem)',
                fontWeight: 'bold',
                color: 'rgba(255,255,255,0.95)',
                aspectRatio: '1/1'
              }}>
                {trackTitle?.charAt(0) || '🎵'}
              </div>
            )}
          </div>

          {/* Track metadata without scrim (transparent background) */}
          <div className="track-metadata" style={{
            flex: '1 1 300px',
            padding: 'clamp(20px, 3vw, 32px)',
            borderRadius: '20px',
            background: 'transparent',
            maxWidth: '600px'
          }}>
            {/* Artist name */}
            <div className="artist" style={{
              fontSize: 'clamp(20px, 2.5vw, 28px)',
              fontWeight: '500',
              color: textColor,
              textShadow: textShadow,
              overflow: 'hidden',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: '2',
              WebkitBoxOrient: 'vertical',
              marginBottom: '12px',
              letterSpacing: '0.5px'
            }}>
              {artistName}
            </div>

            {/* Track title */}
            <h1 className="title" style={{
              fontSize: 'clamp(32px, 4vw, 50px)',
              fontWeight: '700',
              margin: '0 0 16px 0',
              lineHeight: '1.2',
              color: textColor,
              textShadow: textShadow,
              overflow: 'hidden',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: '2',
              WebkitBoxOrient: 'vertical'
            }}>
              {trackTitle}
            </h1>

            {/* Album and year */}
            <div className="album" style={{
              fontSize: 'clamp(20px, 2.2vw, 26px)',
              color: textColor,
              textShadow: textShadow,
              overflow: 'hidden',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: '2',
              WebkitBoxOrient: 'vertical',
              marginBottom: '20px',
              fontWeight: '400'
            }}>
              {albumTitle}
              {albumYear && ` • ${albumYear}`}
            </div>

            {/* Status/Method badge */}
            {method && (
              <div className="source" style={{
                fontSize: '12px',
                fontWeight: '400',
                letterSpacing: '0.05em',
                color: textColor,
                textShadow: textShadow,
                textTransform: 'uppercase',
                opacity: '0.15',
                marginTop: '20px'
              }}>
                Identified via {method}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        /* Remove any conflicting styles */
        .album-art {
          height: auto !important;
        }
        
        @media (min-width: 768px) {
          .track-metadata {
            text-align: left;
          }
          
          .track-metadata .artist,
          .track-metadata .title,
          .track-metadata .album,
          .track-metadata .source {
            text-align: left;
          }
        }

        /* MOBILE - Phone (< 768px) */
        @media (max-width: 767px) {
          .content > div {
            flex-direction: column;
            text-align: center;
          }
          
          .track-metadata {
            text-align: center;
          }
          
          .track-metadata .artist,
          .track-metadata .title,
          .track-metadata .album,
          .track-metadata .source {
            text-align: center;
          }
          
          .album-art {
            max-width: 300px;
          }
        }
        
        /* Extra small screens */
        @media (max-width: 480px) {
          .now-playing-wrapper {
            padding: clamp(16px, 5vw, 24px);
          }
          
          .content > div {
            gap: clamp(15px, 4vw, 24px);
          }
          
          .album-art {
            max-width: 250px;
          }
        }
      `}</style>
    </div>
  );
};

export default NowPlaying;
