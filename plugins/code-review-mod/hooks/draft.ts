import type { Draft, Finding } from '../types'

import type { Ports } from './ports'

/** The exact text posted on GitHub: the draft, then the suggested code when it has code. */
export function draftBody(draft: Draft, suggested: string): string {
  return draft.hasCode && suggested.trim() !== '' ? `${draft.text}\n\n\`\`\`\n${suggested}\n\`\`\`` : draft.text
}

/** Reads the model's rewrite: JSON `{ text, hasCode }`, else the reply as the new text. Nothing when empty. */
export function readRewrite(reply: string, before: Draft): Draft | undefined {
  try {
    const json: unknown = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1))
    if (typeof json === 'object' && json !== null && 'text' in json && typeof json.text === 'string' && json.text.trim() !== '') {
      return { text: json.text.trim(), hasCode: 'hasCode' in json && typeof json.hasCode === 'boolean' ? json.hasCode : before.hasCode }
    }
  } catch {
    // Not JSON: the reply is the new text.
  }
  const text = reply.trim()

  return text === '' ? undefined : { text, hasCode: before.hasCode }
}

/** Asks Claude to rewrite a draft from the user's note; nothing when there is no usable answer. */
export async function rewriteDraft(p: Pick<Ports, 'complete'>, finding: Finding, note: string): Promise<Draft | undefined> {
  const before = finding.draft ?? { text: '', hasCode: finding.suggested.trim() !== '' }
  const asked = await p.complete({
    model: 'sonnet',
    effort: 'low',
    maxTokens: 600,
    timeoutMs: 30000,
    system:
      'You rewrite one code review comment for the author of a pull request. Keep it short, polite and asked as a question. ' +
      'Never mention a score or a Standards/Spec label. The suggested code is attached below the text when "hasCode" is true; never put code in the text.',
    prompt: [
      `File: ${finding.file}:${finding.line}`,
      `Problem: ${finding.title}. ${finding.why}`,
      `Suggested code:\n${finding.suggested || '(none)'}`,
      `Current comment: ${JSON.stringify(before)}`,
      `The reviewer's note: ${note}`,
      '',
      'Answer with JSON only: {"text": "...", "hasCode": true|false}',
    ].join('\n'),
  })

  return asked.isAnswered ? readRewrite(asked.text, before) : undefined
}
