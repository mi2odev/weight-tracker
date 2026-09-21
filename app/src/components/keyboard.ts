import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

/**
 * How much of the screen the software keyboard is currently covering.
 *
 * Used to make room rather than to move things: a scroll view given this much
 * extra padding at the foot can always bring its focused field into view, and
 * a bottom sheet given it as an offset sits above the keys instead of behind
 * them.
 *
 * iOS gets `willShow`/`willHide`, which fire with the animation so the layout
 * moves in step with the keyboard. Android only has `did*`, so the change
 * lands a frame after the keys appear — visible, but far better than a field
 * you cannot see at all.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const shown = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setHeight(event.endCoordinates?.height ?? 0);
    });
    const hidden = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
}
