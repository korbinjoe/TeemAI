#!/bin/bash
# generate-image.sh — Call Gemini API to generate images
# Usage: bash generate-image.sh "<prompt>"
# Environment: GEMINI_API_KEY, GEMINI_API_URL

set -euo pipefail

PROMPT="${1:-}"
if [ -z "$PROMPT" ]; then
  echo "Error: prompt is required"
  echo "Usage: bash generate-image.sh \"<prompt>\""
  exit 1
fi

DEFAULT_API_URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
API_URL="${GEMINI_API_URL:-$DEFAULT_API_URL}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"

if [ -z "$GEMINI_API_KEY" ]; then
  echo "Error: GEMINI_API_KEY environment variable is required."
  exit 1
fi

IMAGE_DIR="$HOME/.openteam/images"
mkdir -p "$IMAGE_DIR"

REQUEST_BODY=$(jq -n --arg prompt "$PROMPT" '{
  contents: [{parts: [{text: $prompt}]}],
  generationConfig: {responseModalities: ["TEXT", "IMAGE"]}
}')

RESPONSE=$(curl -sf -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -d "$REQUEST_BODY" 2>/dev/null) || {
  echo "Error: Gemini API request failed"
  exit 1
}

ERROR=$(echo "$RESPONSE" | jq -r '.error.message // empty' 2>/dev/null || echo "")
if [ -n "$ERROR" ]; then
  echo "Gemini API error: $ERROR"
  exit 1
fi

TEXT=$(echo "$RESPONSE" | jq -r '[.candidates[0].content.parts[] | select(.text) | .text] | join("\n")' 2>/dev/null || echo "")
if [ -n "$TEXT" ]; then
  echo "$TEXT"
fi

IMAGE_COUNT=0
while IFS= read -r PART; do
  [ -z "$PART" ] && continue
  MIME=$(echo "$PART" | jq -r '.inlineData.mimeType')
  DATA=$(echo "$PART" | jq -r '.inlineData.data')

  case "$MIME" in
    "image/jpeg") EXT="jpg" ;;
    "image/webp") EXT="webp" ;;
    *) EXT="png" ;;
  esac

  FILENAME="gemini-$(date +%s)-$(openssl rand -hex 3).${EXT}"
  FILEPATH="${IMAGE_DIR}/${FILENAME}"
  echo "$DATA" | base64 --decode > "$FILEPATH"
  echo "[generated_image:${FILEPATH}]"
  IMAGE_COUNT=$((IMAGE_COUNT + 1))
done < <(echo "$RESPONSE" | jq -c '.candidates[0].content.parts[] | select(.inlineData)' 2>/dev/null)

if [ "$IMAGE_COUNT" -eq 0 ] && [ -z "$TEXT" ]; then
  echo "Gemini returned no content. Try adjusting your prompt."
  exit 1
fi
