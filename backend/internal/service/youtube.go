package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"strings"
)

var ytRegex = regexp.MustCompile(`(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})`)
var videoIDRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{11}$`)

type VideoMeta struct {
	VideoID      string `json:"video_id"`
	Title        string `json:"title"`
	Artist       string `json:"artist"`
	DurationSec  int    `json:"duration_sec"`
	ThumbnailURL string `json:"thumbnail_url"`
}

func ExtractVideoID(rawURL string) (string, error) {
	matches := ytRegex.FindStringSubmatch(rawURL)
	if len(matches) >= 2 {
		return matches[1], nil
	}
	if videoIDRegex.MatchString(rawURL) {
		return rawURL, nil
	}
	return "", fmt.Errorf("invalid YouTube URL: %s", rawURL)
}

func ResolveVideoMeta(videoID, apiKey, ytdlpPath string) (*VideoMeta, error) {
	if apiKey != "" {
		return resolveViaAPI(videoID, apiKey)
	}
	return resolveViaOEmbed(videoID, ytdlpPath)
}

func resolveViaOEmbed(videoID, ytdlpPath string) (*VideoMeta, error) {
	oembedURL := fmt.Sprintf("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=%s&format=json", videoID)
	resp, err := http.Get(oembedURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("video not found or not embeddable: %s", videoID)
	}

	var data struct {
		Title      string `json:"title"`
		AuthorName string `json:"author_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	// Get real duration via yt-dlp instead of hardcoding a guess
	duration := 300
	if ytdlpPath != "" {
		cmd := exec.Command(ytdlpPath, "--print", "duration", "--no-warnings",
			fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID))
		if out, err := cmd.Output(); err == nil {
			if secs, err := parseDurationOutput(strings.TrimSpace(string(out))); err == nil && secs > 0 {
				duration = secs
			}
		}
	}

	return &VideoMeta{
		VideoID:      videoID,
		Title:        data.Title,
		Artist:       data.AuthorName,
		DurationSec:  duration,
		ThumbnailURL: fmt.Sprintf("https://img.youtube.com/vi/%s/hqdefault.jpg", videoID),
	}, nil
}

func parseDurationOutput(s string) (int, error) {
	// yt-dlp returns duration as a float (e.g. "234.5")
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	return int(f), err
}

type ytAPIResponse struct {
	Items []struct {
		Snippet struct {
			Title        string `json:"title"`
			ChannelTitle string `json:"channelTitle"`
			Thumbnails   struct {
				High struct {
					URL string `json:"url"`
				} `json:"high"`
			} `json:"thumbnails"`
		} `json:"snippet"`
		ContentDetails struct {
			Duration string `json:"duration"`
		} `json:"contentDetails"`
	} `json:"items"`
}

func resolveViaAPI(videoID, apiKey string) (*VideoMeta, error) {
	apiURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=%s&key=%s",
		url.QueryEscape(videoID), url.QueryEscape(apiKey))

	resp, err := http.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var data ytAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	if len(data.Items) == 0 {
		return nil, fmt.Errorf("video not found: %s", videoID)
	}

	item := data.Items[0]
	duration := parseISO8601Duration(item.ContentDetails.Duration)

	return &VideoMeta{
		VideoID:      videoID,
		Title:        item.Snippet.Title,
		Artist:       item.Snippet.ChannelTitle,
		DurationSec:  duration,
		ThumbnailURL: item.Snippet.Thumbnails.High.URL,
	}, nil
}

func parseISO8601Duration(d string) int {
	d = strings.TrimPrefix(d, "PT")
	total := 0
	current := ""
	for _, c := range d {
		switch c {
		case 'H':
			n := atoi(current)
			total += n * 3600
			current = ""
		case 'M':
			n := atoi(current)
			total += n * 60
			current = ""
		case 'S':
			n := atoi(current)
			total += n
			current = ""
		default:
			current += string(c)
		}
	}
	return total
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
		}
	}
	return n
}

type SearchResult struct {
	VideoID      string `json:"video_id"`
	Title        string `json:"title"`
	Artist       string `json:"artist"`
	DurationSec  int    `json:"duration_sec"`
	ThumbnailURL string `json:"thumbnail_url"`
}

// SearchYouTubeYtdlp uses yt-dlp to search YouTube with full metadata including duration.
func SearchYouTubeYtdlp(query, ytdlpPath string) ([]SearchResult, error) {
	cmd := exec.Command(ytdlpPath,
		"--dump-json",
		"--flat-playlist",
		"--no-warnings",
		"--default-search", "ytsearch12",
		query,
	)

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("yt-dlp search failed: %w", err)
	}

	var results []SearchResult
	for _, line := range bytes.Split(output, []byte("\n")) {
		if len(line) == 0 {
			continue
		}
		var entry struct {
			ID         string  `json:"id"`
			Title      string  `json:"title"`
			Uploader   string  `json:"uploader"`
			Channel    string  `json:"channel"`
			Duration   float64 `json:"duration"`
			Thumbnails []struct {
				URL string `json:"url"`
			} `json:"thumbnails"`
		}
		if err := json.Unmarshal(line, &entry); err != nil {
			continue
		}
		if entry.ID == "" {
			continue
		}
		artist := entry.Channel
		if artist == "" {
			artist = entry.Uploader
		}
		thumb := fmt.Sprintf("https://img.youtube.com/vi/%s/hqdefault.jpg", entry.ID)
		if len(entry.Thumbnails) > 0 {
			thumb = entry.Thumbnails[len(entry.Thumbnails)-1].URL
		}
		results = append(results, SearchResult{
			VideoID:      entry.ID,
			Title:        entry.Title,
			Artist:       artist,
			DurationSec:  int(entry.Duration),
			ThumbnailURL: thumb,
		})
	}
	return results, nil
}

func SearchYouTube(query, apiKey string) ([]SearchResult, error) {
	if apiKey != "" {
		return searchYouTubeAPI(query, apiKey)
	}
	return searchYouTubeInnerTube(query)
}

func searchYouTubeAPI(query, apiKey string) ([]SearchResult, error) {
	searchURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=%s&key=%s",
		url.QueryEscape(query), url.QueryEscape(apiKey),
	)

	resp, err := http.Get(searchURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var data struct {
		Items []struct {
			ID struct {
				VideoID string `json:"videoId"`
			} `json:"id"`
			Snippet struct {
				Title        string `json:"title"`
				ChannelTitle string `json:"channelTitle"`
				Thumbnails   struct {
					High struct {
						URL string `json:"url"`
					} `json:"high"`
				} `json:"thumbnails"`
			} `json:"snippet"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, len(data.Items))
	for _, item := range data.Items {
		results = append(results, SearchResult{
			VideoID:      item.ID.VideoID,
			Title:        item.Snippet.Title,
			Artist:       item.Snippet.ChannelTitle,
			ThumbnailURL: item.Snippet.Thumbnails.High.URL,
		})
	}
	return results, nil
}

// searchYouTubeInnerTube uses YouTube's internal InnerTube API (no API key needed).
func searchYouTubeInnerTube(query string) ([]SearchResult, error) {
	payload := map[string]interface{}{
		"context": map[string]interface{}{
			"client": map[string]interface{}{
				"clientName":    "WEB",
				"clientVersion": "2.20240101.00.00",
				"hl":            "en",
				"gl":            "US",
			},
		},
		"query": query,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", "https://www.youtube.com/youtubei/v1/search?prettyPrint=false", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(rawBody, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse InnerTube response")
	}

	return extractInnerTubeResults(raw), nil
}

func extractInnerTubeResults(raw map[string]interface{}) []SearchResult {
	var results []SearchResult

	contents := jsonPath(raw, "contents", "twoColumnSearchResultsRenderer", "primaryContents", "sectionListRenderer", "contents")
	sections, ok := contents.([]interface{})
	if !ok {
		return results
	}

	for _, section := range sections {
		sectionMap, ok := section.(map[string]interface{})
		if !ok {
			continue
		}
		itemSection, ok := sectionMap["itemSectionRenderer"].(map[string]interface{})
		if !ok {
			continue
		}
		items, ok := itemSection["contents"].([]interface{})
		if !ok {
			continue
		}

		for _, item := range items {
			itemMap, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			vr, ok := itemMap["videoRenderer"].(map[string]interface{})
			if !ok {
				continue
			}

			videoID, _ := vr["videoId"].(string)
			if videoID == "" {
				continue
			}

			title := extractRunsText(vr, "title")
			artist := extractRunsText(vr, "ownerText")
			thumbnail := extractThumbnail(vr)

			results = append(results, SearchResult{
				VideoID:      videoID,
				Title:        title,
				Artist:       artist,
				ThumbnailURL: thumbnail,
			})

			if len(results) >= 12 {
				return results
			}
		}
	}

	return results
}

func jsonPath(obj interface{}, keys ...string) interface{} {
	current := obj
	for _, key := range keys {
		m, ok := current.(map[string]interface{})
		if !ok {
			return nil
		}
		current = m[key]
	}
	return current
}

func extractRunsText(vr map[string]interface{}, field string) string {
	obj, ok := vr[field].(map[string]interface{})
	if !ok {
		return ""
	}
	runs, ok := obj["runs"].([]interface{})
	if !ok || len(runs) == 0 {
		return ""
	}
	first, ok := runs[0].(map[string]interface{})
	if !ok {
		return ""
	}
	text, _ := first["text"].(string)
	return text
}

func extractThumbnail(vr map[string]interface{}) string {
	thumb, ok := vr["thumbnail"].(map[string]interface{})
	if !ok {
		return ""
	}
	thumbs, ok := thumb["thumbnails"].([]interface{})
	if !ok || len(thumbs) == 0 {
		return ""
	}
	// Use the last (highest resolution) thumbnail
	last, ok := thumbs[len(thumbs)-1].(map[string]interface{})
	if !ok {
		return ""
	}
	u, _ := last["url"].(string)
	return u
}
