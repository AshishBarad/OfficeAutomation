import { NextRequest, NextResponse } from 'next/server';
import { readConfig, getConfluenceAuthHeader } from '@/lib/config';
import { buildSteeringPageHTML } from '@/lib/steering';
import { SteeringContent } from '@/lib/azure-ai';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const { content } = (await req.json()) as { content: SteeringContent };
    const config = readConfig();

    const parentPageId = config.steering?.parentPageId;
    if (!parentPageId) {
      return NextResponse.json(
        { success: false, error: 'Steering parent page ID not configured. Go to Config.' },
        { status: 400 }
      );
    }

    const client = axios.create({
      baseURL: config.confluence.baseUrl,
      headers: {
        Authorization: getConfluenceAuthHeader(config),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Count existing child pages to derive the next meeting number
    const { data: childData } = await client.get('/rest/api/content', {
      params: { parentId: parentPageId, limit: 200, expand: 'version' },
    });
    const existingCount = childData.results?.length ?? 0;
    const meetingNumber = existingCount + 1;

    // Build title: Meeting [N] - DD-Mon-YYYY
    const now = new Date();
    const dateStr = now
      .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      .replace(/ /g, '-');
    const title = `Meeting ${meetingNumber} - ${dateStr}`;

    const storageContent = buildSteeringPageHTML(content);

    const { data } = await client.post('/rest/api/content', {
      type: 'page',
      title,
      ancestors: [{ id: parentPageId }],
      space: { key: config.confluence.spaceKey },
      body: { storage: { value: storageContent, representation: 'storage' } },
    });

    const pageUrl =
      data._links?.base && data._links?.webui
        ? `${data._links.base}${data._links.webui}`
        : `${config.confluence.baseUrl}/spaces/${config.confluence.spaceKey}/pages/${data.id}`;

    return NextResponse.json({ success: true, url: pageUrl, title });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
