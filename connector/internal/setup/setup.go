package setup

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/hypercho/hyperclaw-connector/internal/config"
)

// savedCredentials persisted at ~/.hyperclaw/credentials.json
type savedCredentials struct {
	DeviceID string `json:"deviceId"`
	Token    string `json:"token"`
	UserID   string `json:"userId"`
	HubURL   string `json:"hubUrl"`
}

// AutoSetup handles login → create device → get pairing token → save credentials.
// Returns true if setup was performed, false if already configured.
func AutoSetup(cfg *config.Config) error {
	// Check if we already have saved credentials
	credsPath := filepath.Join(cfg.DataDir, "credentials.json")
	if cfg.DeviceToken == "" {
		if creds, err := loadCredentials(credsPath); err == nil {
			log.Println("Loaded saved credentials")
			cfg.DeviceToken = creds.Token
			if cfg.DeviceID == "" {
				cfg.DeviceID = creds.DeviceID
			}
			return nil
		}
	}

	// If we have a token already, nothing to do
	if cfg.DeviceToken != "" {
		return nil
	}

	// Need email + password + jwt-secret for auto-setup
	if cfg.Email == "" || cfg.Password == "" {
		return fmt.Errorf("no saved credentials found. Use --email and --password to set up, or provide --token")
	}
	if cfg.JWTSecret == "" {
		return fmt.Errorf("--jwt-secret (or JWT_SECRET env) is required for auto-setup")
	}

	log.Println("Starting auto-setup...")

	// Step 1: Login to UserManager
	userID, err := loginToUserManager(cfg.UserManagerURL, cfg.Email, cfg.Password)
	if err != nil {
		return fmt.Errorf("login failed: %w", err)
	}
	log.Printf("Logged in as user %s", userID)

	// Step 2: Generate JWT
	jwtToken, err := generateJWT(userID, cfg.JWTSecret)
	if err != nil {
		return fmt.Errorf("failed to generate JWT: %w", err)
	}

	// Step 3: Create device in hub
	hubBase := hubHTTPURL(cfg.HubURL)
	deviceID, err := createDevice(hubBase, jwtToken, cfg)
	if err != nil {
		return fmt.Errorf("failed to create device: %w", err)
	}
	log.Printf("Created device: %s", deviceID)

	// Step 4: Get pairing token
	token, err := createPairingToken(hubBase, jwtToken, deviceID)
	if err != nil {
		return fmt.Errorf("failed to get pairing token: %w", err)
	}
	log.Println("Got pairing token")

	// Save credentials
	cfg.DeviceToken = token
	cfg.DeviceID = deviceID
	creds := savedCredentials{
		DeviceID: deviceID,
		Token:    token,
		UserID:   userID,
		HubURL:   cfg.HubURL,
	}
	saveCredentials(credsPath, creds)

	return nil
}

func loginToUserManager(baseURL, email, password string) (string, error) {
	body, _ := json.Marshal(map[string]string{
		"email":    email,
		"Password": password,
	})

	resp, err := http.Post(baseURL+"/login/User", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Status   int    `json:"status"`
		Message  string `json:"message"`
		UserData struct {
			ID string `json:"_id"`
		} `json:"userData"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("invalid response: %s", string(respBody))
	}
	if result.Status != 200 {
		return "", fmt.Errorf("%s", result.Message)
	}
	if result.UserData.ID == "" {
		return "", fmt.Errorf("no user ID in response")
	}
	return result.UserData.ID, nil
}

func generateJWT(userID, secret string) (string, error) {
	claims := jwt.MapClaims{
		"id":  userID,
		"sub": userID,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func hubHTTPURL(wsURL string) string {
	// Convert ws://host:port to http://host:port
	u := wsURL
	if len(u) > 5 && u[:5] == "wss://" {
		u = "https://" + u[6:]
	} else if len(u) > 5 && u[:5] == "ws://" {
		u = "http://" + u[5:]
	}
	// Strip any path
	return u
}

// readExistingDeviceID returns the device ID persisted on disk (credentials/device.id
// or the legacy device.id), or "" if no file exists yet.
func readExistingDeviceID(dataDir string) string {
	// Try new credentials sub-directory first (used since ~v0.5)
	if data, err := os.ReadFile(filepath.Join(dataDir, "credentials", "device.id")); err == nil {
		if id := strings.TrimSpace(string(data)); id != "" {
			return id
		}
	}
	// Fall back to legacy root-level file (pre-v0.5 deployments)
	if data, err := os.ReadFile(filepath.Join(dataDir, "device.id")); err == nil {
		if id := strings.TrimSpace(string(data)); id != "" {
			return id
		}
	}
	return ""
}

func createDevice(hubBase, jwtToken string, cfg *config.Config) (string, error) {
	hostname, _ := os.Hostname()
	payload := map[string]string{
		"name": hostname,
		"type": "connector",
	}

	// If a device.id is already on disk, send it to the hub so it can look up
	// the existing device record instead of minting a new Mongo ObjectId.
	// This prevents dashboard ⇄ hub ⇄ connector identity drift when the user
	// triggers re-onboarding without fully wiping their credentials.
	if existingID := readExistingDeviceID(cfg.DataDir); existingID != "" {
		payload["existing_device_id"] = existingID
		log.Printf("[setup] Sending existing device ID to hub: %s", existingID)
	}

	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", hubBase+"/api/devices", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+jwtToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("hub returned %d: %s", resp.StatusCode, string(respBody))
	}

	var device struct {
		ID string `json:"_id"`
	}
	if err := json.Unmarshal(respBody, &device); err != nil {
		return "", fmt.Errorf("invalid response: %s", string(respBody))
	}
	if device.ID == "" {
		// Try alternate field name
		var alt struct {
			ID string `json:"id"`
		}
		json.Unmarshal(respBody, &alt)
		device.ID = alt.ID
	}
	if device.ID == "" {
		return "", fmt.Errorf("no device ID in response: %s", string(respBody))
	}
	return device.ID, nil
}

func createPairingToken(hubBase, jwtToken, deviceID string) (string, error) {
	url := fmt.Sprintf("%s/api/devices/%s/pairing-token?deviceId=%s", hubBase, deviceID, deviceID)
	req, _ := http.NewRequest("POST", url, nil)
	req.Header.Set("Authorization", "Bearer "+jwtToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("hub returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("invalid response: %s", string(respBody))
	}
	if result.Token == "" {
		return "", fmt.Errorf("no token in response: %s", string(respBody))
	}
	return result.Token, nil
}

// RefreshToken generates a fresh pairing token using saved credentials.
// Used for self-healing when the hub rejects the current token.
func RefreshToken(cfg *config.Config) (string, error) {
	if cfg.JWTSecret == "" {
		return "", fmt.Errorf("no JWT secret configured")
	}

	credsPath := filepath.Join(cfg.DataDir, "credentials.json")
	creds, err := loadCredentials(credsPath)
	if err != nil {
		return "", fmt.Errorf("no saved credentials: %w", err)
	}

	deviceID := cfg.DeviceID
	if deviceID == "" {
		deviceID = creds.DeviceID
	}
	if deviceID == "" {
		return "", fmt.Errorf("no device ID available")
	}

	userID := creds.UserID
	if userID == "" {
		// Try to login fresh
		if cfg.Email == "" || cfg.Password == "" {
			return "", fmt.Errorf("no user ID and no login credentials")
		}
		userID, err = loginToUserManager(cfg.UserManagerURL, cfg.Email, cfg.Password)
		if err != nil {
			return "", fmt.Errorf("login failed: %w", err)
		}
	}

	jwtToken, err := generateJWT(userID, cfg.JWTSecret)
	if err != nil {
		return "", fmt.Errorf("JWT generation failed: %w", err)
	}

	hubBase := hubHTTPURL(cfg.HubURL)
	token, err := createPairingToken(hubBase, jwtToken, deviceID)
	if err != nil {
		return "", fmt.Errorf("pairing token request failed: %w", err)
	}

	// Save the new token
	cfg.DeviceToken = token
	creds.Token = token
	saveCredentials(credsPath, creds)

	// Also update device.token file
	tokenPath := filepath.Join(cfg.DataDir, "device.token")
	os.WriteFile(tokenPath, []byte(token), 0600)

	log.Printf("Refreshed pairing token for device %s", deviceID)
	return token, nil
}

func loadCredentials(path string) (savedCredentials, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return savedCredentials{}, err
	}
	var creds savedCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return savedCredentials{}, err
	}
	if creds.Token == "" {
		return savedCredentials{}, fmt.Errorf("no token")
	}
	return creds, nil
}

func saveCredentials(path string, creds savedCredentials) {
	os.MkdirAll(filepath.Dir(path), 0700)
	data, _ := json.MarshalIndent(creds, "", "  ")
	os.WriteFile(path, data, 0600)
}
