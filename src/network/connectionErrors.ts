export type OnlineConnectionErrorCode =
  | 'offline'
  | 'wake-timeout'
  | 'server-http'
  | 'invalid-response'
  | 'protocol-incompatible'
  | 'health-network'
  | 'realtime'
  | 'reconnect'
  | 'unknown-network'

export class OnlineConnectionError extends Error {
  constructor(
    readonly code: OnlineConnectionErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'OnlineConnectionError'
  }
}

function browserIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function healthNetworkError(): OnlineConnectionError {
  return browserIsOffline()
    ? new OnlineConnectionError(
        'offline',
        'Your browser appears to be offline. Check your connection and try again.',
      )
    : new OnlineConnectionError(
        'health-network',
        'A browser privacy extension or network filter may be blocking the game connection. Allow this site and try again.',
      )
}

export function realtimeConnectionError(): OnlineConnectionError {
  return browserIsOffline()
    ? new OnlineConnectionError(
        'offline',
        'Your browser appears to be offline. Check your connection and try again.',
      )
    : new OnlineConnectionError(
        'realtime',
        'The game server is reachable, but the realtime connection could not be opened. A privacy extension, VPN, firewall, or network filter may be blocking WebSocket access.',
      )
}

export function reconnectConnectionError(): OnlineConnectionError {
  return browserIsOffline()
    ? new OnlineConnectionError(
        'offline',
        'Your browser appears to be offline. Check your connection and try again.',
      )
    : new OnlineConnectionError(
        'reconnect',
        'The realtime connection could not be restored. A privacy extension, VPN, firewall, or network filter may be blocking WebSocket access.',
      )
}

export function unknownNetworkError(): OnlineConnectionError {
  return browserIsOffline()
    ? new OnlineConnectionError(
        'offline',
        'Your browser appears to be offline. Check your connection and try again.',
      )
    : new OnlineConnectionError(
        'unknown-network',
        'The game server could not be reached. Check the connection and try again.',
      )
}
