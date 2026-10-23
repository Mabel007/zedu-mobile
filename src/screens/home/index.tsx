import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { ThemedRefreshControl } from '@/components/ui/themed-refresh-control';
import { AppText } from '@/components/ui/text';
import { normalize } from '@/utils/normalize';
import Container from '@/components/layout/container';
import { useTheme } from '@/theme/ThemeProvider';
import { createChatListStyles } from '@/theme/createChatListStyles';
import { AppPopover } from '@/components/layout/popover';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useDataContext } from '@/store/useDataContext';
import { useDMs } from '@/services/chat/chat-lists';
import moment from 'moment';
import ChatSkeleton from '@/components/skeleton/chat-skeleton';
import { Chat } from '@/types/chats';
import { ACTIONS } from '@/store/types';
import UseGetOrg from '@/services/org/get-org';
import GeneralNotificationConnection from '@/centrifugoo/general-notification-connection';
import { OneSignal } from 'react-native-onesignal';
import { ONESIGNAL_APP_ID } from '@env';
import { PostRequest, PutRequest } from '@/utils/requests';
import { RootStackParamList } from '@/navigation/navigator';
import { UserAvatarWithStatus } from '@/components/ui/user-avatar-with-status';
import { formatPreviewMessage } from '@/utils/message-text';
import ChatSwipeRow from '@/components/chat/chat-swipe-row';
import { ShowNotify } from '@/components/ui/toast';
import {
  ChatSwipeFlags,
  SwipeFlagAction,
  applySwipeAction,
  effectiveUnreadCount,
  loadChatSwipeFlags,
  saveChatSwipeFlags,
} from '@/utils/chat-swipe-state';

const EMPTY_SWIPE_FLAGS: ChatSwipeFlags = { muted: false, markedUnread: false };

const HomeScreen = () => {
  const navigation = useNavigation<DrawerNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useMemo(() => createChatListStyles(colors), [colors]);
  const { state, dispatch } = useDataContext();
  const { user, orgData, orgId, dms } = state;
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [_chatLoading, setChatLoading] = useState(false);
  const { loading, loadingMore, refresh, loadMore } = useDMs(orgId, search);
  const [swipeFlags, setSwipeFlags] = useState<Record<string, ChatSwipeFlags>>(
    {},
  );
  const swipeFlagsRef = React.useRef(swipeFlags);

  const totalUnreadCount =
    dms?.filter((i: Chat) => i.thread_count > 0).length || 0;
  const groupCount =
    dms?.filter((i: Chat) => i.channel_type !== 'dm').length || 0;

  const CATEGORY_LIST = [
    { id: 'All', label: 'All' },
    { id: 'Unread', label: `Unread  ${totalUnreadCount}` },
    { id: 'Groups', label: `Groups  ${groupCount}` },
    { id: 'Favorites', label: 'Favorites' },
  ];

  useEffect(() => {
    const getData = async () => {
      OneSignal.initialize(ONESIGNAL_APP_ID);
      const deviceToken = await OneSignal.User.pushSubscription.getIdAsync();
      const payload = { subscription_id: deviceToken };

      await PutRequest('/users/onesignal-subscription-id', payload);
    };
    getData();
  }, []);

  const filteredDms = useMemo(() => {
    if (!dms) return [];
    switch (activeCategory) {
      case 'Unread':
        return dms.filter((chat: Chat) => chat.thread_count > 0);
      case 'Groups':
        return dms.filter((chat: Chat) => chat.channel_type !== 'dm');
      case 'Favorites':
        return dms.filter((chat: Chat) => chat?.is_favourite);
      default:
        return dms;
    }
  }, [dms, activeCategory]);

  const handleNavigate = (props: Chat) => {
    if (props?.channel_id && swipeFlagsRef.current[props.channel_id]?.markedUnread) {
      setBothSwipeFlags(
        props.channel_id,
        applySwipeAction(swipeFlagsRef.current[props.channel_id], 'clearMarkedUnread'),
      );
    }
    if (props?.channel_type === 'dm') {
      dispatch({ type: ACTIONS.PARTICIPANT, payload: props.participants });
      dispatch({
        type: ACTIONS.DMS_CHAT,
        payload: { data: props.preview_thread, page: 1 },
      });

      navigation.navigate('ChatStack', {
        screen: 'ChatDetails',
        params: {
          participant_id: props?.participant_id,
          channel_id: props?.channel_id,
        },
      });
    } else {
      dispatch({ type: ACTIONS.PARTICIPANT, payload: props.participants });
      dispatch({
        type: ACTIONS.DMS_CHAT,
        payload: { data: props.preview_thread, page: 1 },
      });

      navigation.navigate('ChatStack', {
        screen: 'GroupChatDetails',
        params: {
          channel_id: props?.channel_id,
        },
      });
    }

    if (props?.thread_count > 0) {
      dispatch({
        type: ACTIONS.RESET_DM_THREAD_COUNT,
        payload: props?.channel_id,
      });
    }
    dispatch({ type: ACTIONS.CALLBACK, payload: !state?.callback });
  };

  const handleSuggestNavigate = async (props: Chat) => {
    setChatLoading(true);

    const firstPayload = {
      chat_type: 'user',
      participant_id: props?.participant_id,
    };

    const { data, error } = await PostRequest(
      `/organisations/${orgId}/dms`,
      firstPayload,
    );

    if (!error) {
      dispatch({ type: ACTIONS.PARTICIPANT, payload: data.data.participants });
      dispatch({ type: ACTIONS.DMS_CHAT, payload: { data: [], page: 1 } });
      navigation.navigate('ChatStack', {
        screen: 'ChatDetails',
        params: {
          participant_id: props?.participant_id,
          channel_id: data?.data?.channel_id,
        },
      });
    } else {
      setChatLoading(false);
    }
  };

  const setBothSwipeFlags = (
    channelId: string,
    flags: ChatSwipeFlags,
  ) => {
    setSwipeFlags(prev => ({ ...prev, [channelId]: flags }));
    swipeFlagsRef.current = { ...swipeFlagsRef.current, [channelId]: flags };
    saveChatSwipeFlags(orgId, channelId, flags);
  };

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const next: Record<string, ChatSwipeFlags> = {
        ...swipeFlagsRef.current,
      };
      const rows = (filteredDms || []).slice(0, 50);
      await Promise.all(
        rows.map(async (chat: Chat) => {
          if (!chat.channel_id) return;
          next[chat.channel_id] = await loadChatSwipeFlags(
            orgId,
            chat.channel_id,
          );
        }),
      );
      if (!cancelled) setSwipeFlags(next);
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [filteredDms]);

  const handleFlagAction = (chat: Chat, action: SwipeFlagAction) => {
    if (!chat?.channel_id) return;
    const previous =
      swipeFlagsRef.current[chat.channel_id] ?? { ...EMPTY_SWIPE_FLAGS };
    const next = applySwipeAction(previous, action);
    setBothSwipeFlags(chat.channel_id, next);

    const messages: Record<SwipeFlagAction, string> = {
      mute: 'Chat muted',
      unmute: 'Chat unmuted',
      markUnread: 'Marked as unread',
      clearMarkedUnread: 'Unread mark cleared',
    };

    ShowNotify(messages[action], 'Tap to undo', undefined, () => {
      setBothSwipeFlags(chat.channel_id, previous);
    });
  };

  const handleFavoriteToggle = async (chat: Chat) => {
    if (!chat?.channel_id || !orgId) return;
    const wasFavorite = Boolean(chat.is_favourite);
    const list = (dms || []).map((c: Chat) =>
      c.channel_id === chat.channel_id ? { ...c, is_favourite: !wasFavorite } : c,
    );
    dispatch({ type: ACTIONS.DMS, payload: list });

    const { error } = await PostRequest(
      `/organisations/${orgId}/dms/${chat.channel_id}/favourite`,
      {},
    );

    if (!error) {
      ShowNotify(
        wasFavorite ? 'Removed from favorites' : 'Added to favorites',
        'Tap to undo',
        undefined,
        () => handleFavoriteToggle({ ...chat, is_favourite: !wasFavorite }),
      );
    } else {
      const reverted = (dms || []).map((c: Chat) =>
        c.channel_id === chat.channel_id ? { ...c, is_favourite: wasFavorite } : c,
      );
      dispatch({ type: ACTIONS.DMS, payload: reverted });
      ShowNotify(
        'Favorite action failed',
        'Tap to retry',
        undefined,
        () => handleFavoriteToggle(chat),
      );
    }
  };

  return (
    <Container color={colors.secondary} dark={true}>
      <GeneralNotificationConnection />
      <UseGetOrg />
      <View style={styles.topHeader}>
        <View style={styles.profileTop}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            onPress={() => navigation.openDrawer()}
          >
            {orgData?.logo_url ? (
              <Image
                source={{ uri: orgData?.logo_url }}
                style={styles.orgPic}
              />
            ) : (
              <View style={[styles.orgPic, styles.avatarPlaceholder]}>
                <AppText variant="bold" size={16} style={{ color: 'white' }}>
                  {orgData?.name?.charAt(0).toUpperCase()}
                </AppText>
              </View>
            )}
            <AppText variant="bold" size={16} style={{ color: 'white' }}>
              {orgData?.name}
            </AppText>
          </TouchableOpacity>

          <UserAvatarWithStatus user={user} />
        </View>

        <View style={styles.searchBar}>
          <Image
            source={require('@/assets/icons/search.png')}
            style={styles.searchIcon}
          />
          <TextInput
            placeholder="Find a conversation"
            placeholderTextColor={colors.white}
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
          {loading && search.length > 0 && (
            <ActivityIndicator size="small" color={colors.white} />
          )}
        </View>
      </View>

      <View style={styles.categoryContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORY_LIST.map(cat => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setActiveCategory(cat.id)}
              style={[
                styles.categoryBtn,
                activeCategory === cat.id && styles.activeCategoryBtn,
              ]}
            >
              <AppText
                size={13}
                variant="medium"
                style={{
                  color:
                    activeCategory === cat.id ? colors.white : colors.textMuted,
                }}
              >
                {cat.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ScrollView
          style={{
            paddingHorizontal: normalize(20),
            paddingTop: normalize(20),
          }}
          showsVerticalScrollIndicator={false}
        >
          {[1, 2, 3, 4, 5, 6].map(key => (
            <ChatSkeleton key={key} />
          ))}
        </ScrollView>
      ) : (
        <>
          {!loading && filteredDms?.length === 0 ? (
            <ScrollView
              refreshControl={
                <ThemedRefreshControl refreshing={false} onRefresh={refresh} />
              }
              contentContainerStyle={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Image
                source={require('@/assets/images/empty-chat.png')}
                style={{
                  objectFit: 'contain',
                  height: normalize(50),
                  marginTop: -200,
                }}
              />
            </ScrollView>
          ) : (
            <FlatList
              data={filteredDms}
              keyExtractor={item => item.channel_id || item.participant_id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                return (
                  <ChatSwipeRow
                    chat={item}
                    flags={swipeFlags[item.channel_id || ''] ?? EMPTY_SWIPE_FLAGS}
                    onFavoriteToggle={handleFavoriteToggle}
                    onFlagAction={handleFlagAction}
                  >
                    <TouchableOpacity
                      style={styles.chatItem}
                      onPress={() =>
                        item.is_suggested
                          ? handleSuggestNavigate(item)
                          : handleNavigate(item)
                      }
                    >
                    <View style={styles.avatarWrapper}>
                      {item.channel_type === 'group_dm' ? (
                        <View style={styles.groupAvatarContainer}>
                          {item.participants
                            ?.slice(0, 3)
                            .map((participant: any, index: number) => (
                              <Image
                                key={participant.user_id || index}
                                source={{
                                  uri:
                                    participant.avatar_url ||
                                    participant.default_avatar_url,
                                }}
                                style={[
                                  styles.groupAvatarItem,
                                  index === 0 && styles.groupAvatarMain,
                                  index === 1 && styles.groupAvatarTopRight,
                                  index === 2 && styles.groupAvatarBottomRight,
                                ]}
                              />
                            ))}
                        </View>
                      ) : (
                        <Image
                          source={{
                            uri: item.avatar_url || item.default_avatar_url,
                          }}
                          style={styles.chatAvatar}
                        />
                      )}
                    </View>

                    <View style={styles.chatInfo}>
                      <View style={styles.chatHeaderRow}>
                        <AppText
                          variant="bold"
                          size={14}
                          numberOfLines={1}
                          style={styles.chatName}
                        >
                          {item.username}
                        </AppText>
                        <AppText size={12} style={styles.chatTime}>
                          {moment(item.last_read_at).calendar(null, {
                            sameDay: 'h:mm a',
                            lastDay: '[Yesterday]',
                            lastWeek: 'dddd',
                            sameElse: 'DD/MM/YYYY',
                          })}
                        </AppText>
                      </View>

                      <View style={styles.chatFooterRow}>
                        <AppText
                          size={14}
                          numberOfLines={1}
                          style={styles.chatMsg}
                        >
                          {formatPreviewMessage(
                            item.preview_message || 'Chat with user',
                          )}
                        </AppText>
                        {!!effectiveUnreadCount(
                          item,
                          swipeFlags[item.channel_id || ''] ?? EMPTY_SWIPE_FLAGS,
                        ) && (
                          <View style={styles.countBadge}>
                            <AppText
                              size={12}
                              variant="bold"
                              style={styles.countText}
                            >
                              {effectiveUnreadCount(
                                item,
                                swipeFlags[item.channel_id || ''] ??
                                  EMPTY_SWIPE_FLAGS,
                              )}
                            </AppText>
                          </View>
                        )}
                      </View>
                    </View>
                    </TouchableOpacity>
                  </ChatSwipeRow>
                );
              }}
              onEndReached={loadMore}
              onEndReachedThreshold={0.1}
              refreshControl={
                <ThemedRefreshControl
                  refreshing={loading && dms.length > 0}
                  onRefresh={refresh}
                />
              }
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator
                    color={colors.primary}
                    style={{ marginVertical: 20 }}
                  />
                ) : null
              }
            />
          )}
        </>
      )}
      <AppPopover />
    </Container>
  );
};

export default HomeScreen;
