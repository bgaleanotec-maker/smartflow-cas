# Test Voice & Transcription

Diagnoses the SmartFlow voice/transcription stack end-to-end.

## What this tests

1. Backend is reachable
2. Groq API key is configured and working
3. Local Whisper (faster-whisper) works with ffmpeg
4. ElevenLabs TTS responds
5. A real meeting can be created + transcribed + finalized

## Usage

```
/test-voice
```

Or with a specific backend URL:

```
/test-voice https://smartflow-api-0ric.onrender.com/api/v1
```

## Steps performed

Run the following diagnostics against the SmartFlow backend:

### 1. Health check
```bash
curl -s "$API_URL/health" | python3 -m json.tool
```

### 2. Check integrations status (requires admin token)
```bash
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/admin/integrations" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for svc in data:
    status = '✅' if svc['is_configured'] else '❌'
    print(f\"{status} {svc['display_name']}: configured={svc['is_configured']}, active={svc['is_active']}\")
"
```

### 3. Test Groq transcription (if key set)
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "$API_URL/admin/integrations/groq/test" | python3 -m json.tool
```

### 4. Test ElevenLabs (if key set)
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "$API_URL/admin/integrations/elevenlabs/test" | python3 -m json.tool
```

### 5. Test Whisper local
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "$API_URL/admin/integrations/whisper/test" | python3 -m json.tool
```

## Instructions for Claude

When this skill is invoked:

1. Ask the user for their admin JWT token (or get it from the browser localStorage key `token`)
2. Run the health check first to confirm backend is reachable
3. Run integrations check to see what services are configured
4. Run individual tests for Groq, ElevenLabs, and Whisper
5. Report results clearly with ✅/❌ status
6. If Groq is not configured, strongly recommend configuring it at console.groq.com (free)
7. If Whisper is failing, check if ffmpeg is installed on the server

## Common issues and fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| Empty transcript | ffmpeg not installed | Add ffmpeg to Dockerfile (already done in latest deploy) |
| Empty transcript | webm chunks without header | Fixed: now sends complete audio on finalize |
| ElevenLabs 401 | Free tier blocked | Upgrade to paid plan or use browser TTS |
| Groq 401 | Wrong API key | Get free key at console.groq.com |
| Timeout on finalize | Gemini taking too long | Already fixed: commit happens before Gemini |
| ARIA loop | Web Speech fires while speaking | Already fixed: === 'idle' guard |
