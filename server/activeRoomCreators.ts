class ActiveRoomCreatorRegistry {
  private readonly roomByUser = new Map<string, string>()
  private readonly userByRoom = new Map<string, string>()

  claim(clerkUserId: string, roomId: string): boolean {
    if (this.roomByUser.has(clerkUserId)) return false
    this.roomByUser.set(clerkUserId, roomId)
    this.userByRoom.set(roomId, clerkUserId)
    return true
  }

  release(roomId: string): void {
    const clerkUserId = this.userByRoom.get(roomId)
    if (!clerkUserId) return
    this.userByRoom.delete(roomId)
    if (this.roomByUser.get(clerkUserId) === roomId) this.roomByUser.delete(clerkUserId)
  }
}

export const activeRoomCreators = new ActiveRoomCreatorRegistry()
