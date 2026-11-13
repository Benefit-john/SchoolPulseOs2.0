import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

type MusicContextValue = {
  enabled: boolean;
  isPlaying: boolean;
  setEnabled: (enabled: boolean) => void;
};
const MusicContext = createContext<MusicContextValue | null>(null);
const guestKey = "schoolpulse-music:guest";
const userKey = (id: string) => `schoolpulse-music:${id}`;

function readEnabled(key: string) {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(key) !== "off";
}

export function BackgroundMusic({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  const [storageKey, setStorageKey] = useState(guestKey);
  const [enabled, setEnabledState] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active || !data.session?.user) return;
        const key = userKey(data.session.user.id);
        setStorageKey(key);
        setEnabledState(readEnabled(key));
      })
      .catch(() => undefined);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const key = session?.user ? userKey(session.user.id) : guestKey;
      setStorageKey(key);
      setEnabledState(readEnabled(key));
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tryStart = () => {
      if (!enabled) return;
      const audio = audioRef.current;
      if (!audio || !audio.paused) return;
      audio.volume = 0.16;
      void audio
        .play()
        .then(() => {
          startedRef.current = true;
          setIsPlaying(true);
        })
        .catch(() => {
          startedRef.current = false;
          setIsPlaying(false);
        });
    };
    window.addEventListener("pointerdown", tryStart, { passive: true });
    window.addEventListener("keydown", tryStart, { passive: true });
    window.addEventListener("touchstart", tryStart, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", tryStart);
      window.removeEventListener("keydown", tryStart);
      window.removeEventListener("touchstart", tryStart);
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled) return;
    const audio = audioRef.current;
    audio?.pause();
    if (audio) audio.currentTime = 0;
    setIsPlaying(false);
    startedRef.current = false;
  }, [enabled]);

  const value = useMemo<MusicContextValue>(
    () => ({
      enabled,
      isPlaying,
      setEnabled: (next) => {
        setEnabledState(next);
        if (typeof window !== "undefined")
          window.localStorage.setItem(storageKey, next ? "on" : "off");
      },
    }),
    [enabled, isPlaying, storageKey],
  );

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  return (
    <MusicContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        loop
        preload="none"
        aria-hidden="true"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        <source src="/audio/stillness-loop.mp3" type="audio/mpeg" />
      </audio>
    </MusicContext.Provider>
  );
}

export function useBackgroundMusic() {
  const value = useContext(MusicContext);
  if (!value) throw new Error("useBackgroundMusic must be used inside BackgroundMusic");
  return value;
}
