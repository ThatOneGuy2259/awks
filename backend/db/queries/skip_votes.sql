-- name: CastSkipVote :exec
INSERT INTO skip_votes (id, queue_id, user_id) VALUES (?, ?, ?)
ON CONFLICT (queue_id, user_id) DO NOTHING;

-- name: RetractSkipVote :exec
DELETE FROM skip_votes WHERE queue_id = ? AND user_id = ?;

-- name: CountSkipVotes :one
SELECT COUNT(*) FROM skip_votes WHERE queue_id = ?;

-- name: HasUserVoted :one
SELECT EXISTS(SELECT 1 FROM skip_votes WHERE queue_id = ? AND user_id = ?);

-- name: DeleteSkipVotesForTrack :exec
DELETE FROM skip_votes WHERE queue_id = ?;
