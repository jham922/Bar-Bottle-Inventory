import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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
    return json('ok', 200);
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

    // Call Claude Vision API
    const claudeRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return json({ ok: false, error: `Claude API error: ${errText}` }, 502);
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text ?? '';

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
