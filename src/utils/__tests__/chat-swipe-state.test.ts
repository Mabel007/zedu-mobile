import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applySwipeAction,
  effectiveUnreadCount,
  loadChatSwipeFlags,
  parseSwipeFlags,
  serializeSwipeFlags,
  swipeStorageKey,
  saveChatSwipeFlags,
} from '../chat-swipe-state';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockedGetItem = AsyncStorage.getItem as jest.Mock;
const mockedSetItem = AsyncStorage.setItem as jest.Mock;

describe('chat-swipe-state', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('builds a storage key scoped to org and channel', () => {
    expect(swipeStorageKey('org1', 'ch1')).toBe('chat-swipe-state:org1:ch1');
    expect(swipeStorageKey(null, 'ch2')).toBe('chat-swipe-state:none:ch2');
  });

  it('parses stored flags defensively', () => {
    expect(parseSwipeFlags(null)).toEqual({ muted: false, markedUnread: false });
    expect(parseSwipeFlags('not-json')).toEqual({ muted: false, markedUnread: false });
    expect(parseSwipeFlags('{"muted":true}')).toEqual({ muted: true, markedUnread: false });
    expect(parseSwipeFlags('{"markedUnread":true,"muted":false}')).toEqual({
      muted: false,
      markedUnread: true,
    });
  });

  it('serializes flags to JSON', () => {
    expect(serializeSwipeFlags({ muted: true, markedUnread: true })).toBe(
      '{"muted":true,"markedUnread":true}',
    );
  });

  it('loads flags from storage', async () => {
    mockedGetItem.mockResolvedValue('{"muted":true,"markedUnread":false}');
    await expect(loadChatSwipeFlags('org1', 'ch1')).resolves.toEqual({
      muted: true,
      markedUnread: false,
    });
  });

  it('never throws when storage fails', async () => {
    mockedGetItem.mockRejectedValue(new Error('disk error'));
    await expect(loadChatSwipeFlags('org1', 'ch1')).resolves.toEqual({
      muted: false,
      markedUnread: false,
    });
  });

  it('applies each action independently', () => {
    const base = { muted: false, markedUnread: false };

    expect(applySwipeAction(base, 'mute')).toEqual({ muted: true, markedUnread: false });
    expect(applySwipeAction(base, 'unmute')).toEqual({ muted: false, markedUnread: false });
    expect(applySwipeAction(base, 'markUnread')).toEqual({ muted: false, markedUnread: true });
    expect(
      applySwipeAction({ muted: true, markedUnread: true }, 'clearMarkedUnread'),
    ).toEqual({ muted: true, markedUnread: false });
  });

  it('does not mutate the input flags object', () => {
    const base = { muted: false, markedUnread: false };
    applySwipeAction(base, 'mute');
    expect(base).toEqual({ muted: false, markedUnread: false });
  });

  it('keeps at least one unread item while marked unread', () => {
    expect(
      effectiveUnreadCount({ thread_count: 4 }, { muted: false, markedUnread: true }),
    ).toBe(4);
    expect(
      effectiveUnreadCount({ thread_count: 0 }, { muted: false, markedUnread: true }),
    ).toBe(1);
    expect(
      effectiveUnreadCount({ thread_count: 0 }, { muted: false, markedUnread: false }),
    ).toBe(0);
  });

  it('saves flags without throwing on storage failure', async () => {
    mockedSetItem.mockRejectedValue(new Error('disk error'));
    await expect(
      saveChatSwipeFlags('org1', 'ch1', { muted: true, markedUnread: false }),
    ).resolves.toBeUndefined();
  });
});
