import { useQuery } from "@tanstack/react-query";
import { providersApi } from "@/lib/api";

const mimocodeKeys = {
  all: ["mimocode"] as const,
  liveProviderIds: ["mimocode", "liveProviderIds"] as const,
};

export function useMimocodeLiveProviderIds(enabled: boolean) {
  return useQuery({
    queryKey: mimocodeKeys.liveProviderIds,
    queryFn: () => providersApi.getMimocodeLiveProviderIds(),
    enabled,
  });
}
