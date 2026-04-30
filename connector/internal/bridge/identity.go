package bridge

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type deviceIdentity struct {
	DeviceID      string `json:"deviceId"`
	PublicKeyPem  string `json:"publicKeyPem"`
	PrivateKeyPem string `json:"privateKeyPem"`
}

type deviceAuth struct {
	DeviceID string                 `json:"deviceId"`
	Tokens   map[string]deviceToken `json:"tokens"`
}

type deviceToken struct {
	Token  string   `json:"token"`
	Role   string   `json:"role"`
	Scopes []string `json:"scopes"`
}

func loadDeviceIdentity() (*deviceIdentity, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(home, ".openclaw", "identity", "device.json"))
	if err != nil {
		return nil, err
	}
	var id deviceIdentity
	if err := json.Unmarshal(data, &id); err != nil {
		return nil, err
	}
	return &id, nil
}

func loadDeviceAuth() (*deviceAuth, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(home, ".openclaw", "identity", "device-auth.json"))
	if err != nil {
		return nil, err
	}
	var auth deviceAuth
	if err := json.Unmarshal(data, &auth); err != nil {
		return nil, err
	}
	return &auth, nil
}

func signDevicePayload(id *deviceIdentity, payload string) (string, error) {
	if id == nil || id.PrivateKeyPem == "" {
		return "", errors.New("device private key is missing")
	}

	block, _ := pem.Decode([]byte(id.PrivateKeyPem))
	if block == nil {
		return "", errors.New("device private key PEM is invalid")
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return "", err
	}

	edKey, ok := key.(ed25519.PrivateKey)
	if !ok {
		return "", errors.New("device private key is not Ed25519")
	}

	sig := ed25519.Sign(edKey, []byte(payload))
	return base64.RawURLEncoding.EncodeToString(sig), nil
}

func stringParam(params map[string]interface{}, key string, fallback string) string {
	value, _ := params[key].(string)
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func stringSliceParam(params map[string]interface{}, key string, fallback []string) []string {
	raw, ok := params[key]
	if !ok {
		return fallback
	}
	if values, ok := raw.([]string); ok && len(values) > 0 {
		return values
	}
	if values, ok := raw.([]interface{}); ok && len(values) > 0 {
		result := make([]string, 0, len(values))
		for _, value := range values {
			if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
				result = append(result, text)
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return fallback
}

func validateSignatureFields(fields map[string]string, scopes []string) error {
	for name, value := range fields {
		if strings.Contains(value, "|") {
			return fmt.Errorf("%s contains invalid delimiter", name)
		}
	}
	for _, scope := range scopes {
		if strings.ContainsAny(scope, "|,") {
			return errors.New("scope contains invalid delimiter")
		}
	}
	return nil
}

func (b *BridgeHandler) signConnectChallenge(params map[string]interface{}) actionResult {
	id, err := loadDeviceIdentity()
	if err != nil {
		return errResult("no device identity: " + err.Error())
	}

	auth, _ := loadDeviceAuth()
	authToken := stringParam(params, "token", "")
	if auth != nil {
		if op, ok := auth.Tokens["operator"]; ok && authToken == "" {
			authToken = op.Token
		}
	}

	nonce := stringParam(params, "nonce", "")
	clientID := stringParam(params, "clientId", "gateway-client")
	clientMode := stringParam(params, "clientMode", "backend")
	role := stringParam(params, "role", "operator")
	scopes := stringSliceParam(params, "scopes", []string{"operator.read", "operator.write", "operator.admin"})
	platform := runtime.GOOS
	signedAt := time.Now().UnixMilli()

	if err := validateSignatureFields(map[string]string{
		"deviceId":   id.DeviceID,
		"clientId":   clientID,
		"clientMode": clientMode,
		"role":       role,
		"authToken":  authToken,
		"nonce":      nonce,
		"platform":   platform,
	}, scopes); err != nil {
		return errResult("invalid connect challenge: " + err.Error())
	}

	// OpenClaw protocol v3 signs the full connect context, not just the nonce.
	payload := fmt.Sprintf("v3|%s|%s|%s|%s|%s|%d|%s|%s|%s|",
		id.DeviceID,
		clientID,
		clientMode,
		role,
		strings.Join(scopes, ","),
		signedAt,
		authToken,
		nonce,
		platform,
	)
	signature, err := signDevicePayload(id, payload)
	if err != nil {
		return errResult("failed to sign connect challenge: " + err.Error())
	}

	return okResult(map[string]interface{}{
		"device": map[string]interface{}{
			"id":        id.DeviceID,
			"publicKey": id.PublicKeyPem,
			"signature": signature,
			"signedAt":  signedAt,
			"nonce":     nonce,
		},
		"client": map[string]interface{}{
			"id":       clientID,
			"platform": platform,
			"mode":     clientMode,
			"version":  "0.1.0",
		},
		"role":        role,
		"scopes":      scopes,
		"deviceToken": authToken,
	})
}

func (b *BridgeHandler) getDeviceIdentity() actionResult {
	id, err := loadDeviceIdentity()
	if err != nil {
		return errResult("no device identity: " + err.Error())
	}

	return okResult(map[string]interface{}{
		"deviceId":     id.DeviceID,
		"publicKeyPem": id.PublicKeyPem,
	})
}
