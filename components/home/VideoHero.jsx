'use client';

import { useRef, useState } from 'react';

export default function VideoHero() {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);

  const toggleSound = () => {
    if (!videoRef.current) return;
    const next = !muted;
    videoRef.current.muted = next;
    setMuted(next);
  };

  return (
    <>
      <div className="video-hero-wrap">
        <video
          ref={videoRef}
          src="/videos/triovideo.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="video-hero-media"
        />

        <div className="video-hero-overlay" />

        <button
          className="video-hero-sound-btn"
          onClick={toggleSound}
          aria-label={muted ? 'Unmute video' : 'Mute video'}
        >
          {muted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
          <span className="sound-label">{muted ? 'Sound off' : 'Sound on'}</span>
        </button>
      </div>

      <style jsx>{`
        .video-hero-wrap {
          position: relative;
          width: 100%;
          height: 560px;
          max-height: 70vh;
          overflow: hidden;
          background: #0a0a0a;
          display: block;
        }

        @media (max-width: 768px) {
          .video-hero-wrap {
            height: 260px;
            max-height: 50vh;
          }
        }

        .video-hero-media {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
        }

        .video-hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0.25) 0%,
            rgba(0,0,0,0.02) 35%,
            rgba(0,0,0,0.02) 65%,
            rgba(0,0,0,0.55) 100%
          );
          pointer-events: none;
        }

        .video-hero-sound-btn {
          position: absolute;
          bottom: 18px;
          right: 20px;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 13px 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(201,168,76,0.4);
          background: rgba(8,8,8,0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #FFF7E6;
          cursor: pointer;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: border-color 0.2s, background 0.2s;
        }

        .video-hero-sound-btn:hover {
          border-color: rgba(201,168,76,0.8);
          background: rgba(20,20,20,0.85);
        }

        .sound-label { line-height: 1; }
      `}</style>
    </>
  );
}
