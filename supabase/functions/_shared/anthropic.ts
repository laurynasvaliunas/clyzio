const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export type ClaudeModel =
  | 'claude-haiku-4-5-20251001'   // fast/cheap — commute planner, carpool matcher
  | 'claude-sonnet-4-6';          // high-quality — sustainability manager reports

export interface ClaudeRequest {
  system: string;
  user: string;
  model?: ClaudeModel;
  maxTokens?: number;
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ClaudeResult {
  text: string;
  usage: ClaudeUsage;
}

/**
 * Calls the Anthropic Claude API and returns the text response.
 * Always instructs Claude to return valid JSON — caller is responsible for parsing.
 */
export async function callClaude(req: ClaudeRequest): Promise<ClaudeResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const model = req.model ?? 'claude-haiku-4-5-20251001';
  const maxTokens = req.maxTokens ?? 1024;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? '';
  const usage: ClaudeUsage = data.usage ?? { input_tokens: 0, output_tokens: 0 };

  return { text, usage };
}

/**
 * Parses JSON from Claude's response text.
 * Strips markdown code fences if Claude wrapped the JSON in them.
 */
export function parseClaudeJSON<T>(text: string): T {
  // Strip markdown fences like ```json ... ```
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${cleaned.slice(0, 200)}`);
  }
}
