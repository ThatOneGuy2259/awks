package auth

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/jwt"
	"github.com/clerk/clerk-sdk-go/v2/user"
)

type contextKey string

const (
	UserIDKey   contextKey = "user_id"
	RoleKey     contextKey = "role"
	UsernameKey contextKey = "username"
	AvatarKey   contextKey = "avatar_url"
)

// ClerkMiddleware verifies the Clerk JWT and injects user info into context.
func ClerkMiddleware(clerkSecretKey string) func(http.Handler) http.Handler {
	clerk.SetKey(clerkSecretKey)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			token := strings.TrimPrefix(authHeader, "Bearer ")
			if token == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Verify the Clerk JWT (use background context so JWKS fetch
			// isn't canceled if the browser aborts the HTTP request)
			claims, err := jwt.Verify(context.Background(), &jwt.VerifyParams{
				Token: token,
			})
			if err != nil {
				log.Printf("clerk jwt verify error: %v", err)
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			userID := claims.Subject

			// Fetch user details from Clerk to get metadata
			clerkUser, err := user.Get(r.Context(), userID)
			if err != nil {
				log.Printf("clerk get user error: %v", err)
				http.Error(w, `{"error":"could not resolve user"}`, http.StatusUnauthorized)
				return
			}

			// Determine role from Clerk public metadata
			role := "listener"
			if len(clerkUser.PublicMetadata) > 0 {
				var meta map[string]interface{}
				if err := json.Unmarshal(clerkUser.PublicMetadata, &meta); err == nil {
					if r, ok := meta["role"].(string); ok && r != "" {
						role = r
					}
				}
			}

			// Build username and avatar
			username := ""
			if clerkUser.Username != nil {
				username = *clerkUser.Username
			}
			if username == "" && clerkUser.FirstName != nil {
				username = *clerkUser.FirstName
			}
			if username == "" {
				username = userID[:8]
			}

			avatarURL := ""
			if clerkUser.ImageURL != nil {
				avatarURL = *clerkUser.ImageURL
			}

			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			ctx = context.WithValue(ctx, RoleKey, role)
			ctx = context.WithValue(ctx, UsernameKey, username)
			ctx = context.WithValue(ctx, AvatarKey, avatarURL)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, _ := r.Context().Value(RoleKey).(string)
		if role != "admin" {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func GetUserID(ctx context.Context) string {
	id, _ := ctx.Value(UserIDKey).(string)
	return id
}

func GetRole(ctx context.Context) string {
	role, _ := ctx.Value(RoleKey).(string)
	return role
}

func GetUsername(ctx context.Context) string {
	u, _ := ctx.Value(UsernameKey).(string)
	return u
}

func GetAvatarURL(ctx context.Context) string {
	a, _ := ctx.Value(AvatarKey).(string)
	return a
}
