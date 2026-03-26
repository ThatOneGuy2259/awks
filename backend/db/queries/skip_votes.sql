-- name: CastSkipVote :exec
INSERT INTO skip_votes (queue_id, user_id) VALUES ($1, $2)
ON CONFLICT (queue_id, user_id) DO NOTHING;

-- name: RetractSkipVote :exec
DELETE FROM skip_votes WHERE queue_id = $1 AND user_id = $2;

-- name: CountSkipVotes :one
SELECT COUNT(*) FROM skip_votes WHERE queue_id = $1;

-- name: HasUserVoted :one
SELECT EXISTS(SELECT 1 FROM skip_votes WHERE queue_id = $1 AND user_id = $2);

-- name: DeleteSkipVotesForTrack :exec
DELETE FROM skip_votes WHERE queue_id = $1;
