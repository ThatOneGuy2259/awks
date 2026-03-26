import { useRef, useCallback, useState, useEffect } from 'react';
import { usePlaybackStore } from '../stores/playbackStore';
import { wsSend, onWsMessage, offWsMessage } from './useWebSocket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('awks-volume');
    return saved ? parseInt(saved) : 70;
  });
  const [listening, setListening] = useState(false);
  const hasTrack = usePlaybackStore((s) => !!s.currentTrack);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // We only want to receive audio
    pc.addTransceiver('audio', { direction: 'recvonly' });

    // When we get the remote audio track, play it
    pc.ontrack = (event) => {
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.srcObject = event.streams[0];
      audio.volume = volume / 100;
      audio.play().then(() => {
        setListening(true);
      }).catch(() => {
        // Autoplay blocked — retry on interaction
        const tryPlay = () => {
          audio.play().then(() => {
            setListening(true);
            document.removeEventListener('click', tryPlay);
            document.removeEventListener('keydown', tryPlay);
          }).catch(() => {});
        };
        document.addEventListener('click', tryPlay);
        document.addEventListener('keydown', tryPlay);
      });
    };

    // Send ICE candidates to server
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsSend('WEBRTC_ICE_CANDIDATE', {
          candidate: JSON.stringify(event.candidate.toJSON()),
        });
      }
    };

    // Reconnect on failure
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.log('[webrtc] connection lost, reconnecting...');
        setListening(false);
        setTimeout(connect, 2000);
      }
    };

    // Create offer and send to server
    pc.createOffer().then((offer) => {
      return pc.setLocalDescription(offer);
    }).then(() => {
      wsSend('WEBRTC_OFFER', { sdp: pc.localDescription!.sdp });
    }).catch((err) => {
      console.error('[webrtc] offer error:', err);
    });
  }, [volume]);

  // Listen for signaling responses from server
  useEffect(() => {
    onWsMessage('WEBRTC_ANSWER', (data: unknown) => {
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
      // data is the ICE candidate JSON from the server
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

  // Connect when there's a track, disconnect when idle
  useEffect(() => {
    if (hasTrack) {
      // Small delay to ensure WebSocket is connected first
      const timer = setTimeout(connect, 500);
      return () => clearTimeout(timer);
    } else {
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
    setVolumeState(vol);
    localStorage.setItem('awks-volume', String(vol));
    if (audioRef.current) {
      audioRef.current.volume = vol / 100;
    }
  }, []);

  return { volume, setVolume, listening };
}
