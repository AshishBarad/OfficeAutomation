import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import axios from 'axios';

export async function GET() {
  try {
    const config = readConfig();
    const { openAi } = config;
    if (!openAi.apiKey) {
      return NextResponse.json({ success: false, error: 'OpenAI API key is not configured' });
    }

    const model = openAi.model || 'gpt-4o';
    const { data } = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model, messages: [{ role: 'user', content: 'Say "ok"' }], max_tokens: 5 },
      {
        headers: {
          Authorization: `Bearer ${openAi.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const usedModel = data.model || model;
    return NextResponse.json({ success: true, model: usedModel });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg });
  }
}
