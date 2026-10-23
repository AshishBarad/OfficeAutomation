import { NextRequest, NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { getSprintReviewData } from '@/lib/jira';
import { analyzeEpicForSteering, getActiveAiProvider } from '@/lib/ai-router';
import type { SprintBundle } from '@/lib/ai-types';
import { humanizeError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const config = readConfig();

  try {
    const { epicKey, epicName, sprintIds } = (await req.json()) as {
      epicKey: string;
      epicName: string;
      sprintIds: string[];
    };

    if (!epicKey || !sprintIds?.length) {
      return NextResponse.json(
        { success: false, error: 'epicKey and sprintIds are required.' },
        { status: 400 }
      );
    }

    if (!config.jira.baseUrl) {
      return NextResponse.json(
        { success: false, error: 'Jira Base URL is not configured.' },
        { status: 400 }
      );
    }

    if (!getActiveAiProvider(config)) {
      return NextResponse.json(
        {
          success: false,
          error: 'No AI provider is configured. Go to Config and fill in either an OpenAI API key or Azure OpenAI credentials.',
        },
        { status: 400 }
      );
    }

    // Fetch sprint data in parallel
    const bundles: SprintBundle[] = await Promise.all(
      sprintIds.map(async (id) => {
        const { sprint, epics, noEpic } = await getSprintReviewData(config, id.trim());
        return { sprintId: id.trim(), sprint, epics, noEpic } as SprintBundle;
      })
    );

    const epicDeepDive = await analyzeEpicForSteering(config, epicKey, epicName, bundles);

    // Ensure every sprint has a row — fill any gaps the AI might have missed
    const sprintNames = bundles.map((b) => b.sprint.name);
    const coveredSprints = new Set(epicDeepDive.sprintProgress.map((s) => s.sprintName));
    for (const name of sprintNames) {
      if (!coveredSprints.has(name)) {
        epicDeepDive.sprintProgress.push({ sprintName: name, activities: 'No activity recorded' });
      }
    }
    // Re-order to match sprint input order
    epicDeepDive.sprintProgress.sort(
      (a, b) => sprintNames.indexOf(a.sprintName) - sprintNames.indexOf(b.sprintName)
    );

    return NextResponse.json({ success: true, epicDeepDive, sprintNames });
  } catch (err: unknown) {
    const msg = humanizeError(err, 'Epic Briefing');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
