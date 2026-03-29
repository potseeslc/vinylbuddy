import React, { useEffect, useMemo, useState } from "react";
import NowPlaying from "./NowPlaying";

const POLL_INTERVAL_MS = 10000;

function formatUpdatedAt(updatedAt) {
  if (!updatedAt) return "Waiting for first detection";

  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) {
    return "Waiting for first detection";
  }

  return `Updated ${updatedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function App() {
  const [nowPlaying, setNowPlaying] = useState(null);
  const [status, setStatus] = useState("Connecting to Vinyl Buddy...");
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchNowPlaying() {
      try {
        const response = await fetch("/api/now_playing", {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (!isMounted) return;

        setNowPlaying(payload);
        setIsConnected(true);
        setStatus(formatUpdatedAt(payload.updated_at));
      } catch (error) {
        if (!isMounted) return;
        setIsConnected(false);
        setStatus(`Connection problem: ${error.message}`);
      }
    }

    fetchNowPlaying();
    const intervalId = window.setInterval(fetchNowPlaying, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const isIdle = !nowPlaying || nowPlaying.state !== "playing";

  const statusTone = useMemo(() => {
    if (!isConnected) return "status-pill offline";
    if (isIdle) return "status-pill idle";
    return "status-pill live";
  }, [isConnected, isIdle]);

  if (isIdle) {
    return (
      <main className="kiosk-shell">
        <section className="idle-screen">
          <div className="idle-mark">Vinyl Buddy</div>
          <h1>Ready for the next side</h1>
          <p className="idle-copy">
            Listener is running headless. Album art and track details will appear here when a record is recognized.
          </p>
          <div className={statusTone}>{status}</div>
        </section>
      </main>
    );
  }

  return (
    <main className="kiosk-shell">
      <NowPlaying
        artistName={nowPlaying.artist}
        trackTitle={nowPlaying.title}
        albumTitle={nowPlaying.album}
        albumYear={nowPlaying.album_year}
        albumArtUrl={nowPlaying.image_url}
        method={nowPlaying.source}
      />
      <div className={statusTone}>{status}</div>
    </main>
  );
}
