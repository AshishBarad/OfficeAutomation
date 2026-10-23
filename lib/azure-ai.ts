import axios from 'axios';
import { AppConfig } from './config';
import { buildSystemPrompt, buildUserMessage, buildEpicBriefingUserMessage } from './ai-prompts';
import type { SteeringContent, SprintBundle, EpicDeepDive } from './ai-types';

export type {
  StatusType,
  SummaryRow,
  SprintActivity,
  EpicDeepDive,
  Workstream,
  SteeringContent,
  SprintBundle,
} from './ai-types';

async function callAzure<T>(config: AppConfig, userMessage: string): Promise<T> {
  const { azureAi } = config;
  if (!azureAi.endpoint || !azureAi.apiKey || !azureAi.deploymentName) {
    throw new Error('Azure AI is not configured. Please set endpoint, API key and deployment name in Config.');
  }

  const url = `${azureAi.endpoint.replace(/\/$/, '')}/openai/deployments/${azureAi.deploymentName}/chat/completions?api-version=${azureAi.apiVersion || '2025-01-01-preview'}`;

  const response = await axios.post(
    url,
    {
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    },
    {
      headers: { 'api-key': azureAi.apiKey, 'Content-Type': 'application/json' },
      timeout: 120_000,
    }
  );

  const raw = response.data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Azure AI returned an empty response');
  try { return JSON.parse(raw) as T; }
  catch { throw new Error(`Azure AI returned invalid JSON: ${raw.slice(0, 200)}`); }
}

export async function analyzeSprintDataForSteeringAzure(
  config: AppConfig,
  bundles: SprintBundle[]
): Promise<SteeringContent> {
  return callAzure<SteeringContent>(config, buildUserMessage(bundles));
}

export async function analyzeEpicForSteeringAzure(
  config: AppConfig,
  epicKey: string,
  epicName: string,
  bundles: SprintBundle[]
): Promise<EpicDeepDive> {
  return callAzure<EpicDeepDive>(config, buildEpicBriefingUserMessage(epicKey, epicName, bundles));
}

/** @deprecated Import from ai-router instead — this alias exists for backwards compatibility only */
export const analyzeSprintDataForSteering = analyzeSprintDataForSteeringAzure;
