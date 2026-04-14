import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SINGLE_PROMPT = `You are analyzing a photo of a single liquor bottle for a bar inventory system.

Your ONLY job for fill_pct is to measure the AIR GAP — the empty space at the top of the bottle.

Step-by-step:
1. Find the liquid surface line (the meniscus) inside the bottle.
2. Measure the distance from the liquid surface to the very top of the liquid-containing area (base of the neck).
3. Express that air gap as a percentage of the cylindrical body height.
4. fill_pct = 100 minus the air gap percentage.
5. Round to the nearest 10 (e.g. 35 → 30, 42 → 40).

Critical calibration:
- A virtually full bottle (tiny sliver of air) = 90%
- Liquid fills about 3/4 of the body = 70-75%
- Liquid fills about half the body = 50%
- Liquid fills about 1/4 of the body = 20-25%
- Almost empty (small puddle at bottom) = 10%
- Do NOT round everything up to 80-100%. Most opened bottles are 20-70%.

Return ONLY valid JSON with no markdown, no explanation, no code fences:
{
  "brand": "exact brand name as it appears on the label",
  "spirit_type": "one of: Whiskey, Gin, Vodka, Rum, Tequila, Mezcal, Liqueur, Amaro, Brandy, Other",
  "fill_pct": <integer 0-100 rounded to nearest 10>,
  "confidence": "high" | "medium" | "low",
  "known_bottle": <true if you can clearly identify the brand, false if uncertain or label is not visible>
}`;

const SHELF_PROMPT = `You are analyzing a photo of a bar shelf with multiple liquor bottles for an inventory system.

For each bottle, measure the AIR GAP — the empty space at the top of the bottle.

Step-by-step for each bottle:
1. Find the liquid surface line (the meniscus) inside the bottle.
2. Measure the air gap from the liquid surface to the base of the neck as a percentage of the cylindrical body.
3. fill_pct = 100 minus the air gap percentage.
4. Round to the nearest 10.

Critical calibration:
- A virtually full bottle = 90%
- 3/4 full = 70-75%
- Half full = 50%
- 1/4 full = 20-25%
- Almost empty = 10%
- Do NOT round everything up to 80-100%. Most opened bottles are 20-70%.

Return ONLY valid JSON with no markdown, no explanation, no code fences. An array, one object per visible bottle:
[
  {
    "brand": "exact brand name as it appears on the label",
    "spirit_type": "one of: Whiskey, Gin, Vodka, Rum, Tequila, Mezcal, Liqueur, Amaro, Brandy, Other",
    "fill_pct": <integer 0-100 rounded to nearest 10>,
    "confidence": "high" | "medium" | "low",
    "known_bottle": <true if you can clearly identify the brand, false if uncertain>
  }
]

Include every bottle you can see. If a label is not readable, use your best guess for brand and set known_bottle to false.

Partially obscured / background bottles: if a bottle is partially hidden behind another bottle, assume it is the SAME brand as the bottle directly in front of it. Copy that bottle's brand and spirit_type exactly, set fill_pct to 100, and set known_bottle to true. Do not mark it as unknown.`;

function buildCalibrationText(calibrations: Array<{ ai: number; corrected: number }> | undefined): string {
  if (!calibrations || calibrations.length === 0) return '';
  const examples = calibrations
    .slice(0, 10)
    .map(c => `  - AI estimated ${c.ai}%, correct fill was ${c.corrected}%`)
    .join('\n');
  return `\n\nRecent user corrections for this bar (adjust your fill_pct estimates accordingly):\n${examples}`;
}

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
    const { imageBase64, mode, mediaType, calibrations } = await req.json();
    if (!imageBase64 || !mode) {
      return json({ ok: false, error: 'Missing imageBase64 or mode' }, 400);
    }

    const basePrompt = mode === 'shelf' ? SHELF_PROMPT : SINGLE_PROMPT;
    const calibrationText = buildCalibrationText(calibrations);
    const prompt = basePrompt + calibrationText;
    const imageMediaType = mediaType ?? 'image/jpeg';

    // Call Claude Vision API
    const claudeRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageMediaType, data: imageBase64 },
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
