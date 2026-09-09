# Gemini model findings

Search date: 2026-09-09

- Google AI model documentation: https://ai.google.dev/gemini-api/docs/models
- Search results indicate Gemini 2.5 Flash is positioned for low-latency, high-volume tasks.
- Google AI documentation result: https://ai.google.dev/gemini-api/docs/gemini-3.7-flash describes Gemini 3.7 Flash.
- Current production logs show all OCR attempts using model `gemini-3.6-flash` timing out. This is the likely configuration/performance issue to address.
- Image understanding docs: https://ai.google.dev/gemini-api/docs/image-understanding

Planned code fix: use a low-latency model fallback for OCR, reduce image/token payload, and avoid retrying timeouts across multiple keys.
