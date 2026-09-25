package ws

import "time"

// RateLimiter is a token bucket: up to burst events at once, refilling one
// token every interval. Not safe for concurrent use.
type RateLimiter struct {
	tokens   float64
	burst    float64
	interval time.Duration
	last     time.Time
}

func NewRateLimiter(burst int, interval time.Duration) *RateLimiter {
	return &RateLimiter{tokens: float64(burst), burst: float64(burst), interval: interval, last: time.Now()}
}

// Allow reports whether an event may happen now, consuming a token if so.
func (l *RateLimiter) Allow() bool {
	now := time.Now()
	l.tokens += float64(now.Sub(l.last)) / float64(l.interval)
	if l.tokens > l.burst {
		l.tokens = l.burst
	}
	l.last = now
	if l.tokens < 1 {
		return false
	}
	l.tokens--
	return true
}
