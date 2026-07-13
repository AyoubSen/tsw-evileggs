import { expect, test, type Page } from '@playwright/test'

const enterOnlineMenu = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Play Online/i }).click()
}

const serverTick = async (page: Page) =>
  Number(await page.locator('.online-match-status').getAttribute('data-server-tick'))

test('private room authority, reconnect, result, and rematch', async ({ browser, request }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const playerA = await contextA.newPage()
  const playerB = await contextB.newPage()

  await enterOnlineMenu(playerA)
  await playerA.getByRole('button', { name: /Create Private Room/i }).click()
  await playerA.getByLabel('Your player name').fill('Atlas')
  await playerA.getByRole('button', { name: /^Create Room/i }).click()
  const roomCode = (await playerA.locator('[data-room-code]').textContent())?.trim()
  expect(roomCode).toMatch(/^[A-Z2-9]{6}$/)

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

  await contextA.close()
  await contextB.close()
})
