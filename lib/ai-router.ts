import { AppConfig } from './config';
import type { SteeringContent, SprintBundle, EpicDeepDive } from './ai-types';
import { analyzeSprintDataForSteeringAzure, analyzeEpicForSteeringAzure } from './azure-ai';
import { analyzeSprintDataForSteeringOpenAI, analyzeEpicForSteeringOpenAI } from './openai-ai';

export type { SteeringContent, SprintBundle, EpicDeepDive };

/**
 * Auto-selects the AI provider based on what's configured:
 *   1. OpenAI (direct) — if openAi.apiKey is set
 *   2. Azure OpenAI   — if azureAi.endpoint + apiKey + deploymentName are set
 *   3. Error          — if neither is configured
 */
export async function analyzeSprintDataForSteering(
  config: AppConfig,
  bundles: SprintBundle[]
): Promise<SteeringContent> {
  const openAiReady = !!config.openAi?.apiKey;
  const azureReady =
    !!config.azureAi?.endpoint &&
    !!config.azureAi?.apiKey &&
    !!config.azureAi?.deploymentName;

  if (openAiReady) return analyzeSprintDataForSteeringOpenAI(config, bundles);
  if (azureReady) return analyzeSprintDataForSteeringAzure(config, bundles);

  throw new Error(
    'No AI provider is configured. ' +
      'Go to the Config page and fill in either an OpenAI API key (ChatGPT) or Azure OpenAI credentials.'
  );
}

/**
 * Runs a focused AI briefing for a single epic across the provided sprint bundles.
 * Returns an EpicDeepDive with one sprintProgress row per sprint.
 */
export async function analyzeEpicForSteering(
  config: AppConfig,
  epicKey: string,
  epicName: string,
  bundles: SprintBundle[]
): Promise<EpicDeepDive> {
  const openAiReady = !!config.openAi?.apiKey;
  const azureReady =
    !!config.azureAi?.endpoint &&
    !!config.azureAi?.apiKey &&
    !!config.azureAi?.deploymentName;

  if (openAiReady) return analyzeEpicForSteeringOpenAI(config, epicKey, epicName, bundles);
  if (azureReady) return analyzeEpicForSteeringAzure(config, epicKey, epicName, bundles);

  throw new Error(
    'No AI provider is configured. ' +
      'Go to the Config page and fill in either an OpenAI API key (ChatGPT) or Azure OpenAI credentials.'
  );
}

/**
 * Returns which provider is active, or null if neither is configured.
 * Useful for pre-flight checks in API routes.
 */
export function getActiveAiProvider(
  config: AppConfig
): 'openai' | 'azure' | null {
  if (config.openAi?.apiKey) return 'openai';
  if (
    config.azureAi?.endpoint &&
    config.azureAi?.apiKey &&
    config.azureAi?.deploymentName
  )
    return 'azure';
  return null;
}
