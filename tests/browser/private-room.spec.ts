import { expect, test, type Page } from '@playwright/test'

const enterOnlineMenu = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Play Online/i }).click()
}

const serverTick = async (page: Page) =>
  Number(await page.locator('.online-match-status').getAttribute('data-server-tick'))

const statusNumber = async (page: Page, attribute: string) =>
  Number(await page.locator('.online-match-status').getAttribute(attribute))

test('classifies same-origin health and direct realtime failures', async ({ browser }) => {
  const healthContext = await browser.newContext()
  const healthPage = await healthContext.newPage()
  await enterOnlineMenu(healthPage)
  await healthPage.getByRole('button', { name: /Create Private Room/i }).click()
  let healthAttempts = 0
  await healthPage.route('**/game-server/health', async (route) => {
    healthAttempts += 1
    await route.abort('blockedbyclient')
  })
  await healthPage.getByRole('button', { name: /^Create Room/i }).click()
  await expect(
    healthPage.getByText(/privacy extension or network filter may be blocking/i),
  ).toBeVisible()
  expect(healthAttempts).toBe(4)
  await healthPage.getByText('Connection troubleshooting').click()
  await expect(healthPage.getByText(/Allow this game site in content blockers/i)).toBeVisible()
  await healthPage.getByRole('button', { name: 'Back' }).click()
  const attemptsAfterNavigation = healthAttempts
  await healthPage.waitForTimeout(1800)
  expect(healthAttempts).toBe(attemptsAfterNavigation)
  await healthContext.close()

  const realtimeContext = await browser.newContext()
  await realtimeContext.addInitScript(() => {
    const NativeWebSocket = window.WebSocket
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const requestedUrl = String(url)
        const blockForTest = new URL(requestedUrl).port === '2677'
        if (blockForTest)
          (window as Window & { __blockedGameSockets?: number }).__blockedGameSockets =
            ((window as Window & { __blockedGameSockets?: number }).__blockedGameSockets ?? 0) + 1
        super(blockForTest ? 'ws://127.0.0.1:1/__blocked-game-socket' : url, protocols)
      }
    }
  })
  const realtimePage = await realtimeContext.newPage()
  await realtimePage.route('**/game-server/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', service: 'mossfire-server', protocolVersion: 1 }),
    }),
  )
  await enterOnlineMenu(realtimePage)
  await realtimePage.getByRole('button', { name: /Create Private Room/i }).click()
  await realtimePage.getByRole('button', { name: /^Create Room/i }).click()
  await expect(
    realtimePage.getByText(/server is reachable, but the realtime connection could not be opened/i),
  ).toBeVisible()
  expect(
    await realtimePage.evaluate(
      () => (window as Window & { __blockedGameSockets?: number }).__blockedGameSockets ?? 0,
    ),
  ).toBeGreaterThan(0)
  await realtimeContext.close()
})

test('private room authority, reconnect, result, and rematch', async ({ browser, request }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const playerA = await contextA.newPage()
  const playerB = await contextB.newPage()
  const corsErrors: string[] = []
  const browserHealthRequests: string[] = []
  const browserRoomLookups: string[] = []
  for (const page of [playerA, playerB])
    page.on('request', (request) => {
      if (request.url().endsWith('/health')) browserHealthRequests.push(request.url())
      if (/\/api\/private-rooms\//.test(request.url())) browserRoomLookups.push(request.url())
    })
  for (const page of [playerA, playerB])
    page.on('console', (message) => {
      if (message.type() === 'error' && /cors|cross-origin/i.test(message.text()))
        corsErrors.push(message.text())
    })

  const health = await request.get('http://127.0.0.1:2677/health', {
    headers: { Origin: 'http://127.0.0.1:4173' },
  })
  expect(health.ok()).toBe(true)
  expect(await health.json()).toEqual({
    status: 'ok',
    service: 'mossfire-server',
    protocolVersion: 1,
  })
  expect(health.headers()['access-control-allow-origin']).toBe('http://127.0.0.1:4173')
  expect(health.headers().vary).toMatch(/(?:^|,\s*)Origin(?:,|$)/i)
  const disallowedHealth = await request.get('http://127.0.0.1:2677/health', {
    headers: { Origin: 'https://attacker.example' },
  })
  expect(disallowedHealth.headers()['access-control-allow-origin']).toBeUndefined()
  const proxiedHealth = await request.get('http://127.0.0.1:4173/game-server/health')
  expect(proxiedHealth.ok()).toBe(true)
  expect(await proxiedHealth.json()).toEqual({
    status: 'ok',
    service: 'mossfire-server',
    protocolVersion: 1,
  })

  await enterOnlineMenu(playerA)
  await playerA.getByRole('button', { name: /Create Private Room/i }).click()
  await playerA.getByLabel('Your player name').fill('Atlas')
  let healthAttempts = 0
  await playerA.route('**/health', async (route) => {
    healthAttempts += 1
    await new Promise((resolve) => setTimeout(resolve, 6500))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', service: 'mossfire-server', protocolVersion: 1 }),
    })
  })
  await playerA.getByRole('button', { name: /^Create Room/i }).evaluate((button) => {
    ;(button as HTMLButtonElement).click()
    ;(button as HTMLButtonElement).click()
  })
  await expect(playerA.getByRole('button', { name: /Connecting/i })).toBeDisabled()
  await expect(playerA.getByText(/Waking the game server/i)).toBeVisible({ timeout: 7000 })
  expect(healthAttempts).toBe(1)
  expect(browserHealthRequests).toContain('http://127.0.0.1:4173/game-server/health')
  await playerA.getByRole('button', { name: 'Cancel' }).click()
  await expect(playerA.getByRole('button', { name: /Create Private Room/i })).toBeVisible()
  await playerA.unrouteAll({ behavior: 'wait' })
  await playerA.getByRole('button', { name: /Create Private Room/i }).click()
  await playerA.getByLabel('Your player name').fill('Atlas')
  await playerA.getByRole('button', { name: /^Create Room/i }).click()
  const roomCode = (await playerA.locator('[data-room-code]').textContent())?.trim()
  expect(roomCode).toMatch(/^[A-Z2-9]{6}$/)
  await expect(playerA.getByRole('button', { name: /Connecting/i })).toHaveCount(0)

  const resolution = await request.get(`http://127.0.0.1:2677/api/private-rooms/${roomCode}`, {
    headers: { Origin: 'http://127.0.0.1:4173' },
  })
  expect(resolution.ok()).toBe(true)
  expect(resolution.headers()['access-control-allow-origin']).toBe('http://127.0.0.1:4173')

  await enterOnlineMenu(playerB)
  await playerB.getByRole('button', { name: /Join Private Room/i }).click()
  await playerB.getByLabel('Room code').fill(roomCode!)
  await playerB.getByLabel('Your player name').fill('Briar')
  await playerB.getByRole('button', { name: /^Join Room/i }).click()

  await expect(playerA.getByText('Briar')).toBeVisible()
  await expect(playerB.getByText('Atlas')).toBeVisible()
  await playerA.getByRole('button', { name: 'Ready Up' }).click()
  await playerB.getByRole('button', { name: 'Ready Up' }).click()
  await expect(playerA.locator('canvas')).toBeVisible()
  await expect(playerB.locator('canvas')).toBeVisible()
  await expect.poll(() => serverTick(playerA)).toBeGreaterThan(0)
  await expect.poll(() => serverTick(playerB)).toBeGreaterThan(0)
  expect(Math.abs((await serverTick(playerA)) - (await serverTick(playerB)))).toBeLessThan(8)
  await expect(playerA.locator('canvas')).toHaveAttribute('data-wind', /-?\d+/)
  expect(await playerA.locator('canvas').getAttribute('data-wind')).toBe(
    await playerB.locator('canvas').getAttribute('data-wind'),
  )
  expect(await statusNumber(playerA, 'data-wind')).toBe(await statusNumber(playerB, 'data-wind'))

  await playerA.locator('canvas').focus()
  await playerA.keyboard.press('Space')
  await expect.poll(() => statusNumber(playerA, 'data-projectile-count')).toBeGreaterThan(0)
  await expect.poll(() => statusNumber(playerB, 'data-projectile-count')).toBeGreaterThan(0)
  await expect.poll(() => statusNumber(playerA, 'data-terrain-sequence')).toBeGreaterThan(0)
  expect(await statusNumber(playerA, 'data-terrain-sequence')).toBe(
    await statusNumber(playerB, 'data-terrain-sequence'),
  )
  await expect
    .poll(async () => Number(await playerA.locator('canvas').getAttribute('data-explosion-count')))
    .toBeGreaterThan(0)
  await expect
    .poll(async () => Number(await playerB.locator('canvas').getAttribute('data-explosion-count')))
    .toBeGreaterThan(0)
  const explosionsA = Number(await playerA.locator('canvas').getAttribute('data-explosion-count'))
  const explosionsB = Number(await playerB.locator('canvas').getAttribute('data-explosion-count'))
  expect(explosionsA).toBe(1)
  expect(explosionsA).toBe(explosionsB)
  await expect
    .poll(async () => Number(await playerA.locator('canvas').getAttribute('data-damage-count')))
    .toBeGreaterThan(0)
  expect(await playerA.locator('canvas').getAttribute('data-damage-count')).toBe(
    await playerB.locator('canvas').getAttribute('data-damage-count'),
  )

  const tickBeforeMove = await serverTick(playerA)
  await playerA.locator('canvas').focus()
  await playerA.keyboard.down('d')
  await playerA.waitForTimeout(180)
  await playerA.keyboard.up('d')
  await expect.poll(() => serverTick(playerB)).toBeGreaterThan(tickBeforeMove)

  await playerB.reload()
  await expect(playerA.getByRole('heading', { name: /Opponent reconnecting/i })).toBeVisible()
  await expect(playerB.locator('canvas')).toBeVisible({ timeout: 15_000 })
  await expect(playerA.getByRole('heading', { name: /Opponent reconnecting/i })).toBeHidden({
    timeout: 15_000,
  })
  expect(await playerB.locator('canvas').getAttribute('data-explosion-count')).toBe('0')
  expect(await playerB.locator('canvas').getAttribute('data-damage-count')).toBe('0')
  const simulatedResult = await request.post(
    `http://127.0.0.1:2677/__test/private-rooms/${roomCode}/result`,
  )
  expect(simulatedResult.ok()).toBe(true)

  await expect(playerA.getByText('MATCH COMPLETE')).toBeVisible({ timeout: 10_000 })
  await expect(playerB.getByText('MATCH COMPLETE')).toBeVisible({ timeout: 10_000 })
  await playerA.getByRole('button', { name: 'Vote Rematch' }).click()
  await playerB.getByRole('button', { name: 'Vote Rematch' }).click()
  await expect(playerA.getByText('MATCH COMPLETE')).toBeHidden()
  await expect(playerB.getByText('MATCH COMPLETE')).toBeHidden()
  await expect(playerA.locator('.online-match-status')).toHaveAttribute(
    'data-match-generation',
    '2',
  )
  await expect(playerB.locator('.online-match-status')).toHaveAttribute(
    'data-match-generation',
    '2',
  )
  await expect(playerA.locator('canvas')).toHaveAttribute('data-effect-count', '0')
  await expect(playerB.locator('canvas')).toHaveAttribute('data-effect-count', '0')
  await expect(playerA.locator('.online-match-status')).toHaveAttribute('data-event-sequence', '0')
  await expect(playerB.locator('.online-match-status')).toHaveAttribute('data-event-sequence', '0')
  expect(await playerA.locator('canvas').getAttribute('data-wind')).toBe(
    await playerB.locator('canvas').getAttribute('data-wind'),
  )

  await expect.poll(() => serverTick(playerA)).toBeGreaterThan(0)
  const secondResult = await request.post(
    `http://127.0.0.1:2677/__test/private-rooms/${roomCode}/result`,
  )
  expect(secondResult.ok()).toBe(true)
  await expect(playerA.getByText('MATCH COMPLETE')).toBeVisible()
  await expect(playerB.getByText('MATCH COMPLETE')).toBeVisible()

  await Promise.all([
    playerA.getByRole('button', { name: 'Main Menu' }).click(),
    playerB.getByRole('button', { name: 'Main Menu' }).click(),
  ])
  for (const page of [playerA, playerB]) {
    await expect(page.getByRole('button', { name: /Play Online/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Unable to start' })).toHaveCount(0)
    await expect(page.getByText(/Reconnecting/i)).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate((key) => sessionStorage.getItem(key), 'toybox-artillery:online-reconnection'),
      )
      .toBeNull()
  }

  await playerA.waitForTimeout(1500)
  await playerB.waitForTimeout(1500)
  await expect(playerA.getByRole('heading', { name: 'Unable to start' })).toHaveCount(0)
  await expect(playerB.getByRole('heading', { name: 'Unable to start' })).toHaveCount(0)
  await expect(playerA.locator('canvas')).toHaveCount(0)
  await expect(playerB.locator('canvas')).toHaveCount(0)

  await playerA.getByRole('button', { name: /Play Online/i }).click()
  await playerA.getByRole('button', { name: /Create Private Room/i }).click()
  await playerA.getByRole('button', { name: /^Create Room/i }).click()
  await expect(playerA.locator('[data-room-code]')).toBeVisible()
  await expect(playerA.getByRole('heading', { name: 'Unable to start' })).toHaveCount(0)
  expect(browserHealthRequests.every((url) => url.startsWith('http://127.0.0.1:4173/'))).toBe(true)
  expect(browserRoomLookups).toContain(
    `http://127.0.0.1:4173/game-server/api/private-rooms/${roomCode}`,
  )
  expect(corsErrors).toEqual([])

  await contextA.close()
  await contextB.close()
})
