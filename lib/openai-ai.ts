import axios from 'axios';
import { AppConfig } from './config';
import { buildSystemPrompt, buildUserMessage, buildEpicBriefingUserMessage } from './ai-prompts';
import type { SteeringContent, SprintBundle, EpicDeepDive } from './ai-types';

async function callOpenAI<T>(config: AppConfig, userMessage: string): Promise<T> {
  const { openAi } = config;
  if (!openAi.apiKey) {
    throw new Error('OpenAI is not configured. Please set the API key in Config.');
  }

  const model = openAi.model || 'gpt-4o';
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    },
    {
      headers: { Authorization: `Bearer ${openAi.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 120_000,
    }
  );

  const raw = response.data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned an empty response');
  try { return JSON.parse(raw) as T; }
  catch { throw new Error(`OpenAI returned invalid JSON: ${raw.slice(0, 200)}`); }
}

export async function analyzeSprintDataForSteeringOpenAI(
  config: AppConfig,
  bundles: SprintBundle[]
): Promise<SteeringContent> {
  return callOpenAI<SteeringContent>(config, buildUserMessage(bundles));
}

export async function analyzeEpicForSteeringOpenAI(
  config: AppConfig,
  epicKey: string,
  epicName: string,
  bundles: SprintBundle[]
): Promise<EpicDeepDive> {
  return callOpenAI<EpicDeepDive>(config, buildEpicBriefingUserMessage(epicKey, epicName, bundles));
}
