import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

/**
 * The software keyboard: whether it is up, and how much room the app has to
 * make for it itself.
 *
 * Android makes the room: the window (and a modal's window) is resized to end
 * at the top of the keys — `softwareKeyboardLayoutMode: "resize"` in
 * app.json, and what Expo Go does too. Adding the keyboard's height on top of
 * that lifted things twice, leaving a band of empty space between the app
 * and the keys. So on Android the inset is 0 and the resize does the work.
 *
 * iOS never resizes the window, so there the inset is the keyboard's height.
 * iOS also gets `willShow`/`willHide`, which fire with the animation; Android
 * only has `did*`.
 */
export function useKeyboard(): { open: boolean; inset: number } {
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

  return { open: height > 0, inset: Platform.OS === 'ios' ? height : 0 };
}
