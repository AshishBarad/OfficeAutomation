import axios from 'axios';
import { AppConfig } from './config';

export type StatusType = 'on-track' | 'managed-risk' | 'escalation' | 'planned';

export interface SummaryRow {
  feature: string;      // bold part, e.g. "Alexa Account Linking"
  description: string;  // rest of text after dash
  status: StatusType;
}

export interface SprintActivity {
  sprintName: string;
  activities: string;
}

export interface EpicDeepDive {
  epicKey: string;
  epicName: string;
  intro: string;
  sprintProgress: SprintActivity[];
  challenges: string[];
}

export interface Workstream {
  title: string;
  bullets: string[];
}

export interface SteeringContent {
  sprintRange: string;        // e.g. "Sprints 7-11"
  summaryIntro: string;       // "Over the last N sprints..."
  executiveSummary: SummaryRow[];
  epicDeepDives: EpicDeepDive[];
  otherWorkstreams: Workstream[];
  collaborationBullets: string[];
}

// SprintBundle = data from getSprintReviewData for one sprint
export interface SprintBundle {
  sprintId: string;
  sprint: { id: number; name: string; startDate: string; endDate: string; goal?: string };
  epics: Array<{
    key: string;
    summary: string;
    status: string;
    stories: Array<{
      issue: { key: string; fields: { summary: string; status: { name: string }; issuetype: { name: string } } };
      subIssues: Array<{ key: string; fields: { summary: string; status: { name: string } } }>;
    }>;
    orphanIssues: Array<{ key: string; fields: { summary: string; status: { name: string } } }>;
  }>;
  noEpic: Array<{ key: string; fields: { summary: string } }>;
}

export async function analyzeSprintDataForSteering(
  config: AppConfig,
  bundles: SprintBundle[]
): Promise<SteeringContent> {
  const { azureAi } = config;
  if (!azureAi.endpoint || !azureAi.apiKey || !azureAi.deploymentName) {
    throw new Error(
      'Azure AI is not configured. Please set endpoint, API key and deployment name in Config.'
    );
  }

  const url = `${azureAi.endpoint.replace(/\/$/, '')}/openai/deployments/${azureAi.deploymentName}/chat/completions?api-version=${azureAi.apiVersion || '2025-01-01-preview'}`;

  const systemPrompt = `You are a senior technical program manager. You analyze Jira sprint data and produce structured steering committee meeting agendas.
Return ONLY valid JSON matching the exact schema provided. No markdown, no explanation, no code fences - just the raw JSON object.`;

  const sprintCount = bundles.length;
  const sprintNames = bundles.map((b) => b.sprint.name).join(', ');

  const userMessage = `Analyze the following Jira sprint data from ${sprintCount} sprint(s) (${sprintNames}) and produce a steering meeting agenda JSON.

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

  const response = await axios.post(
    url,
    {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        'api-key': azureAi.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 120_000,
    }
  );

  const raw = response.data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Azure AI returned an empty response');

  try {
    return JSON.parse(raw) as SteeringContent;
  } catch {
    throw new Error(`Azure AI returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}
