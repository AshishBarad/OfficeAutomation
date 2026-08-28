import { NextRequest, NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { getSprintReviewData } from '@/lib/jira';
import { analyzeSprintDataForSteering, SprintBundle } from '@/lib/azure-ai';

export async function POST(req: NextRequest) {
  try {
    const { sprintIds } = (await req.json()) as { sprintIds: string[] };
    if (!sprintIds?.length) {
      return NextResponse.json(
        { success: false, error: 'No sprint IDs provided' },
        { status: 400 }
      );
    }

    const config = readConfig();

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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
