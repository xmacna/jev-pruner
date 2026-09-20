import { describe, expect, it, vi } from 'vitest';
import { trimOutput } from '../src/output.js';
import type { JevQuestions, JevState } from '../src/jev.js';

describe('Argos retention contract', () => {
  it('returns the exact original when all required output cannot fit the visible budget', async () => {
    const lines = Array.from(
      { length: 200 },
      (_, index) => `line-${index + 1} ${'cache '.repeat(55)}`,
    );
    lines[130] = `required_receipt=RFA-KEEP-130 ${'cache '.repeat(55)}`;
    const output = lines.join('\n');
    let calls = 0;
    const onDecision = vi.fn();

    const result = await trimOutput(
      {
        command: 'run command',
        goal: 'All lines must remain available, including required_receipt.',
        output,
      },
      {
        async ask(_state: JevState, questions: JevQuestions) {
          calls += 1;
          return {
            answers: Object.fromEntries(
              Object.keys(questions).map(id => [id, { type: 'noul' as const, noul: 0.99 }]),
            ),
          };
        },
      },
      { maxChars: 8_000, onDecision },
    );

    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(12);
    expect(result.output).toBe(output);
    expect(result.output).toContain('required_receipt=RFA-KEEP-130');
    expect(result.trimmed).toBe(false);
    expect(onDecision).toHaveBeenCalledWith('budget_unfit');
  });
});
