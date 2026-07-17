import { describe, expect, it } from 'vitest'
import { GameTicketStore } from './gameTickets'

describe('GameTicketStore', () => {
  it('issues an opaque 256-bit base64url ticket', () => {
    const ticket = new GameTicketStore().issue('user_one', 0)

    expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('allows a ticket to be consumed only once', () => {
    const store = new GameTicketStore({ createTicket: () => 'ticket' })
    const ticket = store.issue('user_one', 100)

    expect(store.consume(ticket, 101)).toBe('user_one')
    expect(store.consume(ticket, 102)).toBeNull()
  })

  it('rejects and removes an expired ticket', () => {
    const store = new GameTicketStore({ ttlMs: 50, createTicket: () => 'ticket' })
    const ticket = store.issue('user_one', 100)

    expect(store.consume(ticket, 150)).toBeNull()
    expect(store.consume(ticket, 149)).toBeNull()
  })

  it('evicts the oldest live ticket when capacity is reached', () => {
    const tickets = ['first', 'second', 'third']
    const store = new GameTicketStore({
      maxTickets: 2,
      createTicket: () => tickets.shift()!,
    })

    const first = store.issue('user_one', 0)
    const second = store.issue('user_two', 1)
    const third = store.issue('user_three', 2)

    expect(store.consume(first, 3)).toBeNull()
    expect(store.consume(second, 3)).toBe('user_two')
    expect(store.consume(third, 3)).toBe('user_three')
  })
})
