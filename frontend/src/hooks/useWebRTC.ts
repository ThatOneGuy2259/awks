import { useRef, useCallback, useState, useEffect } from 'react';
import { wsSend, onWsMessage, offWsMessage } from './useWebSocket';
import { useVisualizerStore, EQ_BANDS, sliderToDb } from '../stores/visualizerStore';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const volumeRef = useRef(70);
  const connectedRef = useRef(false);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('awks-volume');
    const v = saved ? parseInt(saved) : 70;
    volumeRef.current = v;
    return v;
  });
  const [listening, setListening] = useState(false);

  const connect = useCallback(() => {
    if (connectedRef.current && pcRef.current && pcRef.current.iceConnectionState === 'connected') {
      return;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    connectedRef.current = false;
    analyserRef.current = null;

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

      // Set up Web Audio graph: source → EQ filters → gain → analyser + destination
      // Audio plays through the Web Audio API (not <audio>.srcObject) so EQ affects output
      const stream = event.streams[0];
      const setupAnalyser = () => {
        if (analyserRef.current) return;
        try {
          const ctx = new AudioContext();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);

          // Mute the <audio> element — we play through Web Audio instead
          audio.volume = 0;

          // EQ filter chain
          const savedGains = useVisualizerStore.getState().audioGains;
          const filters: BiquadFilterNode[] = [];
          for (let i = 0; i < EQ_BANDS.length; i++) {
            const band = EQ_BANDS[i];
            const filter = ctx.createBiquadFilter();
            filter.type = band.type;
            filter.frequency.value = band.frequency;
            filter.gain.value = sliderToDb(savedGains[i]);
            if (band.type === 'peaking') {
              filter.Q.value = 1.4;
            }
            filters.push(filter);
          }

          // Volume gain node
          const gainNode = ctx.createGain();
          gainNode.gain.value = volumeRef.current / 100;
          gainNodeRef.current = gainNode;

          // Analyser
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.4;
          analyser.minDecibels = -80;
          analyser.maxDecibels = -10;

          // Chain: source → filters → gain → analyser → destination
          let node: AudioNode = source;
          for (const filter of filters) {
            node.connect(filter);
            node = filter;
          }
          node.connect(gainNode);
          gainNode.connect(analyser);
          analyser.connect(ctx.destination);

          analyserRef.current = analyser;
          filtersRef.current = filters;
          console.log('[webrtc] audio graph created: source → EQ → gain → analyser → output');
        } catch (e) {
          console.warn('[webrtc] failed to create audio graph:', e);
        }
      };

      // Try immediately, defer to click if suspended
      const testCtx = new AudioContext();
      if (testCtx.state === 'running') {
        testCtx.close();
        setupAnalyser();
      } else {
        testCtx.close();
        const handler = () => {
          setupAnalyser();
          document.removeEventListener('click', handler);
          document.removeEventListener('keydown', handler);
        };
        document.addEventListener('click', handler);
        document.addEventListener('keydown', handler);
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
  }, []);

  // Listen for signaling responses
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
      pc.addIceCandidate(candidate).catch(() => {});
    });

    return () => {
      offWsMessage('WEBRTC_ANSWER');
      offWsMessage('WEBRTC_ICE_CANDIDATE');
    };
  }, []);

  // Connect once on mount — keep the connection alive across track changes
  useEffect(() => {
    const timer = setTimeout(connect, 1000);
    return () => clearTimeout(timer);
  }, [connect]);

  // Subscribe to EQ band gain changes and update audio filters in real-time
  useEffect(() => {
    const unsub = useVisualizerStore.subscribe((state) => {
      const filters = filtersRef.current;
      if (filters.length === 0) return;
      for (let i = 0; i < filters.length; i++) {
        filters[i].gain.value = sliderToDb(state.audioGains[i]);
      }
    });
    return unsub;
  }, []);

  const setVolume = useCallback((vol: number) => {
    volumeRef.current = vol;
    setVolumeState(vol);
    localStorage.setItem('awks-volume', String(vol));
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = vol / 100;
    } else if (audioRef.current) {
      audioRef.current.volume = vol / 100;
    }
  }, []);

  return { volume, setVolume, listening, analyserRef };
}
