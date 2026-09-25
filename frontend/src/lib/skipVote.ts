import { api } from './api';
import { usePlaybackStore } from '../stores/playbackStore';
import { useSkipVoteStore } from '../stores/skipVoteStore';
import { toast } from '../stores/toastStore';

/** Cast or retract my skip vote on queueId, the playing track. */
export async function toggleSkipVote(queueId: string) {
  const votedByMe = useSkipVoteStore.getState().votedByMe;
  try {
    if (votedByMe) {
      await api.retractSkipVote(queueId);
    } else {
      await api.castSkipVote(queueId);
    }
    // A track change mid-request already reset the vote for the new track.
    if (usePlaybackStore.getState().currentTrack?.queueId === queueId) {
      useSkipVoteStore.getState().setVotedByMe(!votedByMe);
    }
  } catch (err) {
    toast(err instanceof Error && err.message ? err.message : "Couldn't record your vote.");
  }
}
