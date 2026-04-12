import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const SINGLE_PROMPT = `You are analyzing a photo of a single liquor bottle for a bar inventory system.

Return ONLY valid JSON with no markdown, no explanation, no code fences. The JSON must have exactly these fields:
{
  "brand": "exact brand name as it appears on the label",
  "spirit_type": "one of: Whiskey, Gin, Vodka, Rum, Tequila, Mezcal, Liqueur, Amaro, Brandy, Other",
  "fill_pct": <integer 0-100 representing how full the bottle is>,
  "confidence": "high" | "medium" | "low",
  "known_bottle": <true if you can clearly identify the brand, false if uncertain or label is not visible>
}`;

const SHELF_PROMPT = `You are analyzing a photo of a bar shelf with multiple liquor bottles for an inventory system.

Return ONLY valid JSON with no markdown, no explanation, no code fences. The JSON must be an array of objects, one per visible bottle:
[
  {
    "brand": "exact brand name as it appears on the label",
    "spirit_type": "one of: Whiskey, Gin, Vodka, Rum, Tequila, Mezcal, Liqueur, Amaro, Brandy, Other",
    "fill_pct": <integer 0-100 representing how full the bottle is>,
    "confidence": "high" | "medium" | "low",
    "known_bottle": <true if you can clearly identify the brand, false if uncertain>
  }
]

Include every bottle you can see. If a label is not readable, use your best guess for brand and set known_bottle to false.`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Verify Supabase JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Missing authorization' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    // Parse request body
    const { imageBase64, mode } = await req.json();
    if (!imageBase64 || !mode) {
      return json({ ok: false, error: 'Missing imageBase64 or mode' }, 400);
    }

    const prompt = mode === 'shelf' ? SHELF_PROMPT : SINGLE_PROMPT;

    // Call Gemini Vision API
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return json({ ok: false, error: `Gemini error: ${errText}` }, 502);
    }

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Strip any accidental markdown fences
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return json({ ok: false, error: `Could not parse AI response: ${text}` }, 502);
    }

    return json({ ok: true, result });
  } catch (e: any) {
    return json({ ok: false, error: e.message ?? 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
