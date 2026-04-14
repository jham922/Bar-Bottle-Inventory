import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SINGLE_PROMPT = `You are analyzing a photo of a single liquor bottle for a bar inventory system.

CRITICAL: fill_pct is the percentage of liquid in the BOTTLE BODY ONLY. Never include the neck.

Key anatomy:
- BODY: the wide straight cylindrical section — your measurement zone
- SHOULDER: where the body ends and begins to taper upward — this is your TOP boundary
- NECK: the narrow tapered/cylindrical section above the shoulder — completely ignore this
- BOTTOM: base of the bottle — this is your BOTTOM boundary

How to measure fill_pct:
1. Locate the SHOULDER (where taper begins). This = 100% of body.
2. Locate the BOTTOM of the body. This = 0%.
3. Locate the LIQUID LINE (the horizontal surface of the liquid) inside the body.
4. fill_pct = (liquid height from bottom to liquid line) ÷ (total body height from bottom to shoulder) × 100
5. Round to nearest 10.

Worked examples — burn these into your calibration:
- Liquid right at the shoulder (body completely full) = 100%
- Liquid at 9/10 of the body height = 90%
- Liquid at 3/4 of the body height = 70%
- Liquid at exactly half the body height = 50%
- Liquid at 1/4 of the body height = 30%
- Liquid is a shallow puddle at the bottom = 10%
- Body is empty = 0%

Common mistakes to avoid:
- Do NOT measure to the top of the neck — stop at the shoulder
- Do NOT default to 80-100%; most open bar bottles are 20-70%
- A bottle that looks "mostly full" in the neck area may only be 50-60% when measured correctly to the shoulder

Return ONLY valid JSON with no markdown, no explanation, no code fences:
{
  "brand": "exact brand name as it appears on the label",
  "spirit_type": "one of: Whiskey, Gin, Vodka, Rum, Tequila, Mezcal, Liqueur, Amaro, Brandy, Other",
  "fill_pct": <integer 0-100 rounded to nearest 10>,
  "confidence": "high" | "medium" | "low",
  "known_bottle": <true if you can clearly identify the brand, false if uncertain or label is not visible>
}`;

const SHELF_PROMPT = `You are analyzing a photo of a bar shelf with multiple liquor bottles for an inventory system.

CRITICAL: fill_pct is the percentage of liquid in the BOTTLE BODY ONLY. Never include the neck.

Key anatomy (apply to every bottle):
- BODY: the wide straight cylindrical section — your measurement zone
- SHOULDER: where the body ends and begins to taper upward — TOP boundary
- NECK: the narrow tapered/cylindrical section above the shoulder — ignore completely
- BOTTOM: base of the bottle — BOTTOM boundary

How to measure fill_pct for each bottle:
1. Locate the SHOULDER (where taper begins). This = 100% of body.
2. Locate the BOTTOM of the body. This = 0%.
3. Locate the LIQUID LINE inside the body.
4. fill_pct = (liquid height from bottom to liquid line) ÷ (body height from bottom to shoulder) × 100
5. Round to nearest 10.

Calibration:
- Liquid at shoulder = 100%
- Liquid at 3/4 body height = 70%
- Liquid at half body height = 50%
- Liquid at 1/4 body height = 30%
- Shallow puddle = 10%
- Do NOT default to 80-100%; most open bottles are 20-70%
- A bottle that looks full in the neck may only be 50-60% when measured to the shoulder

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

    // Prefill forces the model to start the response with the opening bracket/brace,
    // preventing any explanatory text before the JSON.
    const prefill = mode === 'shelf' ? '[' : '{';

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
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: imageMediaType, data: imageBase64 },
              },
              { type: 'text', text: prompt },
            ],
          },
          {
            role: 'assistant',
            content: prefill,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return json({ ok: false, error: `Claude API error: ${errText}` }, 502);
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

    // Prepend the prefill character (not included in the completion) then strip any fences
    const cleaned = (prefill + rawText).replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return json({ ok: false, error: `Could not parse AI response: ${cleaned}` }, 502);
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
