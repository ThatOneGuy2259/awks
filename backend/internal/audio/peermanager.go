package audio

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/pion/webrtc/v4"
)

// PeerManager creates and manages WebRTC peer connections for listeners.
type PeerManager struct {
	track      *webrtc.TrackLocalStaticSample
	iceServers []webrtc.ICEServer
	mu         sync.Mutex
	peers      map[string]*webrtc.PeerConnection // keyed by client ID
}

func NewPeerManager(track *webrtc.TrackLocalStaticSample, iceServers []webrtc.ICEServer) *PeerManager {
	return &PeerManager{
		track:      track,
		iceServers: iceServers,
		peers:      make(map[string]*webrtc.PeerConnection),
	}
}

// HandleOffer processes an SDP offer from a client and returns an SDP answer.
// sendToClient is a callback to send signaling messages back to the specific client.
func (pm *PeerManager) HandleOffer(clientID string, offerSDP string, sendToClient func(msgType string, data interface{})) error {
	pm.mu.Lock()
	// Close existing peer connection for this client if any
	if existing, ok := pm.peers[clientID]; ok {
		existing.Close()
		delete(pm.peers, clientID)
	}
	pm.mu.Unlock()

	pc, err := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: pm.iceServers,
	})
	if err != nil {
		return fmt.Errorf("failed to create peer connection: %w", err)
	}

	// Add the shared audio track
	rtpSender, err := pc.AddTrack(pm.track)
	if err != nil {
		pc.Close()
		return fmt.Errorf("failed to add track: %w", err)
	}

	// Read incoming RTCP packets (required by Pion)
	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, rtcpErr := rtpSender.Read(rtcpBuf); rtcpErr != nil {
				return
			}
		}
	}()

	// Send ICE candidates to the client as they're gathered
	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		candidateJSON, err := json.Marshal(c.ToJSON())
		if err != nil {
			return
		}
		sendToClient("WEBRTC_ICE_CANDIDATE", json.RawMessage(candidateJSON))
	})

	// Log connection state changes and clean up on disconnect
	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Printf("[webrtc] peer %s ICE state: %s", clientID, state.String())
		if state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateDisconnected || state == webrtc.ICEConnectionStateClosed {
			pm.mu.Lock()
			if pm.peers[clientID] == pc {
				delete(pm.peers, clientID)
			}
			pm.mu.Unlock()
			pc.Close()
		}
	})

	// Set the remote description (the offer)
	offer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerSDP,
	}
	if err := pc.SetRemoteDescription(offer); err != nil {
		pc.Close()
		return fmt.Errorf("failed to set remote description: %w", err)
	}

	// Create and set the answer
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		pc.Close()
		return fmt.Errorf("failed to create answer: %w", err)
	}

	// Wait for ICE gathering to complete so all candidates are in the SDP
	gatherComplete := webrtc.GatheringCompletePromise(pc)
	if err := pc.SetLocalDescription(answer); err != nil {
		pc.Close()
		return fmt.Errorf("failed to set local description: %w", err)
	}
	<-gatherComplete

	// Store the peer connection
	pm.mu.Lock()
	pm.peers[clientID] = pc
	pm.mu.Unlock()

	// Send the answer with all ICE candidates embedded in the SDP
	sendToClient("WEBRTC_ANSWER", map[string]string{"sdp": pc.LocalDescription().SDP})

	return nil
}

// HandleICECandidate adds an ICE candidate from a client to their peer connection.
func (pm *PeerManager) HandleICECandidate(clientID string, candidateJSON string) error {
	pm.mu.Lock()
	pc, ok := pm.peers[clientID]
	pm.mu.Unlock()
	if !ok {
		return fmt.Errorf("no peer connection for client %s", clientID)
	}

	var candidate webrtc.ICECandidateInit
	if err := json.Unmarshal([]byte(candidateJSON), &candidate); err != nil {
		return fmt.Errorf("invalid ICE candidate: %w", err)
	}

	return pc.AddICECandidate(candidate)
}

// RemoveClient closes and removes the peer connection for a client.
func (pm *PeerManager) RemoveClient(clientID string) {
	pm.mu.Lock()
	if pc, ok := pm.peers[clientID]; ok {
		pc.Close()
		delete(pm.peers, clientID)
	}
	pm.mu.Unlock()
}

// PeerCount returns the number of active peer connections.
func (pm *PeerManager) PeerCount() int {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	return len(pm.peers)
}
