---
name: image-generator
description: >
  AI image generation skill. Transforms text descriptions into images via Gemini API.
  Triggers when users request image generation, drawing, or creating visual assets.
allowed-tools: Bash,Read
---

## AI Image Generation

Calls Gemini API via the `scripts/generate-image.sh` script to generate images.

### Usage

```bash
bash {SKILL_DIR}/scripts/generate-image.sh "<English prompt>"
```

The script will:
1. Automatically obtain Gemini API Key from openteam-server (via `OPENTEAM_TOKEN` env var)
2. Call Gemini generateContent API
3. Save the generated image to `~/.openteam/images/` directory
4. Output image path marker `[generated_image:<path>]`

After generation, use the Read tool to view the image and verify the result.

### Prompt Optimization Principles

User descriptions are often brief — supplement necessary details like a professional photographer/artist:

- Subject description (subject & composition)
- Style specification (photorealistic / anime / watercolor / oil painting / digital art, etc.)
- Lighting and atmosphere (lighting, mood, atmosphere)
- Quality requirements (high detail, 4K, professional)
- Angle and composition (close-up, wide shot, bird's eye view, etc.)

### Example

User says "draw a cat":

```bash
bash {SKILL_DIR}/scripts/generate-image.sh "A fluffy orange tabby cat lounging on a sunlit windowsill, soft bokeh background with indoor plants, warm golden hour lighting, photorealistic, high detail"
```

### Notes

- Each call generates one image only
- Generation takes approximately 10-30 seconds
- English prompts produce the best results
- No NSFW, violent, or inappropriate content
- On failure, analyze the reason and suggest prompt modifications
