// Shared type definitions for AI-based steering content generation.
// Both azure-ai.ts and openai-ai.ts implement these interfaces.

export type StatusType = 'on-track' | 'managed-risk' | 'escalation' | 'planned';

export interface SummaryRow {
  feature: string;
  description: string;
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
  sprintRange: string;
  summaryIntro: string;
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
