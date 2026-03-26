import { useRef, useCallback, useState, useEffect } from 'react';
import { usePlaybackStore } from '../stores/playbackStore';
import { wsSend, onWsMessage, offWsMessage } from './useWebSocket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const volumeRef = useRef(70);
  const connectedRef = useRef(false);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('awks-volume');
    const v = saved ? parseInt(saved) : 70;
    volumeRef.current = v;
    return v;
  });
  const [listening, setListening] = useState(false);
  const hasTrack = usePlaybackStore((s) => !!s.currentTrack);

  // Connect to WebRTC — no state dependencies, uses refs only
  const connect = useCallback(() => {
    // Don't reconnect if already connected
    if (connectedRef.current && pcRef.current && pcRef.current.iceConnectionState === 'connected') {
      return;
    }

    // Clean up existing connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    connectedRef.current = false;

    console.log('[webrtc] creating peer connection...');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      console.log('[webrtc] got remote track:', event.track.kind);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.srcObject = event.streams[0];
      audio.volume = volumeRef.current / 100;

      // Set up Web Audio API analyser for visualizer
      // Must use createMediaStreamSource for WebRTC streams, not createMediaElementSource
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(event.streams[0]);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        // Don't connect analyser to destination — the <audio> element already handles playback.
        // Connecting to destination would cause double audio output.
        analyserRef.current = analyser;
      } catch (e) {
        console.warn('[webrtc] failed to create analyser:', e);
      }

      audio.play().then(() => {
        console.log('[webrtc] audio playing');
        connectedRef.current = true;
        setListening(true);
      }).catch(() => {
        const tryPlay = () => {
          audio.play().then(() => {
            connectedRef.current = true;
            setListening(true);
            document.removeEventListener('click', tryPlay);
            document.removeEventListener('keydown', tryPlay);
          }).catch(() => {});
        };
        document.addEventListener('click', tryPlay);
        document.addEventListener('keydown', tryPlay);
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsSend('WEBRTC_ICE_CANDIDATE', {
          candidate: JSON.stringify(event.candidate.toJSON()),
        });
      }
    };

    let disconnectTimer: ReturnType<typeof setTimeout>;
    pc.oniceconnectionstatechange = () => {
      console.log('[webrtc] ICE state:', pc.iceConnectionState);
      clearTimeout(disconnectTimer);

      if (pc.iceConnectionState === 'connected') {
        connectedRef.current = true;
      } else if (pc.iceConnectionState === 'failed') {
        connectedRef.current = false;
        setListening(false);
        setTimeout(connect, 2000);
      } else if (pc.iceConnectionState === 'disconnected') {
        // Give it 3 seconds to recover before reconnecting
        disconnectTimer = setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            console.log('[webrtc] still disconnected, reconnecting...');
            connectedRef.current = false;
            setListening(false);
            connect();
          }
        }, 3000);
      }
    };

    pc.createOffer().then((offer) => {
      return pc.setLocalDescription(offer);
    }).then(() => {
      console.log('[webrtc] sending offer to server');
      wsSend('WEBRTC_OFFER', { sdp: pc.localDescription!.sdp });
    }).catch((err) => {
      console.error('[webrtc] offer error:', err);
    });
  }, []); // No dependencies — uses refs

  // Listen for signaling responses from server
  useEffect(() => {
    onWsMessage('WEBRTC_ANSWER', (data: unknown) => {
      console.log('[webrtc] received answer from server');
      const { sdp } = data as { sdp: string };
      const pc = pcRef.current;
      if (!pc) return;
      pc.setRemoteDescription({ type: 'answer', sdp }).catch((err) => {
        console.error('[webrtc] answer error:', err);
      });
    });

    onWsMessage('WEBRTC_ICE_CANDIDATE', (data: unknown) => {
      const pc = pcRef.current;
      if (!pc) return;
      const candidate = data as RTCIceCandidateInit;
      pc.addIceCandidate(candidate).catch((err) => {
        console.error('[webrtc] ICE candidate error:', err);
      });
    });

    return () => {
      offWsMessage('WEBRTC_ANSWER');
      offWsMessage('WEBRTC_ICE_CANDIDATE');
    };
  }, []);

  // Connect when there's a track — delay avoids StrictMode double-connect
  useEffect(() => {
    if (hasTrack) {
      const timer = setTimeout(() => {
        // Only connect if not already connected (StrictMode guard)
        if (!connectedRef.current) {
          connect();
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      connectedRef.current = false;
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
      setListening(false);
    }
  }, [hasTrack, connect]);

  const setVolume = useCallback((vol: number) => {
    volumeRef.current = vol;
    setVolumeState(vol);
    localStorage.setItem('awks-volume', String(vol));
    if (audioRef.current) {
      audioRef.current.volume = vol / 100;
    }
  }, []);

  return { volume, setVolume, listening, analyserRef };
}
