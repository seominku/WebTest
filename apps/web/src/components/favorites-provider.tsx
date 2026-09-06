"use client";

import type {
  FavoriteListingsResponse,
  PublicListingSummary,
} from "@real-estate/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./auth-provider";

interface FavoritesContextValue {
  items: PublicListingSummary[];
  isFavorite: (listingId: string) => boolean;
  loading: boolean;
  pendingIds: Set<string>;
  toggle: (listing: PublicListingSummary) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { authenticatedRequest, user } = useAuth();
  const [items, setItems] = useState<PublicListingSummary[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState(new Set<string>());

  useEffect(() => {
    if (!user) return;
    let active = true;
    void apiRequest<FavoriteListingsResponse>("/listings/favorites")
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setLoadedUserId(user.id);
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setLoadedUserId(user.id);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const visibleItems = useMemo(
    () => (user && loadedUserId === user.id ? items : []),
    [items, loadedUserId, user],
  );
  const loading = Boolean(user && loadedUserId !== user.id);

  const favoriteIds = useMemo(
    () => new Set(visibleItems.map((item) => item.id)),
    [visibleItems],
  );

  const toggle = useCallback(
    async (listing: PublicListingSummary): Promise<void> => {
      if (!user || pendingIds.has(listing.id)) return;
      const wasFavorite = favoriteIds.has(listing.id);
      setPendingIds((current) => new Set(current).add(listing.id));
      setItems((current) =>
        wasFavorite
          ? current.filter((item) => item.id !== listing.id)
          : [listing, ...current],
      );
      try {
        await authenticatedRequest(`/listings/${listing.id}/favorite`, {
          body: "{}",
          method: wasFavorite ? "DELETE" : "POST",
        });
      } catch (error) {
        setItems((current) =>
          wasFavorite
            ? [listing, ...current]
            : current.filter((item) => item.id !== listing.id),
        );
        throw error;
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(listing.id);
          return next;
        });
      }
    },
    [authenticatedRequest, favoriteIds, pendingIds, user],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      isFavorite: (listingId) => favoriteIds.has(listingId),
      items: visibleItems,
      loading,
      pendingIds,
      toggle,
    }),
    [favoriteIds, loading, pendingIds, toggle, visibleItems],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const value = useContext(FavoritesContext);
  if (!value)
    throw new Error("useFavorites must be used inside FavoritesProvider");
  return value;
}
