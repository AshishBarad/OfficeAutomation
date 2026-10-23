import { NextRequest, NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { getSprintReviewData } from '@/lib/jira';
import { analyzeSprintDataForSteering, getActiveAiProvider, SprintBundle } from '@/lib/ai-router';
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

    if (!config.jira.baseUrl) {
      return NextResponse.json(
        { success: false, error: 'Jira Base URL is not configured. Go to the Config page and fill in your Jira settings.' },
        { status: 400 }
      );
    }

    if (!getActiveAiProvider(config)) {
      return NextResponse.json(
        {
          success: false,
          error: 'No AI provider is configured. Go to the Config page and fill in either an OpenAI API key (ChatGPT) or Azure OpenAI credentials.',
        },
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

    // Collect all unique epics across all sprints for the epic selector
    const epicMap = new Map<string, string>();
    for (const bundle of bundles) {
      for (const epic of bundle.epics) {
        if (!epicMap.has(epic.key)) epicMap.set(epic.key, epic.summary);
      }
    }
    const epics = Array.from(epicMap.entries()).map(([key, name]) => ({ key, name }));
    const sprintNames = bundles.map((b) => b.sprint.name);

    return NextResponse.json({ success: true, content, epics, sprintNames });
  } catch (err: unknown) {
    const msg = humanizeError(err, 'Steering Analysis');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
