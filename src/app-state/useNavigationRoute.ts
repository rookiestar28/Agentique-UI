import { useCallback, useEffect, useState } from "react";
import type { NavigationKey } from "../ui/navigation";
import { fallbackNavigationKey, normalizeNavigationKey, readNavigationHash, writeNavigationHash } from "./navigation-route.mjs";

type NavigationRouteState = {
  activeNav: NavigationKey;
  selectNav: (key: NavigationKey) => void;
};

function readCurrentNavigationKey(): NavigationKey {
  if (typeof window === "undefined") {
    return fallbackNavigationKey as NavigationKey;
  }
  return readNavigationHash(window.location) as NavigationKey;
}

export function useNavigationRoute(): NavigationRouteState {
  const [activeNav, setActiveNav] = useState<NavigationKey>(readCurrentNavigationKey);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveNav(readCurrentNavigationKey());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const selectNav = useCallback((key: NavigationKey) => {
    const nextKey = normalizeNavigationKey(key) as NavigationKey;
    setActiveNav(nextKey);
    if (typeof window !== "undefined") {
      writeNavigationHash(window.history, nextKey);
    }
  }, []);

  return { activeNav, selectNav };
}
