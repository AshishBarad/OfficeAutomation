import { NextRequest, NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { getSprintReviewData } from '@/lib/jira';
import { analyzeSprintDataForSteering, SprintBundle } from '@/lib/azure-ai';
import { humanizeError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const config = readConfig();

  try {
    const { sprintIds } = (await req.json()) as { sprintIds: string[] };
    if (!sprintIds?.length) {
      return NextResponse.json(
        { success: false, error: 'No sprint IDs provided. Enter one or more sprint IDs separated by commas.' },
        { status: 400 }
      );
    }

    // Pre-flight: check Jira config
    if (!config.jira.baseUrl) {
      return NextResponse.json(
        { success: false, error: 'Jira Base URL is not configured. Go to the Config page and fill in your Jira settings.' },
        { status: 400 }
      );
    }

    // Pre-flight: check Azure AI config
    if (!config.azureAi.endpoint || !config.azureAi.apiKey || !config.azureAi.deploymentName) {
      return NextResponse.json(
        { success: false, error: 'Azure AI is not configured. Go to the Config page and fill in your Azure OpenAI endpoint, API key, and deployment name.' },
        { status: 400 }
      );
    }

    // Fetch data for each sprint in parallel
    const bundles: SprintBundle[] = await Promise.all(
      sprintIds.map(async (id) => {
        const { sprint, epics, noEpic } = await getSprintReviewData(config, id.trim());
        return { sprintId: id.trim(), sprint, epics, noEpic } as SprintBundle;
      })
    );

    const content = await analyzeSprintDataForSteering(config, bundles);
    return NextResponse.json({ success: true, content });
  } catch (err: unknown) {
    const msg = humanizeError(err, 'Steering Analysis');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
