import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import {
  Keyboard,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

/** Space kept between the field being typed in and the edge of the view. */
const MARGIN = 24;

/**
 * Keeps the field being typed in visible inside a scroll view.
 *
 * Android shrinks the window for the keyboard, but a scroll view does not
 * follow the focused field on its own — least of all a multiline one that
 * grows a line at a time, like Notes, whose new lines kept landing behind
 * the keys. This scrolls just far enough to show the focused input when the
 * keyboard opens, and again whenever something calls `reveal` (a notes field
 * growing).
 */
export function useRevealFocused() {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollY = useRef(0);
  const viewport = useRef(0);

  const reveal = useCallback(() => {
    const state = TextInput.State as { currentlyFocusedInput?: () => unknown } | undefined;
    const input = state?.currentlyFocusedInput?.() as
      | { measureLayout?: (rel: unknown, ok: (x: number, y: number, w: number, h: number) => void, fail?: () => void) => void }
      | null
      | undefined;
    const content = contentRef.current;
    if (!input?.measureLayout || !content || !viewport.current) return;
    try {
      input.measureLayout(
        content,
        (_x, y, _w, h) => {
          const top = y - MARGIN;
          const bottom = y + h + MARGIN;
          const visibleBottom = scrollY.current + viewport.current;
          if (bottom > visibleBottom) {
            // Tall notes: keep the end, where the caret is, rather than the top.
            scrollRef.current?.scrollTo({ y: Math.max(0, bottom - viewport.current), animated: true });
          } else if (top < scrollY.current) {
            scrollRef.current?.scrollTo({ y: Math.max(0, top), animated: true });
          }
        },
        () => {},
      );
    } catch {
      // Not measurable here (web, or the field already gone) — nothing to do.
    }
  }, []);

  // The keyboard is up and the window has resized: bring the field into view.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => setTimeout(reveal, 60));
    return () => sub.remove();
  }, [reveal]);

  return {
    reveal,
    scrollProps: {
      ref: scrollRef,
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      },
      scrollEventThrottle: 16,
      onLayout: (e: LayoutChangeEvent) => {
        viewport.current = e.nativeEvent.layout.height;
      },
    },
    contentRef,
  };
}

/** Lets a field deep inside a screen ask to be kept in view as it grows. */
export const RevealContext = createContext<() => void>(() => {});
export const useReveal = () => useContext(RevealContext);
