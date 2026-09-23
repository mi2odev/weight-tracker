import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardEvent, LayoutChangeEvent, Platform } from 'react-native';

import { keyboardOverlap } from '../lib/keyboardOverlap';

/**
 * How much of a container the software keyboard is actually covering.
 *
 * Not simply the keyboard's height. On Android the system often shrinks the
 * window (or a modal's window) to make room for the keys itself, and on iOS
 * it never does. Adding the full keyboard height on a phone that had already
 * shrunk the window lifted things twice — a meal sheet ended up pushed off
 * the top of the screen with a gap of dimmed backdrop above the keys.
 *
 * So the container reports its height through `onLayout`: the tallest height
 * seen with the keyboard down is its full size, and however much it has
 * shrunk since is room the system already made. Only the rest needs adding.
 *
 * iOS gets `willShow`/`willHide`, which fire with the animation. Android only
 * has `did*`, so the change lands a frame after the keys appear.
 */
export function useKeyboardInset(): {
  /** Extra room to leave at the foot of the container. */
  inset: number;
  /** True while the keyboard is up. */
  open: boolean;
  /** The container's current height, 0 before its first layout. */
  height: number;
  /** Attach to the container that spans the space the keyboard could cover. */
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const [keyboard, setKeyboard] = useState(0);
  const [height, setHeight] = useState(0);
  const fullHeight = useRef(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setKeyboard(event.endCoordinates?.height ?? 0);
    });
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboard(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const h = event.nativeEvent.layout.height;
      // With the keys down, whatever height we have is the full one (this
      // also follows rotation and split screen). Asked of the keyboard
      // directly: the shrink can arrive a frame before the show event.
      if (!Keyboard.isVisible() || h > fullHeight.current) fullHeight.current = h;
      setHeight(h);
    },
    [],
  );

  return {
    inset: keyboardOverlap(keyboard, fullHeight.current, height),
    open: keyboard > 0,
    height,
    onLayout,
  };
}
