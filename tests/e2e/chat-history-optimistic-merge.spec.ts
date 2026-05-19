import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${entries.join(',')}}`;
}

const DUPLICATE_RACE_PROMPT = 'Analyze a large repository without duplicating this query';

test.describe('ClawX chat history optimistic merge', () => {
  test('does not duplicate the optimistic user query when active history returns partial assistant activity', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 12345, connectedAt: Date.now() },
        gatewayRpc: {},
        hostApi: {
          [stableStringify(['/api/gateway/status', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { state: 'running', port: 18789, pid: 12345, connectedAt: Date.now() },
            },
          },
          [stableStringify(['/api/agents', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { success: true, agents: [{ id: 'main', name: 'main' }] },
            },
          },
        },
      });

      await app.evaluate(async () => {
        const { ipcMain } = process.mainModule!.require('electron') as typeof import('electron');

        let postSendHistoryCount = 0;
        let chatSendSeen = false;

        ipcMain.removeHandler('gateway:rpc');
        ipcMain.handle('gateway:rpc', async (_event: unknown, method: string, payload: Record<string, unknown> | undefined) => {
          if (method === 'sessions.list') {
            return {
              success: true,
              result: {
                sessions: [{ key: 'agent:main:main', displayName: 'main' }],
              },
            };
          }

          if (method === 'chat.history') {
            const nowSeconds = Date.now() / 1000;
            if (!chatSendSeen) {
              return {
                success: true,
                result: { messages: [] },
              };
            }

            postSendHistoryCount += 1;
            if (postSendHistoryCount === 1) {
              return {
                success: true,
                result: { messages: [] },
              };
            }
            return {
              success: true,
              result: {
                messages: [
                  {
                    role: 'user',
                    content: 'Analyze a large repository without duplicating this query',
                    // Deliberately older same-text turn: this must remain as a
                    // legitimate historical prompt instead of being coalesced
                    // with the active optimistic echo.
                    timestamp: nowSeconds - 120,
                  },
                  {
                    role: 'assistant',
                    id: 'older-answer',
                    content: 'Older answer for the repeated prompt',
                    timestamp: nowSeconds - 119,
                  },
                  {
                    role: 'user',
                    content: 'Analyze a large repository without duplicating this query',
                    timestamp: nowSeconds,
                  },
                  {
                    role: 'assistant',
                    id: 'partial-tool-turn',
                    content: [
                      {
                        type: 'tool_use',
                        id: 'read-1',
                        name: 'Read',
                        input: { file_path: 'README.md' },
                      },
                    ],
                    timestamp: nowSeconds + 1,
                  },
                ],
              },
            };
          }

          if (method === 'chat.send') {
            chatSendSeen = true;
            return {
              success: true,
              result: { runId: `run-${String(payload?.idempotencyKey ?? '1')}` },
            };
          }

          return { success: true, result: {} };
        });
      });

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) {
          throw error;
        }
      }

      await expect(page.getByTestId('main-layout')).toBeVisible();
      await expect(page.getByTestId('chat-composer-input')).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId('chat-composer-input').fill(DUPLICATE_RACE_PROMPT);
      await page.getByTestId('chat-composer-send').click();

      const promptMessages = page.locator('[data-testid^="chat-message-"]', { hasText: DUPLICATE_RACE_PROMPT });
      await expect(promptMessages).toHaveCount(2, { timeout: 10_000 });
      await expect(page.getByText('Older answer for the repeated prompt')).toBeVisible();
      await expect(page.getByTestId('chat-execution-graph')).toHaveCount(1);
    } finally {
      await closeElectronApp(app);
    }
  });
});
