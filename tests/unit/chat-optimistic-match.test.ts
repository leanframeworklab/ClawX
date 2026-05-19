import { describe, expect, it } from 'vitest';
import { matchesOptimisticUserMessage, mergeOptimisticUserIntoLoadedHistory } from '@/stores/chat/helpers';

describe('matchesOptimisticUserMessage', () => {
  it('matches when text is identical', () => {
    const optimistic = { role: 'user', content: 'run github1', timestamp: 1_700_000_000 } as const;
    const candidate = { role: 'user', content: 'run github1', timestamp: 1_700_000_000 } as const;

    expect(matchesOptimisticUserMessage(candidate, optimistic, 1_700_000_000_000)).toBe(true);
  });

  it('matches when Gateway prefixes a weekday/timestamp prefix on the echoed user message', () => {
    const optimistic = { role: 'user', content: 'run github1', timestamp: 1_700_000_000 } as const;
    const candidate = {
      role: 'user',
      content: '[Wed 2026-04-22 10:30 GMT+8] run github1',
      timestamp: 1_700_000_000,
    } as const;

    expect(matchesOptimisticUserMessage(candidate, optimistic, 1_700_000_000_000)).toBe(true);
  });

  it('matches when the server appends [media attached: ...] to the echoed user message', () => {
    const optimistic = {
      role: 'user',
      content: 'Describe this image',
      timestamp: 1_700_000_000,
      _attachedFiles: [
        {
          fileName: 'shot.png',
          mimeType: 'image/png',
          fileSize: 123,
          preview: null,
          filePath: '/tmp/shot.png',
        },
      ],
    } as const;
    const candidate = {
      role: 'user',
      content: 'Describe this image\n\n[media attached: /tmp/shot.png (image/png) | /tmp/shot.png]',
      timestamp: 1_700_000_000,
    } as const;

    expect(matchesOptimisticUserMessage(candidate, optimistic, 1_700_000_000_000)).toBe(true);
  });

  it('matches when the server strips a [message_id: ...] tag from the user message', () => {
    const optimistic = { role: 'user', content: 'hello world', timestamp: 1_700_000_000 } as const;
    const candidate = {
      role: 'user',
      content: 'hello world [message_id: 11111111-2222-3333-4444-555555555555]',
      timestamp: 1_700_000_000,
    } as const;

    expect(matchesOptimisticUserMessage(candidate, optimistic, 1_700_000_000_000)).toBe(true);
  });

  it('still rejects unrelated user messages', () => {
    const optimistic = { role: 'user', content: 'run github1', timestamp: 1_700_000_000 } as const;
    const candidate = {
      role: 'user',
      content: '[Wed 2026-04-22 10:30 GMT+8] completely different text',
      timestamp: 1_700_000_000,
    } as const;

    expect(matchesOptimisticUserMessage(candidate, optimistic, 1_700_000_000_000)).toBe(false);
  });

  // Regression for the duplicate-bubble bug reproduced in session
  // fa07a446-c107-4252-9948-c063357647bc.jsonl: the Gateway echo carries a
  // Sender block, one or more `[media attached: ...]` lines BEFORE the
  // `[Mon ... GMT+8]` timestamp prefix, the real user text, and a trailing
  // `[media attached: ...]` line. Earlier code stripped the timestamp
  // regex before the media-attached lines, so the timestamp anchor
  // `^\s*\[(?:Mon|...)]` never matched (the leading `[` was
  // `[media attached:`). The normalized comparison text kept the
  // `[Mon ...]` prefix and never equalled the bare optimistic text,
  // causing dedupe to miss and the message to render twice — the second
  // bubble showing the leftover `[Mon ...]` prefix.
  it('matches the full Gateway echo with Sender block, leading + trailing media lines, and a timestamp prefix', () => {
    const optimistic = {
      role: 'user',
      content: 'Please help me investigate why I am not getting a reply when I send messages on Discord. ClawX is now in connected status.',
      timestamp: 1_700_000_000,
      _attachedFiles: [
        {
          fileName: 'image---9ad2735c.png',
          mimeType: 'image/png',
          fileSize: 456,
          preview: null,
          filePath: '/Users/guoyuliang/.openclaw/media/inbound/image---9ad2735c-21ce-443e-af5c-1cd290c1d8d0.png',
        },
      ],
    } as const;
    const candidate = {
      role: 'user',
      content: [
        'Sender (untrusted metadata):',
        '```json',
        '{',
        '  "label": "ClawX (gateway-client)",',
        '  "id": "gateway-client",',
        '  "name": "ClawX",',
        '  "username": "ClawX"',
        '}',
        '```',
        '',
        '[media attached: /Users/guoyuliang/.openclaw/media/inbound/image---9ad2735c-21ce-443e-af5c-1cd290c1d8d0.png (image/png)]',
        '[Mon 2026-05-18 10:39 GMT+8] Please help me investigate why I am not getting a reply when I send messages on Discord. ClawX is now in connected status.',
        '[media attached: /Users/guoyuliang/.openclaw/media/outbound/fa3637d9-98b9-4e77-a176-3f66ca763cf4.png (image/png) | /Users/guoyuliang/.openclaw/media/outbound/fa3637d9-98b9-4e77-a176-3f66ca763cf4.png]',
      ].join('\n'),
      timestamp: 1_700_000_000,
    } as const;

    expect(matchesOptimisticUserMessage(candidate, optimistic, 1_700_000_000_000)).toBe(true);
  });
});

describe('mergeOptimisticUserIntoLoadedHistory', () => {
  const userTimestampMs = 1_700_000_000_000;
  const optimistic = {
    role: 'user',
    content: 'Analyze the repository',
    timestamp: userTimestampMs / 1000,
  } as const;

  it('keeps older repeated prompts and coalesces only duplicate echoes near the active send', () => {
    const currentEchoTimestamp = userTimestampMs / 1000;
    const messages = mergeOptimisticUserIntoLoadedHistory(
      [
        { role: 'user', content: 'Analyze the repository', timestamp: 1 },
        { role: 'assistant', content: 'Older answer', timestamp: 2 },
        { role: 'user', content: 'Analyze the repository', timestamp: currentEchoTimestamp - 1 },
        { role: 'user', content: 'Analyze the repository', timestamp: currentEchoTimestamp },
        { role: 'assistant', content: 'Working', timestamp: currentEchoTimestamp + 1 },
      ],
      [
        { role: 'user', content: 'Analyze the repository', timestamp: 1 },
        { role: 'assistant', content: 'Older answer', timestamp: 2 },
        { role: 'user', content: 'Analyze the repository', timestamp: currentEchoTimestamp - 1 },
        { role: 'user', content: 'Analyze the repository', timestamp: currentEchoTimestamp },
        { role: 'assistant', content: 'Working', timestamp: currentEchoTimestamp + 1 },
      ],
      [optimistic],
      true,
      userTimestampMs,
    );

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(messages.map((message) => message.content)).toEqual([
      'Analyze the repository',
      'Older answer',
      'Analyze the repository',
      'Working',
    ]);
    expect(messages[2]?.timestamp).toBe(currentEchoTimestamp);
  });

  it('preserves optimistic user at the tail when history only contains pre-send assistant activity', () => {
    const messages = mergeOptimisticUserIntoLoadedHistory(
      [
        { role: 'user', content: 'Previous prompt', timestamp: 1 },
        { role: 'assistant', content: 'Previous answer', timestamp: 2 },
      ],
      [
        { role: 'user', content: 'Previous prompt', timestamp: 1 },
        { role: 'assistant', content: 'Previous answer', timestamp: 2 },
      ],
      [optimistic],
      true,
      userTimestampMs,
    );

    expect(messages.map((message) => message.content)).toEqual([
      'Previous prompt',
      'Previous answer',
      'Analyze the repository',
    ]);
  });

  it('keeps near duplicate prompts when attachment signatures are explicitly different', () => {
    const currentEchoTimestamp = userTimestampMs / 1000;
    const messages = mergeOptimisticUserIntoLoadedHistory(
      [
        {
          role: 'user',
          content: 'Analyze the repository',
          timestamp: currentEchoTimestamp - 1,
          _attachedFiles: [{ fileName: 'a.txt', mimeType: 'text/plain', fileSize: 1, preview: null, filePath: '/tmp/a.txt' }],
        },
        {
          role: 'user',
          content: 'Analyze the repository',
          timestamp: currentEchoTimestamp,
          _attachedFiles: [{ fileName: 'b.txt', mimeType: 'text/plain', fileSize: 1, preview: null, filePath: '/tmp/b.txt' }],
        },
      ],
      [],
      [{
        ...optimistic,
        _attachedFiles: [{ fileName: 'b.txt', mimeType: 'text/plain', fileSize: 1, preview: null, filePath: '/tmp/b.txt' }],
      }],
      true,
      userTimestampMs,
    );

    expect(messages).toHaveLength(2);
  });

  it('inserts optimistic user before timestamp-less partial assistant activity instead of appending at tail', () => {
    const messages = mergeOptimisticUserIntoLoadedHistory(
      [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }] },
      ],
      [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }] },
      ],
      [optimistic],
      true,
      userTimestampMs,
    );

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('preserves optimistic user at tail when old visible history exists and only post-send tool_result is filtered out', () => {
    const messages = mergeOptimisticUserIntoLoadedHistory(
      [
        { role: 'user', content: 'Previous prompt', timestamp: 1 },
        { role: 'assistant', content: 'Previous answer', timestamp: 2 },
      ],
      [
        { role: 'user', content: 'Previous prompt', timestamp: 1 },
        { role: 'assistant', content: 'Previous answer', timestamp: 2 },
        { role: 'toolresult', content: 'tool finished', timestamp: userTimestampMs / 1000 + 1 },
      ],
      [optimistic],
      true,
      userTimestampMs,
    );

    expect(messages.map((message) => message.content)).toEqual([
      'Previous prompt',
      'Previous answer',
      'Analyze the repository',
    ]);
  });

  it('preserves optimistic user when old same-text user has no timestamp', () => {
    const messages = mergeOptimisticUserIntoLoadedHistory(
      [
        { role: 'user', content: 'Analyze the repository' },
        { role: 'assistant', content: 'Previous answer without timestamp' },
      ],
      [
        { role: 'user', content: 'Analyze the repository' },
        { role: 'assistant', content: 'Previous answer without timestamp' },
      ],
      [optimistic],
      true,
      userTimestampMs,
    );

    expect(messages.map((message) => message.content)).toEqual([
      'Analyze the repository',
      'Previous answer without timestamp',
      'Analyze the repository',
    ]);
  });

  it('preserves optimistic user after old timestamp-less history when no current activity is visible', () => {
    const messages = mergeOptimisticUserIntoLoadedHistory(
      [
        { role: 'user', content: 'Previous prompt' },
        { role: 'assistant', content: 'Previous answer without timestamp' },
      ],
      [
        { role: 'user', content: 'Previous prompt' },
        { role: 'assistant', content: 'Previous answer without timestamp' },
      ],
      [optimistic],
      true,
      userTimestampMs,
    );

    expect(messages.map((message) => message.content)).toEqual([
      'Previous prompt',
      'Previous answer without timestamp',
      'Analyze the repository',
    ]);
  });

  it('matches optimistic user when Gateway prefixes Sender metadata', () => {
    const candidate = {
      role: 'user',
      content: 'Sender (untrusted metadata): {"channel":"test"}\nAnalyze the repository',
      timestamp: userTimestampMs / 1000,
    } as const;

    expect(matchesOptimisticUserMessage(candidate, optimistic, userTimestampMs)).toBe(true);
  });
});
