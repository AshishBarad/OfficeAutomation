import { NextRequest, NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { getSprintReviewData } from '@/lib/jira';
import { humanizeError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const config = readConfig();

  try {
    const { sprintIds } = (await req.json()) as { sprintIds: string[] };
    if (!sprintIds?.length) {
      return NextResponse.json(
        { success: false, error: 'No sprint IDs provided. Enter one or more sprint IDs.' },
        { status: 400 }
      );
    }

    if (!config.jira.baseUrl) {
      return NextResponse.json(
        { success: false, error: 'Jira Base URL is not configured. Go to the Config page and fill in your Jira settings.' },
        { status: 400 }
      );
    }

    // Fetch data for each sprint in parallel directly from Jira (zero AI call)
    const bundles = await Promise.all(
      sprintIds.map(async (id) => {
        const { sprint, epics, noEpic } = await getSprintReviewData(config, id.trim());
        return { sprintId: id.trim(), sprint, epics, noEpic };
      })
    );

    // Collect all unique epics across all sprints
    const epicMap = new Map<string, { key: string; name: string; issueCount: number }>();
    for (const bundle of bundles) {
      for (const epic of bundle.epics) {
        const existing = epicMap.get(epic.key);
        const count = epic.stories.length + epic.orphanIssues.length;
        if (!existing) {
          epicMap.set(epic.key, { key: epic.key, name: epic.summary, issueCount: count });
        } else {
          existing.issueCount += count;
        }
      }
    }

    const epics = Array.from(epicMap.values());
    const sprintNames = bundles.map((b) => b.sprint.name);

    return NextResponse.json({ success: true, sprintIds, sprintNames, epics });
  } catch (err: unknown) {
    const msg = humanizeError(err, 'Sprint Epic Fetch');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
