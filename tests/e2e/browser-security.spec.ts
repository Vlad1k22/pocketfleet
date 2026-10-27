import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { testAdmin, testApiUrl } from './lab';

const adminHeaders = { authorization: `Bearer ${testAdmin}` };
async function enroll(page: Page, request: APIRequestContext, name: string) {
  const codeReply = await request.post(`${testApiUrl}/v1/admin/codes`, { headers: adminHeaders });
  expect(codeReply.ok()).toBe(true);
  const { code } = await codeReply.json();
  await page.goto('/connection');
  await page.getByRole('textbox', { name: 'Server URL', exact: true }).fill(testApiUrl);
  await page.getByRole('textbox', { name: 'Device nickname', exact: true }).fill(name);
  await page.getByRole('textbox', { name: 'Enrollment code', exact: true }).fill(code);
  await page
    .getByRole('switch', { name: 'Consent to share device inventory', exact: true })
    .check();
  const response = page.waitForResponse(
    (response) =>
      response.url() === `${testApiUrl}/v1/enroll` && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Enroll device', exact: true }).click();
  const enrolled = await response;
  expect(enrolled.ok()).toBe(true);
  await expect(page.getByText('CONNECTED LAB', { exact: true })).toBeVisible();
  return (await enrolled.json()).session as { deviceId: string; token: string };
}

test('stored HTML and script reminders remain inert text in the real UI', async ({
  page,
  request,
}, testInfo) => {
  const session = await enroll(page, request, `XSS lab ${testInfo.project.name}`);
  const probe = '/__pocketfleet_xss_probe';
  let probeRequested = false;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === probe) probeRequested = true;
  });
  const payloads = [
    `<img data-pocketfleet-xss src="${probe}" onerror="window.__pocketfleetXss=1">`,
    '<script>window.__pocketfleetXss=1</script>',
  ];
  for (const message of payloads) {
    const response = await request.post(
      `${testApiUrl}/v1/admin/devices/${session.deviceId}/commands`,
      { headers: adminHeaders, data: { type: 'show_message', message } },
    );
    expect(response.ok()).toBe(true);
  }
  await page.getByRole('tab', { name: /Activity/ }).click();
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  for (const payload of payloads)
    await expect(page.getByText(payload, { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const response = await request.get(
        `${testApiUrl}/v1/admin/devices/${session.deviceId}/commands`,
        { headers: adminHeaders },
      );
      const commands = (await response.json()) as { status: string }[];
      return (
        commands.length === 2 && commands.every((command) => command.status === 'acknowledged')
      );
    })
    .toBe(true);
  expect(await page.locator('img[data-pocketfleet-xss]').count()).toBe(0);
  expect(
    await page
      .locator('script')
      .evaluateAll((nodes) =>
        nodes.some((node) => node.textContent?.includes('window.__pocketfleetXss=1')),
      ),
  ).toBe(false);
  expect(await page.evaluate(() => '__pocketfleetXss' in window)).toBe(false);
  expect(probeRequested).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('inert-reminders.png'), fullPage: true });
});

test('web tokens stay out of browser storage and revocation stops the live session', async ({
  page,
  request,
}, testInfo) => {
  const session = await enroll(page, request, `Revocation lab ${testInfo.project.name}`);
  const persisted = await page.evaluate(
    (token) =>
      [localStorage, sessionStorage].some((storage) =>
        Object.keys(storage).some((key) => (storage.getItem(key) ?? '').includes(token)),
      ),
    session.token,
  );
  expect(persisted).toBe(false);
  const revoked = await request.delete(`${testApiUrl}/v1/admin/devices/${session.deviceId}`, {
    headers: adminHeaders,
  });
  expect(revoked.ok()).toBe(true);
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(
    page.getByText('Session revoked. Disconnect and enroll again.', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('revoked-session.png'), fullPage: true });
  await page.reload();
  await expect(page.getByText('DEMO', { exact: true })).toBeVisible();
  await expect(page.getByText('CONNECTED LAB', { exact: true })).toHaveCount(0);
});
