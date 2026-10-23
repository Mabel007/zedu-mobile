import React, { useRef } from 'react';
import { View, Alert } from 'react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { AppText } from '@/components/ui/text';
import { useTheme } from '@/theme/ThemeProvider';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { normalize } from '@/utils/normalize';
import { ChatSwipeFlags, SwipeFlagAction } from '@/utils/chat-swipe-state';
import { Chat } from '@/types/chats';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface SwipeActionConfig {
  icon: IoniconName;
  label: string;
  color: string;
  onPress: () => void;
}

interface ChatSwipeRowProps {
  chat: Chat;
  flags: ChatSwipeFlags;
  onFavoriteToggle: (chat: Chat) => Promise<boolean> | void;
  onFlagAction: (chat: Chat, action: SwipeFlagAction) => void;
  children: React.ReactNode;
}

const constructActions = (
  chat: Chat,
  flags: ChatSwipeFlags,
  props: ChatSwipeRowProps,
): { left: SwipeActionConfig[]; right: SwipeActionConfig[] } => {
  const left: SwipeActionConfig[] = [
    {
      icon: flags.muted ? 'notifications-off' : 'notifications-outline',
      label: flags.muted ? 'Unmute' : 'Mute',
      color: '#5C5C5C',
      onPress: () => props.onFlagAction(chat, flags.muted ? 'unmute' : 'mute'),
    },
    {
      icon: chat?.is_favourite ? 'star' : 'star-outline',
      label: chat?.is_favourite ? 'Unfavorite' : 'Favorite',
      color: '#C1272D',
      onPress: () => {
        props.onFavoriteToggle(chat);
      },
    },
  ];

  const right: SwipeActionConfig[] = [
    {
      icon: 'mail-unread-outline',
      label: 'Mark as unread',
      color: '#2360A5',
      onPress: () => props.onFlagAction(chat, 'markUnread'),
    },
  ];

  return { left, right };
};

export const ChatSwipeRow = (props: ChatSwipeRowProps) => {
  const { colors } = useTheme();
  const swipeableRef = useRef<Swipeable>(null);
  const { chat, flags } = props;

  const { left, right } = constructActions(chat, flags, props);

  const renderButtons = (configs: SwipeActionConfig[]) => {
    return (
      <View
        style={{
          flexDirection: configs.length > 1 ? 'row' : 'row-reverse',
        }}
      >
        {configs.map(config => (
          <RectButton
            key={config.label}
            style={{
              width: normalize(config.label.length > 8 ? 96 : 76),
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: config.color,
              paddingHorizontal: normalize(6),
            }}
            onPress={() => {
              swipeableRef.current?.close();
              config.onPress();
            }}
          >
            <Ionicons name={config.icon} size={20} color={colors.white} />
            <AppText size={11} variant="medium" style={{ color: colors.white, marginTop: 4 }}>
              {config.label}
            </AppText>
          </RectButton>
        ))}
      </View>
    );
  };

  const openLongPressMenu = () => {
    const buttons = constructActions(chat, flags, props);
    const all = [...buttons.left, ...buttons.right];

    Alert.alert(chat.username ?? 'Chat', 'Choose an action', [
      ...all.map(config => ({
        text: config.label,
        onPress: () => config.onPress(),
        style: 'default' as const,
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const base = props.children as React.ReactElement<{ style?: object | object[] }>;

  return (
    <Swipeable
      ref={swipeableRef}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => renderButtons(left)}
      renderRightActions={() => renderButtons(right)}
      childrenContainerStyle={{}}
    >
      {React.cloneElement(base, {
        style: [
          base.props.style,
          flags.muted && { opacity: 0.65 },
        ],
        onLongPress: openLongPressMenu,
      })}
    </Swipeable>
  );
};

export default ChatSwipeRow;
