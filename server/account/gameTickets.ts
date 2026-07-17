import { randomBytes } from 'node:crypto'

const TICKET_TTL_MS = 60_000
const MAX_TICKETS = 10_000

type TicketRecord = {
  clerkUserId: string
  expiresAt: number
}

type GameTicketStoreOptions = {
  ttlMs?: number
  maxTickets?: number
  createTicket?: () => string
}

export class GameTicketStore {
  private readonly tickets = new Map<string, TicketRecord>()
  private readonly ttlMs: number
  private readonly maxTickets: number
  private readonly createTicket: () => string

  constructor(options: GameTicketStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? TICKET_TTL_MS
    this.maxTickets = options.maxTickets ?? MAX_TICKETS
    this.createTicket = options.createTicket ?? (() => randomBytes(32).toString('base64url'))
  }

  issue(clerkUserId: string, now = Date.now()): string {
    this.cleanup(now)
    while (this.tickets.size >= this.maxTickets) {
      const oldest = this.tickets.keys().next().value
      if (oldest === undefined) break
      this.tickets.delete(oldest)
    }
    const ticket = this.createTicket()
    this.tickets.set(ticket, { clerkUserId, expiresAt: now + this.ttlMs })
    return ticket
  }

  consume(ticket: string, now = Date.now()): string | null {
    const record = this.tickets.get(ticket)
    if (!record) {
      this.cleanup(now)
      return null
    }
    this.tickets.delete(ticket)
    this.cleanup(now)
    return record.expiresAt > now ? record.clerkUserId : null
  }

  private cleanup(now: number): void {
    for (const [ticket, record] of this.tickets) {
      if (record.expiresAt <= now) this.tickets.delete(ticket)
    }
  }
}

export const gameTicketStore = new GameTicketStore()
