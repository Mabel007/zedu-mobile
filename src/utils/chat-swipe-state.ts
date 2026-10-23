import AsyncStorage from '@react-native-async-storage/async-storage';
import { Chat } from '@/types/chats';

export interface ChatSwipeFlags {
  muted: boolean;
  markedUnread: boolean;
}

export type SwipeFlagAction = 'mute' | 'unmute' | 'markUnread' | 'clearMarkedUnread';

const STORAGE_PREFIX = 'chat-swipe-state';

export const swipeStorageKey = (orgId: string | null | undefined, channelId: string): string =>
  `${STORAGE_PREFIX}:${orgId ?? 'none'}:${channelId}`;

const EMPTY_FLAGS: ChatSwipeFlags = { muted: false, markedUnread: false };

export const parseSwipeFlags = (raw: string | null): ChatSwipeFlags => {
  if (!raw) return { ...EMPTY_FLAGS };
  try {
    const parsed = JSON.parse(raw);
    return {
      muted: Boolean(parsed && parsed.muted),
      markedUnread: Boolean(parsed && parsed.markedUnread),
    };
  } catch {
    return { ...EMPTY_FLAGS };
  }
};

export const serializeSwipeFlags = (flags: ChatSwipeFlags): string =>
  JSON.stringify({ muted: Boolean(flags.muted), markedUnread: Boolean(flags.markedUnread) });

export const loadChatSwipeFlags = async (
  orgId: string | null | undefined,
  channelId: string,
): Promise<ChatSwipeFlags> => {
  try {
    const raw = await AsyncStorage.getItem(swipeStorageKey(orgId, channelId));
    return parseSwipeFlags(raw);
  } catch {
    return { ...EMPTY_FLAGS };
  }
};

export const saveChatSwipeFlags = async (
  orgId: string | null | undefined,
  channelId: string,
  flags: ChatSwipeFlags,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(swipeStorageKey(orgId, channelId), serializeSwipeFlags(flags));
  } catch {
    // storage failures keep the in-memory state; state survives until app close
  }
};

export const applySwipeAction = (
  flags: ChatSwipeFlags,
  action: SwipeFlagAction,
): ChatSwipeFlags => {
  switch (action) {
    case 'mute':
      return { ...flags, muted: true };
    case 'unmute':
      return { ...flags, muted: false };
    case 'markUnread':
      return { ...flags, markedUnread: true };
    case 'clearMarkedUnread':
      return { ...flags, markedUnread: false };
    default:
      return flags;
  }
};

// A locally marked-unread row always shows at least one unread item so the
// state is visible even when the server has already cleared the thread count.
export const effectiveUnreadCount = (chat: Pick<Chat, 'thread_count'>, flags: ChatSwipeFlags): number => {
  const base = chat.thread_count ?? 0;
  if (!flags.markedUnread) return base;
  return Math.max(base, 1);
};
