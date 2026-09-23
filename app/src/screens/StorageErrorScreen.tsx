import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { space } from '../theme/tokens';
import { useStore } from '../data/store';
import { PrimaryButton } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Body, Title } from '../components/Type';

/**
 * Shown when storage will not answer, instead of an empty app.
 *
 * This screen exists because the alternative is far worse than an error: an
 * app that opens on blank defaults looks like a wiped account, and the first
 * debounced write would then make that true. Nothing is persisted while this
 * is on screen, so the data on disk — if it is there — is untouched.
 *
 * There is deliberately no "continue anyway": continuing means writing, and
 * writing is the thing that would destroy the log.
 */
export function StorageErrorScreen() {
  const { colors } = useTheme();
  const { retryHydration } = useStore();
  const [tries, setTries] = useState(0);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.page,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xxl,
        gap: space.md,
      }}
    >
      <Icon name="caution" size={34} color={colors.accent} strokeWidth={1.4} />
      <Title style={{ fontSize: 22, textAlign: 'center' }}>Couldn't open your data</Title>
      <Body
        style={{ fontSize: 14.5, lineHeight: 22, textAlign: 'center' }}
        color={colors.muted}
      >
        This phone's storage did not respond, so your log has not been loaded. Nothing has been
        changed or deleted — the app is waiting rather than starting empty.
      </Body>

      <PrimaryButton
        label="Try again"
        onPress={() => {
          setTries((n) => n + 1);
          retryHydration();
        }}
        style={{ alignSelf: 'stretch', marginTop: space.sm }}
      />

      {tries > 0 && (
        <Body
          style={{ fontSize: 13, lineHeight: 20, textAlign: 'center' }}
          color={colors.muted}
        >
          Still no answer. Closing the app completely and reopening it usually clears this; if the
          phone is very low on free space, freeing some up will too.
        </Body>
      )}
    </View>
  );
}
