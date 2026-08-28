import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import axios from 'axios';

export async function GET() {
  try {
    const config = readConfig();
    const { azureAi } = config;
    if (!azureAi.endpoint || !azureAi.apiKey || !azureAi.deploymentName) {
      return NextResponse.json({ success: false, error: 'Azure AI not configured' });
    }
    const url = `${azureAi.endpoint.replace(/\/$/, '')}/openai/deployments/${azureAi.deploymentName}/chat/completions?api-version=${azureAi.apiVersion || '2025-01-01-preview'}`;
    const { data } = await axios.post(
      url,
      { messages: [{ role: 'user', content: 'Say "ok"' }], max_tokens: 5 },
      {
        headers: { 'api-key': azureAi.apiKey, 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    const model = data.model || azureAi.deploymentName;
    return NextResponse.json({ success: true, model });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg });
  }
}
