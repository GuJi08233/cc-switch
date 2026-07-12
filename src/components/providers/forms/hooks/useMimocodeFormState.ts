import { useState, useCallback } from "react";
import type { OpenCodeModel, OpenCodeProviderConfig } from "@/types";
import {
  OPENCODE_DEFAULT_NPM,
  parseOpencodeConfig,
} from "../helpers/opencodeFormUtils";

interface UseMimocodeFormStateParams {
  initialData?: {
    settingsConfig?: Record<string, unknown>;
  };
  appId: string;
  providerId?: string;
  onSettingsConfigChange: (config: string) => void;
  getSettingsConfig: () => string;
}

export interface MimocodeFormState {
  mimocodeProviderKey: string;
  setMimocodeProviderKey: (key: string) => void;
  mimocodeNpm: string;
  mimocodeApiKey: string;
  mimocodeBaseUrl: string;
  mimocodeHeaders: Record<string, string>;
  mimocodeModels: Record<string, OpenCodeModel>;
  mimocodeExtraOptions: Record<string, string>;
  existingMimocodeKeys: string[];
  handleMimocodeNpmChange: (npm: string) => void;
  handleMimocodeApiKeyChange: (apiKey: string) => void;
  handleMimocodeBaseUrlChange: (baseUrl: string) => void;
  handleMimocodeHeadersChange: (headers: Record<string, string>) => void;
  handleMimocodeModelsChange: (models: Record<string, OpenCodeModel>) => void;
  handleMimocodeExtraOptionsChange: (options: Record<string, string>) => void;
  resetMimocodeState: (config?: OpenCodeProviderConfig) => void;
}

export function useMimocodeFormState({
  initialData,
  appId,
  providerId,
  onSettingsConfigChange,
  getSettingsConfig,
}: UseMimocodeFormStateParams): MimocodeFormState {
  const initialMimocodeConfig =
    appId === "mimocode"
      ? parseOpencodeConfig(initialData?.settingsConfig)
      : null;
  const initialMimocodeOptions = initialMimocodeConfig?.options || {};

  const [mimocodeProviderKey, setMimocodeProviderKey] = useState<string>(() => {
    if (appId !== "mimocode") return "";
    return providerId || "";
  });

  const [mimocodeNpm, setMimocodeNpm] = useState<string>(() => {
    if (appId !== "mimocode") return OPENCODE_DEFAULT_NPM;
    return initialMimocodeConfig?.npm || OPENCODE_DEFAULT_NPM;
  });

  const [mimocodeApiKey, setMimocodeApiKey] = useState<string>(() => {
    if (appId !== "mimocode") return "";
    return (initialMimocodeOptions.apiKey as string) || "";
  });

  const [mimocodeBaseUrl, setMimocodeBaseUrl] = useState<string>(() => {
    if (appId !== "mimocode") return "";
    return (initialMimocodeOptions.baseURL as string) || "";
  });

  const [mimocodeHeaders, setMimocodeHeaders] = useState<
    Record<string, string>
  >(() => {
    if (appId !== "mimocode") return {};
    return (initialMimocodeOptions.headers as Record<string, string>) || {};
  });

  const [mimocodeModels, setMimocodeModels] = useState<
    Record<string, OpenCodeModel>
  >(() => {
    if (appId !== "mimocode") return {};
    return initialMimocodeConfig?.models || {};
  });

  const [mimocodeExtraOptions, setMimocodeExtraOptions] = useState<
    Record<string, string>
  >(() => {
    if (appId !== "mimocode") return {};
    return (
      (initialMimocodeOptions as Record<string, string>) || {}
    );
  });

  const syncToSettingsConfig = useCallback(
    (updates: Partial<OpenCodeProviderConfig>) => {
      try {
        const current = JSON.parse(getSettingsConfig());
        const merged = { ...current, ...updates };
        onSettingsConfigChange(JSON.stringify(merged));
      } catch {
        onSettingsConfigChange(JSON.stringify(updates));
      }
    },
    [getSettingsConfig, onSettingsConfigChange],
  );

  const handleMimocodeNpmChange = useCallback(
    (npm: string) => {
      setMimocodeNpm(npm);
      syncToSettingsConfig({ npm });
    },
    [syncToSettingsConfig],
  );

  const handleMimocodeApiKeyChange = useCallback(
    (apiKey: string) => {
      setMimocodeApiKey(apiKey);
      syncToSettingsConfig({
        options: { apiKey, baseURL: mimocodeBaseUrl, headers: mimocodeHeaders },
      });
    },
    [mimocodeBaseUrl, mimocodeHeaders, syncToSettingsConfig],
  );

  const handleMimocodeBaseUrlChange = useCallback(
    (baseUrl: string) => {
      setMimocodeBaseUrl(baseUrl);
      syncToSettingsConfig({
        options: {
          apiKey: mimocodeApiKey,
          baseURL: baseUrl,
          headers: mimocodeHeaders,
        },
      });
    },
    [mimocodeApiKey, mimocodeHeaders, syncToSettingsConfig],
  );

  const handleMimocodeHeadersChange = useCallback(
    (headers: Record<string, string>) => {
      setMimocodeHeaders(headers);
      syncToSettingsConfig({
        options: {
          apiKey: mimocodeApiKey,
          baseURL: mimocodeBaseUrl,
          headers,
        },
      });
    },
    [mimocodeApiKey, mimocodeBaseUrl, syncToSettingsConfig],
  );

  const handleMimocodeModelsChange = useCallback(
    (models: Record<string, OpenCodeModel>) => {
      setMimocodeModels(models);
      syncToSettingsConfig({ models });
    },
    [syncToSettingsConfig],
  );

  const handleMimocodeExtraOptionsChange = useCallback(
    (options: Record<string, string>) => {
      setMimocodeExtraOptions(options);
      syncToSettingsConfig({ options });
    },
    [syncToSettingsConfig],
  );

  const resetMimocodeState = useCallback(
    (config?: OpenCodeProviderConfig) => {
      if (!config) {
        setMimocodeNpm(OPENCODE_DEFAULT_NPM);
        setMimocodeApiKey("");
        setMimocodeBaseUrl("");
        setMimocodeHeaders({});
        setMimocodeModels({});
        setMimocodeExtraOptions({});
        return;
      }
      setMimocodeNpm(config.npm || OPENCODE_DEFAULT_NPM);
      setMimocodeApiKey((config.options?.apiKey as string) || "");
      setMimocodeBaseUrl((config.options?.baseURL as string) || "");
      setMimocodeHeaders(
        (config.options?.headers as Record<string, string>) || {},
      );
      setMimocodeModels(config.models || {});
      setMimocodeExtraOptions(
        (config.options as Record<string, string>) || {},
      );
    },
    [],
  );

  return {
    mimocodeProviderKey,
    setMimocodeProviderKey,
    mimocodeNpm,
    mimocodeApiKey,
    mimocodeBaseUrl,
    mimocodeHeaders,
    mimocodeModels,
    mimocodeExtraOptions,
    existingMimocodeKeys: [], // Will be populated from live provider IDs
    handleMimocodeNpmChange,
    handleMimocodeApiKeyChange,
    handleMimocodeBaseUrlChange,
    handleMimocodeHeadersChange,
    handleMimocodeModelsChange,
    handleMimocodeExtraOptionsChange,
    resetMimocodeState,
  };
}
