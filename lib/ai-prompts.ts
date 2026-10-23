import type { SprintBundle } from './ai-types';

export function buildSystemPrompt(): string {
  return `You are a senior technical program manager. You analyze Jira sprint data and produce structured steering committee meeting agendas.
Return ONLY valid JSON matching the exact schema provided. No markdown, no explanation, no code fences - just the raw JSON object.`;
}

export function buildUserMessage(bundles: SprintBundle[]): string {
  const sprintCount = bundles.length;
  const sprintNames = bundles.map((b) => b.sprint.name).join(', ');

  return `Analyze the following Jira sprint data from ${sprintCount} sprint(s) (${sprintNames}) and produce a steering meeting agenda JSON.

Sprint data:
${JSON.stringify(bundles, null, 2)}

Return a JSON object matching EXACTLY this TypeScript interface (use actual data from above - do NOT invent facts):
{
  "sprintRange": "string - e.g. 'Sprint 7' or 'Sprints 7-11'",
  "summaryIntro": "string - one sentence like 'Over the last N sprints, the team effort was distributed across X major workstreams'",
  "executiveSummary": [
    {
      "feature": "string - feature/epic name",
      "description": "string - 1-2 sentence description of what was done",
      "status": "one of: on-track | managed-risk | escalation | planned"
    }
  ],
  "epicDeepDives": [
    {
      "epicKey": "string - Jira epic key",
      "epicName": "string - human readable epic name",
      "intro": "string - 1-2 sentence narrative about this epic across sprints",
      "sprintProgress": [
        { "sprintName": "string", "activities": "string - key activities in this sprint for this epic" }
      ],
      "challenges": ["string - one challenge per item"]
    }
  ],
  "otherWorkstreams": [
    {
      "title": "string - workstream name",
      "bullets": ["string - one bullet per item"]
    }
  ],
  "collaborationBullets": ["string - recurring governance activities"]
}

Rules:
- Only include epics with meaningful activity in epicDeepDives (skip trivial/one-liner epics)
- otherWorkstreams covers epics/themes not in deep dives
- collaborationBullets describes recurring team ceremonies and stakeholder sync activities
- Base all content strictly on the provided data`;
}

/**
 * Prompt for briefing a single specific epic across multiple sprints.
 * Returns a focused EpicDeepDive object (not the full SteeringContent).
 */
export function buildEpicBriefingUserMessage(
  epicKey: string,
  epicName: string,
  bundles: SprintBundle[]
): string {
  const sprintNames = bundles.map((b) => b.sprint.name).join(', ');

  // Filter each bundle down to just the relevant epic's data to keep the context concise
  const focusedBundles = bundles.map((b) => ({
    sprintName: b.sprint.name,
    sprintGoal: b.sprint.goal ?? '',
    epicData: b.epics.find((e) => e.key === epicKey) ?? null,
  }));

  return `You are analyzing Jira data for a SINGLE epic to produce a deep-dive briefing for a steering committee.

Epic: ${epicKey} — ${epicName}
Sprints covered: ${sprintNames}

Sprint-by-sprint data for this epic:
${JSON.stringify(focusedBundles, null, 2)}

Return a JSON object matching EXACTLY this schema (base everything strictly on the data above — do NOT invent facts):
{
  "epicKey": "${epicKey}",
  "epicName": "${epicName}",
  "intro": "string - 2-3 sentences summarising the current state and overall progress of this epic across all sprints",
  "sprintProgress": [
    { "sprintName": "string - exact sprint name", "activities": "string - what was done for this epic in that sprint; write 'No activity recorded' if epicData is null" }
  ],
  "challenges": ["string - one concrete challenge or risk per item; leave array empty if none found"]
}

Rules:
- Include one sprintProgress entry for EVERY sprint listed above (${sprintNames}), even if there was no activity
- Keep activities concise (1-2 sentences per sprint)
- challenges should reflect real blockers or risks visible in the data`;
}
